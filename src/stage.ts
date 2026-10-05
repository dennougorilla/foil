import { EDITIONS, editionById, type EditionId } from './editions';
import { BackgroundRenderer, CardRenderer, hexToRgb, type Particle, type RGB } from './gl/renderers';
import { sfx } from './audio';
import type { Store } from './state';
import { motion } from './tune/motion';
import { lampLights, loopCycle, roomShade, tuneGl } from './tune/model';
import { AUTO_LOOP, AUTO_STILL, AutoTouch, cardPoint, cardUv, HeatField, Swipe, SWIPES, type TouchKind } from './touch/heat';
import { flickDir } from './handStep';
import { QualityGovernor } from './quality';
import { cardLayers } from './layers';
import './stage-phone.css';
import { TORCH_DRIFT, TORCH_IDLE, torchAt } from './gl/torch';
import { cardK, contain, shapeById, type ShapeId } from './card/shape';

/** The card's proportions in units of its short side, for a heat grid. */
const kOf = (shape: ShapeId) => cardK(shapeById(shape).w, shapeById(shape).h);

export class Spring {
  v = 0;
  constructor(
    public x: number,
    public target: number,
    public k = 170,
    public d = 16,
  ) {}
  step(dt: number) {
    const a = this.k * (this.target - this.x) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
}

interface HandCard {
  id: EditionId;
  el: HTMLButtonElement;
  lift: Spring;
  scale: Spring;
  deal: Spring;
  tiltX: Spring;
  tiltY: Spring;
  dealAt: number;
  /** Coming in from the deck: its offset from its place, closing to nothing. */
  fromDeck: boolean;
  dx: Spring;
  dy: Spring;
  /** Its turn from face-down: a card from the deck leaves it as a back and turns over in flight. */
  turn: Spring;
  /** Where it was last drawn (canvas px), so a card leaving for the deck starts from there. */
  at: { x: number; y: number; w: number; h: number; rz: number };
}

/** A card on its way from the hand into the deck. */
interface Leaving {
  shader: number;
  from: { x: number; y: number; w: number; h: number; rz: number };
  t: number;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const PIXEL_STEPS = [0, 96, 72, 56, 44, 34, 26];

export interface StageOptions {
  store: Store;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  bgCanvas: HTMLCanvasElement;
  cardSlot: HTMLButtonElement;
  hand: HTMLElement;
  info: HTMLElement;
  onSelect: (id: EditionId) => void;
  onHover: (id: EditionId | null) => void;
  /** A finger flicked the card sideways: 1 for the next card in the hand, -1 for the previous. */
  onFlick: (dir: 1 | -1) => void;
  /** The finishes in the hand, in order. */
  handIds: () => EditionId[];
  /** Where the deck sits on the page: swapped cards fly between it and the hand. */
  deckRect?: () => DOMRect | null;
  /** A tap (not a toss) on the card, at this point of its face (uv) and of the page. */
  onTapCard?: (uv: [number, number], x: number, y: number) => void;
}

/** A level pinned with ?quality=0…3 in the address, if any. */
function pinnedQuality(): number | undefined {
  const v = new URLSearchParams(location.search).get('quality');
  return v !== null && /^\d$/.test(v) ? +v : undefined;
}

/** Fired on the document whenever the stage restarts its frame loop (tab shown again, pack opening closed). */
export const STAGE_RESUMED = 'stageresumed';

export class Stage {
  readonly cards: CardRenderer;
  readonly bg: BackgroundRenderer;
  private o: StageOptions;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private last = performance.now();
  private time = 0;
  private bgTime = 0;
  private running = false;
  // Phones and low-core machines get a lighter backbuffer; the pixel look hides the difference.
  private maxDpr = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
  /** Steps the on-screen drawing down while the device keeps missing frames; ?quality=0…3 pins it. */
  private quality = new QualityGovernor(pinnedQuality());

  // Main card motion
  private ox = new Spring(0, 0, 150, 14);
  private oy = new Spring(0, 0, 150, 14);
  private rx = new Spring(0, 0, 210, 17);
  private ry = new Spring(0, 0, 210, 17);
  private rz = new Spring(0, 0, 170, 12);
  private sc = new Spring(1, 1, 320, 14);
  private flash = 0;
  private flip = { active: false, t0: 0, dur: 0.7, swapped: false, onHalf: null as null | (() => void) };

  // Pointer
  private pointer = { x: -1, y: -1, inside: false, nx: 0, ny: 0, overCard: false };
  private drag = { active: false, id: -1, finger: false, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, vx: 0, vy: 0, moved: 0 };
  /** A press on a finish that reacts to touch (or carries a lamp): it strokes the card instead of tossing it. */
  private rub = { active: false, id: -1 };
  /** Where the pointer last held Blacklight's lamp on the main card (card uv), and how much of the lamp it still holds (0 adrift). */
  private lamp: [number, number] = torchAt(0);
  private lampHeld = 0;
  private lampPower = TORCH_IDLE;
  /** A Light motion's dim room over the backdrop (as a file darkens its swirl). */
  private room: HTMLElement;
  private roomShown = 0;
  /** Where the card was last touched (card uv), to warm the whole way from there, and the pointer then (css px). */
  private lastTouch: [number, number] | null = null;
  private lastPointer: [number, number] = [0, 0];
  /** The finish (and shape) on the main card last frame, to greet a touch finish as it arrives. */
  private shown: string | null = null;
  /** The unseen finger that swipes a touch finish as it arrives, until someone touches it themselves. */
  private greet: Swipe | null = null;
  /** What touch left on the main card, and the strokes the hand's preview cards draw themselves. */
  private heat = new HeatField();
  private demos = new Map<string, AutoTouch>();

  private hand: HandCard[] = [];
  private leaving: Leaving[] = [];
  private hovered = -1;
  private focused = -1;
  private particles: Particle[] = [];
  private palette: [RGB, RGB, RGB];
  private bgPointer: [number, number] = [0.5, 0.5];
  private focus: [number, number] = [0.4, 0.55];
  private lastTune: unknown = null;
  /** Hold the card flat and still, facing the viewer (brush mode). */
  hold = false;
  /** 0..1: overlay on the main card showing where the finish lands. */
  rangeView = 0;
  /** Which layer's area the overlay shows (the one being edited). */
  rangeLayer: 1 | 2 = 1;

  constructor(o: StageOptions) {
    this.o = o;
    this.cards = new CardRenderer(o.canvas);
    this.bg = new BackgroundRenderer(o.bgCanvas, { live: true });
    this.room = document.createElement('div');
    this.room.className = 'room';
    o.bgCanvas.after(this.room);
    const ed = EDITIONS.find((e) => e.id === o.store.get().edition) ?? EDITIONS[0];
    this.palette = ed.swirl.map(hexToRgb) as [RGB, RGB, RGB];
    this.syncHand();
    this.bindPointer();
    // Deal-in: the card rises from below while spinning, the hand follows one by one.
    if (!this.reduced.matches) {
      this.oy.x = 700;
      this.rz.x = -0.5;
      this.sc.x = 0.7;
    }
    this.resume();
    this.syncQuality();
    motion.armGyro(o.stage, this.reduced);
    // Nothing to see in a hidden tab, so stop drawing until it comes back.
    document.addEventListener('visibilitychange', () => this.resume());
  }

  /** While a pack is being opened over the page, the stage stops drawing so the opening keeps its frames. */
  private paused = false;

  pause(on: boolean) {
    this.paused = on;
    this.resume();
  }

  /** Exports draw and read back on every frame; their frames say nothing about the stage's own speed. */
  holdQuality(on: boolean) {
    this.quality.hold(on);
  }

  private resume() {
    if (this.running || document.hidden || this.paused) return;
    this.running = true;
    this.last = performance.now();
    this.quality.rest();
    requestAnimationFrame(this.frame);
    // Copies of the card (src/proof.ts) queue their frame callbacks after this one again.
    document.dispatchEvent(new Event(STAGE_RESUMED));
  }

  private get motion() {
    return !this.reduced.matches;
  }

  /**
   * Re-reads the hand. Cards already in it keep their place and motion; new ones (a folder just
   * picked) are dealt in one after another once their shader is ready; cards no longer in it go.
   * The number keys follow the order.
   */
  syncHand() {
    const { hand } = this.o;
    const ids = this.o.handIds();
    const old = new Map(this.hand.map((h) => [h.id, h]));
    const fresh = this.hand.length > 0;
    let dealt = 0;
    this.hand = ids.map((id, n) => {
      let h = old.get(id);
      old.delete(id);
      if (!h) {
        h = this.handCard(id);
        // On boot the whole hand deals in after the card; later a newcomer flies in from the deck.
        if (fresh && this.o.deckRect?.() && this.motion) {
          h.fromDeck = true;
          h.deal.x = h.deal.target = 0;
          h.dealAt = this.time + 0.12 + dealt++ * 0.07;
        } else h.dealAt = fresh ? this.time + 0.05 + dealt++ * 0.07 : 0.35 + n * 0.04;
      }
      h.el.innerHTML = n < 10 ? `<span class="key" aria-hidden="true">${(n + 1) % 10}</span>` : '';
      hand.appendChild(h.el);
      return h;
    });
    // Cards no longer in the hand fly back into the deck.
    for (const h of old.values()) {
      h.el.remove();
      if (this.motion && h.at.w) this.leaving.push({ shader: editionById(h.id).shader, from: { ...h.at }, t: 0 });
    }
    this.hovered = this.focused = -1;
    this.syncHandChecked();
    this.applyHandLabels();
  }

  private handCard(id: EditionId): HandCard {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hand-slot';
    el.setAttribute('role', 'radio');
    el.dataset.id = id;
    const at = () => this.hand.findIndex((h) => h.id === id);
    el.addEventListener('click', () => this.o.onSelect(id));
    el.addEventListener('pointerenter', () => {
      this.hovered = at();
      sfx.hover(this.hovered);
      this.o.onHover(id);
    });
    el.addEventListener('pointerleave', () => {
      if (this.hovered === at()) this.hovered = -1;
      this.o.onHover(this.focused >= 0 ? this.hand[this.focused].id : null);
    });
    el.addEventListener('focus', () => {
      this.focused = at();
      this.o.onHover(id);
    });
    el.addEventListener('blur', () => {
      if (this.focused === at()) this.focused = -1;
      this.o.onHover(this.hovered >= 0 ? this.hand[this.hovered].id : null);
    });
    el.addEventListener('keydown', (ev) => {
      const dir = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      const next = this.hand[(at() + dir + this.hand.length) % this.hand.length];
      this.o.onSelect(next.id);
      next.el.focus();
    });
    const m = this.motion ? 1 : 0;
    return {
      id,
      el,
      lift: new Spring(0, 0, 260, 18),
      scale: new Spring(1, 1, 260, 16),
      deal: new Spring(m, m, 120, 13),
      tiltX: new Spring(0, 0, 200, 16),
      tiltY: new Spring(0, 0, 200, 16),
      dealAt: 0,
      fromDeck: false,
      dx: new Spring(0, 0, 150, 15),
      dy: new Spring(0, 0, 150, 15),
      turn: new Spring(0, 0, 120, 14),
      at: { x: 0, y: 0, w: 0, h: 0, rz: 0 },
    };
  }

  syncHandChecked() {
    const sel = this.o.store.get().edition;
    for (const h of this.hand) {
      const on = h.id === sel;
      h.el.setAttribute('aria-checked', String(on));
      h.el.tabIndex = on ? 0 : -1;
    }
  }

  private labels: { names: Record<EditionId, string>; looks: Record<EditionId, string> } | null = null;

  setHandLabels(names: Record<EditionId, string>, looks: Record<EditionId, string>) {
    this.labels = { names, looks };
    this.applyHandLabels();
  }

  private applyHandLabels() {
    if (!this.labels) return;
    for (const h of this.hand) {
      h.el.setAttribute('aria-label', this.labels.names[h.id]);
      h.el.setAttribute('aria-description', this.labels.looks[h.id]);
    }
  }

  focusHand(id: EditionId) {
    this.hand.find((h) => h.id === id)?.el.focus();
  }

  private bindPointer() {
    const { stage, cardSlot } = this.o;
    const update = (e: PointerEvent) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = true;
      this.bgPointer = [e.clientX / innerWidth, 1 - e.clientY / innerHeight];
    };
    window.addEventListener('pointermove', (e) => {
      update(e);
      if (this.rub.active && e.pointerId === this.rub.id) {
        this.drag.moved = Math.max(this.drag.moved, Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy));
      }
      if (this.drag.active && e.pointerId === this.drag.id) {
        const now = performance.now();
        const dt = Math.max(1, now - this.drag.lt) / 1000;
        const vx = (e.clientX - this.drag.lx) / dt;
        const vy = (e.clientY - this.drag.ly) / dt;
        this.drag.vx = this.drag.vx * 0.6 + vx * 0.4;
        this.drag.vy = this.drag.vy * 0.6 + vy * 0.4;
        this.drag.lx = e.clientX;
        this.drag.ly = e.clientY;
        this.drag.lt = now;
        const dx = e.clientX - this.drag.sx;
        const dy = e.clientY - this.drag.sy;
        this.drag.moved = Math.max(this.drag.moved, Math.hypot(dx, dy));
        // Rubber band: the further you pull, the harder it gets.
        const band = (d: number) => (d * 0.9) / (1 + Math.abs(d) / 520);
        this.ox.target = band(dx);
        this.oy.target = band(dy);
      }
    });
    stage.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
    });
    cardSlot.addEventListener('pointerdown', (e) => {
      cardSlot.setPointerCapture(e.pointerId);
      const pressed = editionById(this.o.store.get().edition);
      if (pressed.touch || pressed.torch) {
        // A finger lands without moving first, so take its position from the press itself.
        update(e);
        // The card gives a little under the finger and stays put to be stroked.
        this.rub = { active: true, id: e.pointerId };
        Object.assign(this.drag, { sx: e.clientX, sy: e.clientY, moved: 0 });
        this.sc.target = 0.985;
        return;
      }
      Object.assign(this.drag, {
        active: true,
        id: e.pointerId,
        finger: e.pointerType !== 'mouse',
        sx: e.clientX,
        sy: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        lt: performance.now(),
        vx: 0,
        vy: 0,
        moved: 0,
      });
      this.sc.target = 1.04;
      this.o.stage.classList.add('is-dragging');
    });
    const release = (e: PointerEvent) => {
      if (this.rub.active && e.pointerId === this.rub.id) {
        this.rub.active = false;
        this.sc.target = 1;
        this.heat.lift();
      }
      if (!this.drag.active || e.pointerId !== this.drag.id) return;
      this.drag.active = false;
      this.o.stage.classList.remove('is-dragging');
      this.ox.target = 0;
      this.oy.target = 0;
      this.sc.target = 1;
      const speed = Math.hypot(this.drag.vx, this.drag.vy);
      if (this.drag.moved > 6) {
        // Hand the throw velocity to the springs so it overshoots naturally.
        this.ox.v += clamp(this.drag.vx, -3000, 3000) * 0.35;
        this.oy.v += clamp(this.drag.vy, -3000, 3000) * 0.35;
        this.rz.v += clamp(this.drag.vx, -3000, 3000) * 0.004;
        if (speed > 900) sfx.toss();
        else sfx.land();
      }
      // A finger flicking the card sideways deals the next card in the hand (a mouse just tosses it;
      // a gesture the browser cancels deals nothing).
      const dir = this.drag.finger && e.type === 'pointerup' ? flickDir(e.clientX - this.drag.sx, e.clientY - this.drag.sy, this.drag.vx) : 0;
      if (dir) {
        // The card turns a little the way it was flicked as the next one is dealt.
        this.ry.v -= dir * 9;
        this.o.onFlick(dir);
      }
    };
    cardSlot.addEventListener('pointerup', release);
    cardSlot.addEventListener('pointercancel', release);
    cardSlot.addEventListener('click', (e) => {
      if (this.drag.moved > 6) return;
      this.juice();
      sfx.pop();
      // A keyboard press has no point on the card.
      if (this.pose && e.detail > 0) this.o.onTapCard?.(cardUv(e.clientX - this.canvasRect.left, e.clientY - this.canvasRect.top, this.pose), e.clientX, e.clientY);
    });
  }

  /** The point of the card's face (uv) under a point of the page, from the last frame's pose. */
  uvAt(x: number, y: number): [number, number] | null {
    return this.pose ? cardUv(x - this.canvasRect.left, y - this.canvasRect.top, this.pose) : null;
  }

  /** The point of the page over a point of the card's face (uv). */
  pageAt(u: number, v: number): [number, number] | null {
    if (!this.pose) return null;
    const [x, y] = cardPoint(u, v, this.pose);
    return [x + this.canvasRect.left, y + this.canvasRect.top];
  }

  juice(strength = 1) {
    this.sc.v += 4.5 * strength;
    this.rz.v += (Math.random() > 0.5 ? 1 : -1) * 2.4 * strength;
    this.flash = 0.35 * strength;
  }

  /** Spin the card a full turn and swap its face while the back is showing. */
  flipTo(onHalf: () => void) {
    if (!this.motion) {
      onHalf();
      return;
    }
    if (this.flip.active && this.flip.onHalf && !this.flip.swapped) this.flip.onHalf();
    this.flip = { active: true, t0: this.time, dur: 0.7, swapped: false, onHalf };
    sfx.flip();
  }

  burst(color: string) {
    if (!this.motion) return;
    const r = this.cardRect();
    if (!r) return;
    const c = hexToRgb(color);
    const white: RGB = [1, 1, 1];
    const n = Math.round(46 * this.quality.current.sparks);
    for (let i = 0; i < n; i++) {
      // Emit from the card outline
      const side = Math.floor(Math.random() * 4);
      const u = Math.random();
      let x = r.cx;
      let y = r.cy;
      if (side === 0) { x += (u - 0.5) * r.w; y -= r.h / 2; }
      else if (side === 1) { x += (u - 0.5) * r.w; y += r.h / 2; }
      else if (side === 2) { x -= r.w / 2; y += (u - 0.5) * r.h; }
      else { x += r.w / 2; y += (u - 0.5) * r.h; }
      const ang = Math.atan2(y - r.cy, x - r.cx) + (Math.random() - 0.5) * 0.8;
      const sp = 160 + Math.random() * 380;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 120,
        size: Math.random() > 0.7 ? 10 : 6,
        life: 1,
        decay: 0.9 + Math.random() * 0.9,
        color: Math.random() > 0.75 ? white : c,
      });
    }
  }

  private canvasRect = new DOMRect();
  /** The card's pose in the last frame, to find where a tap landed on its face. */
  private pose: Parameters<typeof cardUv>[2] | null = null;

  private cardRect() {
    const s = this.o.cardSlot.getBoundingClientRect();
    if (!s.width) return null;
    const c = this.canvasRect;
    return { cx: s.left - c.left + s.width / 2, cy: s.top - c.top + s.height / 2, w: s.width, h: s.height };
  }

  private handLayout(count: number) {
    const hr = this.o.hand.getBoundingClientRect();
    // A tall hand box (phones) deals two smaller fans so every card stays tappable; a short hand needs only one.
    // Seven cards stay one fan.
    const rows = hr.height > 240 && count > 8 ? 2 : 1;
    const perRow = Math.ceil(count / rows);
    const rowH = hr.height / rows;
    // Each row reserves room for lift above and the fan's arc below. A card of another shape fits a
    // box a little wider than the trading card, so a fan of wide cards stays as easy to tell apart.
    const sh = shapeById(this.o.store.get().shape);
    const h0 = Math.max(60, Math.min(rowH - 46, 124));
    const { w, h } = contain(sh.h / sh.w, h0 * 0.86, h0);
    // Leave room for the fan's outer rotation so edge cards never clip.
    const spacing = Math.min(w * 0.98, (hr.width - w * 1.35) / (perRow - 1));
    const midRow = (perRow - 1) / 2;
    const arcK = Math.min(2, 30 / (midRow * midRow));
    const slot = (i: number) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, count - row * perRow);
      return { row, d: (i % perRow) - (inRow - 1) / 2 };
    };
    // A single fan in a tall box sits in its middle rather than along its top.
    const top = rows === 1 && hr.height > 240 ? (rowH - h - 46) / 2 : 0;
    return { hr, w, h, spacing, arcK, rowH, top, slot };
  }

  private frame = (now: number) => {
    if (document.hidden || this.paused) {
      this.running = false;
      return;
    }
    if (this.quality.frame(now - this.last)) this.syncQuality();
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    // Advance by the clamped step so a long pause never jumps the animation ahead.
    this.time += dt;
    if (this.motion) this.bgTime += dt;
    const state = this.o.store.get();
    const tune = motion.view(state.tune);
    if (tune !== this.lastTune) {
      this.lastTune = tune;
      this.cards.tune = tuneGl(tune);
    }

    // Resize canvases to their boxes
    const q = this.quality.current;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr) * q.res;
    this.canvasRect = this.o.canvas.getBoundingClientRect();
    this.cards.resize(this.canvasRect.width, this.canvasRect.height, dpr);
    this.bg.resize(Math.ceil(innerWidth / q.bg), Math.ceil(innerHeight / q.bg));

    // Background palette eases to the selected edition
    const ed = EDITIONS.find((e) => e.id === state.edition) ?? EDITIONS[0];
    const k = 1 - Math.exp(-dt * 3);
    ed.swirl.forEach((hex, i) => {
      const t = hexToRgb(hex);
      for (let j = 0; j < 3; j++) this.palette[i][j] += (t[j] - this.palette[i][j]) * k;
    });
    if (`${ed.id}|${state.shape}` !== this.shown) {
      this.shown = `${ed.id}|${state.shape}`;
      // A touch finish arrives with an unseen finger swiping it once, then cooling: a hint to touch.
      if (ed.touch) this.heat = new HeatField(ed.touch, kOf(state.shape));
      this.greet = ed.touch ? new Swipe(this.heat, SWIPES[0]) : null;
      // Held still, the swipe is simply there, and fades.
      if (this.greet && !this.motion) {
        while (this.greet.step(1 / 30)) this.heat.step(1 / 30);
        this.greet = null;
      }
    }
    const r = this.cardRect();
    if (r) {
      // The swirl winds around the card, easing along when the layout changes.
      const fx = (this.canvasRect.left + r.cx) / innerWidth;
      const fy = 1 - (this.canvasRect.top + r.cy) / innerHeight;
      this.focus[0] += (fx - this.focus[0]) * k;
      this.focus[1] += (fy - this.focus[1]) * k;
    }
    this.bg.render({ time: this.bgTime + 40, colors: this.palette, pointer: this.bgPointer, focus: this.focus });

    this.cards.begin();
    this.stepHand(dt, state);
    this.stepLeaving(dt, state);

    if (r) {
      // Pointer relative to the card
      const px = this.pointer.x - this.canvasRect.left;
      const py = this.pointer.y - this.canvasRect.top;
      const nx = (px - (r.cx + this.ox.x)) / (r.w / 2);
      const ny = (py - (r.cy + this.oy.x)) / (r.h / 2);
      const over = this.pointer.inside && Math.abs(nx) < 1.05 && Math.abs(ny) < 1.05;
      this.pointer.overCard = over || this.drag.active;
      const amp = this.motion ? 1 : 0.5;
      // The device's tilt leans the card (and so its shine) on phones; not under reduced motion.
      const gyro = this.motion ? motion.gyroInput() : null;
      // Pointing at the card turns a spinning one to face the viewer; dragging it or holding it for
      // the brush also eases the idle motion out.
      motion.step(dt, tune, !this.motion, over, this.drag.active || this.hold);
      if (this.hold) {
        this.rx.target = 0;
        this.ry.target = 0;
        this.rz.target = 0;
      } else if (this.drag.active) {
        this.ry.target = clamp(this.drag.vx * 0.00025, -0.5, 0.5) * amp;
        this.rx.target = clamp(-this.drag.vy * 0.00025, -0.5, 0.5) * amp;
        this.rz.target = clamp(this.drag.vx * 0.00018, -0.35, 0.35) * amp;
      } else if (over) {
        // Being stroked, the card leans less, so the finger keeps its place on it.
        const lean = this.rub.active ? 0.45 : 1;
        this.ry.target = clamp(nx, -1, 1) * 0.32 * amp * lean;
        this.rx.target = -clamp(ny, -1, 1) * 0.28 * amp * lean;
        this.rz.target = 0;
      } else if (gyro) {
        this.ry.target = gyro[0] * 0.32 * amp;
        this.rx.target = -gyro[1] * 0.28 * amp;
        this.rz.target = 0;
      } else {
        // Untouched, the card is the preview of its GIF: nothing but the motion moves it.
        this.ry.target = 0;
        this.rx.target = 0;
        this.rz.target = 0;
      }
      const sub = 4;
      for (let i = 0; i < sub; i++) {
        for (const s of [this.ox, this.oy, this.rx, this.ry, this.rz, this.sc]) s.step(dt / sub);
      }
      this.flash = Math.max(0, this.flash - dt * 2.2);

      let flipAngle = 0;
      if (this.flip.active) {
        const p = clamp((this.time - this.flip.t0) / this.flip.dur, 0, 1);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        flipAngle = e * TAU;
        if (!this.flip.swapped && flipAngle > Math.PI / 2) {
          this.flip.swapped = true;
          this.flip.onHalf?.();
        }
        if (p >= 1) {
          this.flip.active = false;
          this.juice(0.6);
          sfx.land();
        }
      }

      // The motion and the light come from the tune (Sway and pointer-follow by default), timed by
      // the same clock as an exported loop (see idlePose in tune/model.ts): left alone, this is the file.
      const pose = motion.pose(tune);
      const fx = pose.dx * r.h;
      const fy = pose.dy * r.h;
      const tk = motion.tiltScale(tune);
      const RX = this.rx.x * tk + pose.rx;
      motion.flip = flipAngle;
      const RY = this.ry.x * tk + pose.ry + pose.spin + flipAngle;
      const RZ = this.rz.x * tk + pose.rz;

      const tilt = motion.tilt(tune, pose, this.rx.x + pose.rx, this.ry.x + pose.ry);
      const cardPose = { cx: r.cx + this.ox.x + fx, cy: r.cy + this.oy.x + fy, w: r.w, h: r.h, rx: RX, ry: RY, rz: RZ, scale: this.sc.x * pose.scale };
      this.pose = cardPose;
      const pointed = over && !this.drag.active && !this.hold;
      const lamp = ed.torch ? this.aimLamp(pointed ? cardUv(px, py, cardPose) : null, torchAt(motion.idleTime / TORCH_DRIFT), dt) : null;
      const light = lamp && lampLights(tune, true) ? lamp : motion.light(tune, pose, tilt, pointed ? [clamp(nx * 0.5 + 0.5, 0, 1), clamp(ny * 0.5 + 0.5, 0, 1)] : null);
      const shade = pose.dim ? roomShade(pose.dim) : 0;
      if (Math.abs(shade - this.roomShown) > 1e-3) this.room.style.opacity = String((this.roomShown = shade));

      // The card's shadow drops further as it lifts or rises off the table.
      const lift = (this.sc.x * pose.scale - 1) * 120 - fy * 0.6 + (this.drag.active ? 14 : 0);
      this.warm(ed.touch && !this.hold && (over || this.rub.active) ? cardUv(px, py, cardPose) : null, dt);
      this.cards.drawCard(
        {
          ...cardPose,
          ...cardLayers(state, this.rangeView > 0 ? this.rangeLayer : 0),
          intensity: state.intensity,
          pixel: PIXEL_STEPS[state.pixel] ?? 0,
          tilt,
          light,
          alpha: 1,
          flash: this.flash + pose.flash,
          glint: pose.glint,
          beam: pose.beam,
          spot: pose.spot,
          dim: pose.dim,
          star: pose.star,
          // The finishes' own motion closes on the loop's length, as in the file.
          loop: tune.speed > 0 ? loopCycle(tune, !!ed.torch) : 0,
          shadow: [10 + lift * 0.3 - (RY - pose.spin) * 18, 16 + lift * 0.5 + RX * 10],
          rangeView: this.rangeView,
          heat: ed.touch ? this.heat : undefined,
          lamp: this.lampPower,
        },
        motion.fx,
      );
      // Info box sways a little with the card, like a hanging tag.
      // ...but holds still while someone is pointing at it or typing in it.
      if (this.o.info.matches(':hover, :focus-within')) this.o.info.style.transform = '';
      else this.o.info.style.transform = `translate(${(this.ox.x * 0.12 + fx * 0.4).toFixed(1)}px, ${(this.oy.x * 0.12 + fy * 0.4).toFixed(1)}px) rotate(${(RZ * 0.25).toFixed(4)}rad)`;
    }

    this.stepParticles(dt);
    this.cards.drawParticles(this.particles);
    requestAnimationFrame(this.frame);
  };

  /** Shows the drawing level on the page (data-quality), for anyone checking what the stage chose. */
  private syncQuality() {
    document.documentElement.dataset.quality = String(this.quality.level);
  }

  /**
   * Blacklight's lamp: right under the pointer (`at`) at full power, gliding more slowly back to its
   * `drift` when let go, where it glows dimmer, so taking hold of it is unmistakable. Back on its
   * drift it is exactly where a file puts it.
   */
  private aimLamp(at: [number, number] | null, drift: [number, number], dt: number): [number, number] {
    this.lampPower += ((at ? 1 : TORCH_IDLE) - this.lampPower) * (1 - Math.exp(-dt * 8));
    if (at) {
      const k = 1 - Math.exp(-dt * 24);
      if (!this.lampHeld) this.lamp = drift;
      this.lamp = [this.lamp[0] + (at[0] - this.lamp[0]) * k, this.lamp[1] + (at[1] - this.lamp[1]) * k];
    }
    this.lampHeld += ((at ? 1 : 0) - this.lampHeld) * (1 - Math.exp(-dt * (at ? 24 : 3)));
    if (!at && this.lampHeld < 1e-3) this.lampHeld = 0;
    const h = this.lampHeld;
    return [drift[0] + (this.lamp[0] - drift[0]) * h, drift[1] + (this.lamp[1] - drift[1]) * h];
  }

  /** Warms the main card from the last touched spot to `at` (card uv), or ends the touch when null. */
  private warm(at: [number, number] | null, dt: number) {
    const on = at && at[0] > -0.02 && at[0] < 1.02 && at[1] > -0.02 && at[1] < 1.02;
    if (on && this.greet) {
      // A real touch takes over from the hint.
      this.greet = null;
      this.heat.lift();
    }
    if (this.greet && !this.greet.step(dt)) this.greet = null;
    if (on) {
      const from = this.lastTouch ?? at;
      const firm = this.rub.active;
      // Held still on the screen (the card may still be settling under it), a finger leaves its print; moving, it draws.
      const still = Math.hypot(this.pointer.x - this.lastPointer[0], this.pointer.y - this.lastPointer[1]) < 1;
      if (firm && still) this.heat.press(at[0], at[1], dt);
      else {
        this.heat.lift();
        this.heat.touch(from[0], from[1], at[0], at[1], dt, firm);
      }
      this.lastTouch = at;
      this.lastPointer = [this.pointer.x, this.pointer.y];
    } else if (this.lastTouch) {
      this.lastTouch = null;
      this.heat.lift();
    }
    this.heat.step(dt);
  }

  private stepHand(dt: number, state: ReturnType<Store['get']>) {
    const { hr, w, h, spacing, arcK, rowH, top, slot } = this.handLayout(this.hand.length);
    const ox = hr.left - this.canvasRect.left;
    const oy = hr.top - this.canvasRect.top;
    const active = this.hovered >= 0 ? this.hovered : this.focused;
    const order: number[] = [];
    this.hand.forEach((card, i) => {
      const sel = card.id === state.edition;
      const hot = i === active;
      // A folder's cards wait below until their pack's shader is ready, then deal in.
      if (this.time > card.dealAt && this.cards.ready(editionById(card.id).shader)) card.deal.target = 0;
      card.lift.target = (sel ? 20 : 0) + (hot ? 12 : 0);
      card.scale.target = hot ? 1.1 : sel ? 1.04 : 1;
      // Hovered card leans toward the pointer
      if (hot && this.hovered === i) {
        const { row, d } = slot(i);
        const cx = hr.left + hr.width / 2 + d * spacing;
        const cy = hr.top + top + row * rowH + 30 + h / 2;
        card.tiltY.target = clamp((this.pointer.x - cx) / (w / 2), -1, 1) * 0.35;
        card.tiltX.target = -clamp((this.pointer.y - cy) / (h / 2), -1, 1) * 0.3;
      } else {
        card.tiltX.target = 0;
        card.tiltY.target = 0;
      }
      for (const s of [card.lift, card.scale, card.deal, card.tiltX, card.tiltY, card.dx, card.dy, card.turn]) s.step(dt);
      order.push(i);
    });
    // Draw so the selected and hovered cards sit on top of their neighbours.
    order.sort((a, b) => {
      // A card flying in from the deck stays on top until it lands.
      const rank = (i: number) => (Math.abs(this.hand[i].dx.x) > 2 ? 3 : i === active ? 2 : this.hand[i].id === state.edition ? 1 : 0);
      return rank(a) - rank(b);
    });
    for (const i of order) {
      const card = this.hand[i];
      const e = editionById(card.id);
      const { row, d } = slot(i);
      const fan = d * 0.045;
      const arc = d * d * arcK;
      let x = hr.width / 2 + d * spacing;
      let y = top + row * rowH + 30 + h / 2 + arc - card.lift.x + card.deal.x * 260;
      if (card.fromDeck) {
        // Waiting on the deck until its moment, then springing to its place in the hand.
        const deck = this.o.deckRect?.();
        if (deck) {
          card.dx.x = deck.left + deck.width / 2 - this.canvasRect.left - (ox + x);
          card.dy.x = deck.top + deck.height / 2 - this.canvasRect.top - (oy + y);
          card.scale.x = 0.55;
          card.turn.x = Math.PI;
        }
        if (this.time > card.dealAt) card.fromDeck = false;
      }
      x += card.dx.x;
      y += card.dy.x;
      const rot = fan * (1 - Math.min(card.lift.x / 40, 0.6));
      card.el.style.width = `${w}px`;
      card.el.style.height = `${h}px`;
      card.el.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px) rotate(${rot.toFixed(4)}rad)`;
      card.el.style.zIndex = String(3 + (i === active ? 2 : 0));
      if (i === active) {
        // The peek tag rides just above the card being pointed at.
        const peek = this.o.hand.querySelector<HTMLElement>('.hand-peek');
        if (peek) peek.style.transform = `translate(${x.toFixed(1)}px, ${(y - (h * card.scale.x) / 2 - 12).toFixed(1)}px) translate(-50%, -100%)`;
      }
      const t = this.time + i * 0.7;
      const idle = this.motion ? 1 : 0;
      card.at = { x: ox + x, y: oy + y, w, h, rz: rot };
      this.cards.drawCard(
        {
          cx: ox + x,
          cy: oy + y,
          w,
          h,
          rx: card.tiltX.x + Math.sin(t * 0.8) * 0.06 * idle,
          ry: card.tiltY.x + Math.cos(t * 0.7) * 0.08 * idle + card.turn.x,
          rz: rot + card.deal.x * 0.6 * (d >= 0 ? 1 : -1),
          scale: card.scale.x,
          edition: e.shader,
          intensity: state.intensity,
          pixel: PIXEL_STEPS[state.pixel] ? Math.max(18, PIXEL_STEPS[state.pixel] * 0.5) : 0,
          tilt: [card.tiltY.x / 0.35 + Math.sin(t * 0.5) * 0.5 * idle, card.tiltX.x / 0.3 + Math.cos(t * 0.4) * 0.5 * idle],
          // Blacklight's preview drifts its lamp round by itself.
          light: e.torch ? torchAt(motion.fx / TORCH_DRIFT + i * 0.1) : [0.5, 0.35],
          alpha: 1 - clamp(card.deal.x, 0, 1) * 0.6,
          flash: 0,
          shadow: [4 + card.lift.x * 0.12, 6 + card.lift.x * 0.25],
          plate: false,
          heat: e.touch ? this.demoAt(e.touch, motion.fx) : undefined,
        },
        motion.fx,
      );
    }
  }

  /** Cards leaving the hand: each shrinks along a short arc into the deck. */
  private stepLeaving(dt: number, state: ReturnType<Store['get']>) {
    const deck = this.o.deckRect?.();
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const c = this.leaving[i];
      c.t += dt / 0.42;
      if (c.t >= 1 || !deck) {
        this.leaving.splice(i, 1);
        continue;
      }
      const e = c.t * c.t * (3 - 2 * c.t);
      const tx = deck.left + deck.width / 2 - this.canvasRect.left;
      const ty = deck.top + deck.height / 2 - this.canvasRect.top;
      this.cards.drawCard(
        {
          cx: c.from.x + (tx - c.from.x) * e,
          cy: c.from.y + (ty - c.from.y) * e - Math.sin(Math.PI * c.t) * 50,
          w: c.from.w,
          h: c.from.h,
          rx: 0,
          ry: 0,
          rz: c.from.rz * (1 - e) + 0.2 * e,
          scale: 1 - 0.45 * e,
          edition: c.shader,
          intensity: state.intensity,
          pixel: 0,
          tilt: [0, 0],
          light: [0.5, 0.35],
          alpha: 1 - 0.7 * e,
          flash: 0,
          shadow: null,
          plate: false,
        },
        motion.fx,
      );
    }
  }

  /** The preview card strokes itself; held still (reduced motion) it shows the stroke at its best. */
  private demoAt(kind: TouchKind, time: number) {
    const shape = this.o.store.get().shape;
    let demo = this.demos.get(`${kind}|${shape}`);
    if (!demo) this.demos.set(`${kind}|${shape}`, (demo = new AutoTouch(kind, SWIPES[0], kOf(shape))));
    demo.at(2 + AUTO_STILL[kind] + time / AUTO_LOOP);
    return demo;
  }

  private stepParticles(dt: number) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.vy += 900 * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) list.splice(i, 1);
    }
  }
}
