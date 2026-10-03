import { EDITIONS, type EditionId } from './editions';
import { BackgroundRenderer, CardRenderer, hexToRgb, type Particle, type RGB } from './gl/renderers';
import { sfx } from './audio';
import type { Store } from './state';

class Spring {
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
}

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
  private drag = { active: false, id: -1, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, vx: 0, vy: 0, moved: 0 };

  private hand: HandCard[] = [];
  private hovered = -1;
  private focused = -1;
  private particles: Particle[] = [];
  private palette: [RGB, RGB, RGB];
  private bgPointer: [number, number] = [0.5, 0.5];
  private focus: [number, number] = [0.4, 0.55];

  constructor(o: StageOptions) {
    this.o = o;
    this.cards = new CardRenderer(o.canvas);
    this.bg = new BackgroundRenderer(o.bgCanvas);
    const ed = EDITIONS.find((e) => e.id === o.store.get().edition) ?? EDITIONS[0];
    this.palette = ed.swirl.map(hexToRgb) as [RGB, RGB, RGB];
    this.buildHand();
    this.bindPointer();
    // Deal-in: the card rises from below while spinning, the hand follows one by one.
    if (!this.reduced.matches) {
      this.oy.x = 700;
      this.rz.x = -0.5;
      this.sc.x = 0.7;
    }
    this.resume();
    // Nothing to see in a hidden tab, so stop drawing until it comes back.
    document.addEventListener('visibilitychange', () => this.resume());
  }

  private resume() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private get motion() {
    return !this.reduced.matches;
  }

  private buildHand() {
    const { hand } = this.o;
    hand.querySelectorAll('.hand-slot').forEach((el) => el.remove());
    EDITIONS.forEach((e, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hand-slot';
      el.setAttribute('role', 'radio');
      el.dataset.id = e.id;
      if (i < 10) el.innerHTML = `<span class="key" aria-hidden="true">${(i + 1) % 10}</span>`;
      el.addEventListener('click', () => this.o.onSelect(e.id));
      el.addEventListener('pointerenter', () => {
        this.hovered = i;
        sfx.hover(i);
        this.o.onHover(e.id);
      });
      el.addEventListener('pointerleave', () => {
        if (this.hovered === i) this.hovered = -1;
        this.o.onHover(this.focused >= 0 ? EDITIONS[this.focused].id : null);
      });
      el.addEventListener('focus', () => {
        this.focused = i;
        this.o.onHover(e.id);
      });
      el.addEventListener('blur', () => {
        if (this.focused === i) this.focused = -1;
        this.o.onHover(this.hovered >= 0 ? EDITIONS[this.hovered].id : null);
      });
      el.addEventListener('keydown', (ev) => {
        const dir = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
        if (!dir) return;
        ev.preventDefault();
        const next = (i + dir + EDITIONS.length) % EDITIONS.length;
        this.o.onSelect(EDITIONS[next].id);
        this.hand[next].el.focus();
      });
      hand.appendChild(el);
      this.hand.push({
        id: e.id,
        el,
        lift: new Spring(0, 0, 260, 18),
        scale: new Spring(1, 1, 260, 16),
        deal: new Spring(this.motion ? 1 : 0, this.motion ? 1 : 0, 120, 13),
        tiltX: new Spring(0, 0, 200, 16),
        tiltY: new Spring(0, 0, 200, 16),
        dealAt: 0.35 + i * 0.04,
      });
    });
    this.syncHandChecked();
  }

  syncHandChecked() {
    const sel = this.o.store.get().edition;
    for (const h of this.hand) {
      const on = h.id === sel;
      h.el.setAttribute('aria-checked', String(on));
      h.el.tabIndex = on ? 0 : -1;
    }
  }

  setHandLabels(names: Record<EditionId, string>, looks: Record<EditionId, string>) {
    for (const h of this.hand) {
      h.el.setAttribute('aria-label', names[h.id]);
      h.el.setAttribute('aria-description', looks[h.id]);
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
      Object.assign(this.drag, {
        active: true,
        id: e.pointerId,
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
    };
    cardSlot.addEventListener('pointerup', release);
    cardSlot.addEventListener('pointercancel', release);
    cardSlot.addEventListener('click', () => {
      if (this.drag.moved > 6) return;
      this.juice();
      sfx.pop();
    });
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
    for (let i = 0; i < 46; i++) {
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

  private cardRect() {
    const s = this.o.cardSlot.getBoundingClientRect();
    if (!s.width) return null;
    const c = this.canvasRect;
    return { cx: s.left - c.left + s.width / 2, cy: s.top - c.top + s.height / 2, w: s.width, h: s.height };
  }

  private handLayout() {
    const hr = this.o.hand.getBoundingClientRect();
    // A tall hand box (phones) deals two smaller fans so every card stays tappable.
    const rows = hr.height > 240 ? 2 : 1;
    const perRow = Math.ceil(this.hand.length / rows);
    const rowH = hr.height / rows;
    // Each row reserves room for lift above and the fan's arc below.
    const h = Math.max(60, Math.min(rowH - 46, 124));
    const w = h * (5 / 7);
    // Leave room for the fan's outer rotation so edge cards never clip.
    const spacing = Math.min(w * 0.98, (hr.width - w * 1.35) / (perRow - 1));
    const midRow = (perRow - 1) / 2;
    const arcK = Math.min(2, 30 / (midRow * midRow));
    const slot = (i: number) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, this.hand.length - row * perRow);
      return { row, d: (i % perRow) - (inRow - 1) / 2 };
    };
    return { hr, w, h, spacing, arcK, rowH, slot };
  }

  private frame = (now: number) => {
    if (document.hidden) {
      this.running = false;
      return;
    }
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    // Advance by the clamped step so a long pause never jumps the animation ahead.
    this.time += dt;
    if (this.motion) this.bgTime += dt;
    const state = this.o.store.get();

    // Resize canvases to their boxes
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.canvasRect = this.o.canvas.getBoundingClientRect();
    this.cards.resize(this.canvasRect.width, this.canvasRect.height, dpr);
    this.bg.resize(Math.ceil(innerWidth / 4), Math.ceil(innerHeight / 4));

    // Background palette eases to the selected edition
    const ed = EDITIONS.find((e) => e.id === state.edition) ?? EDITIONS[0];
    const k = 1 - Math.exp(-dt * 3);
    ed.swirl.forEach((hex, i) => {
      const t = hexToRgb(hex);
      for (let j = 0; j < 3; j++) this.palette[i][j] += (t[j] - this.palette[i][j]) * k;
    });
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

    if (r) {
      // Pointer relative to the card
      const px = this.pointer.x - this.canvasRect.left;
      const py = this.pointer.y - this.canvasRect.top;
      const nx = (px - (r.cx + this.ox.x)) / (r.w / 2);
      const ny = (py - (r.cy + this.oy.x)) / (r.h / 2);
      const over = this.pointer.inside && Math.abs(nx) < 1.05 && Math.abs(ny) < 1.05;
      this.pointer.overCard = over || this.drag.active;
      const amp = this.motion ? 1 : 0.5;
      if (this.drag.active) {
        this.ry.target = clamp(this.drag.vx * 0.00025, -0.5, 0.5) * amp;
        this.rx.target = clamp(-this.drag.vy * 0.00025, -0.5, 0.5) * amp;
        this.rz.target = clamp(this.drag.vx * 0.00018, -0.35, 0.35) * amp;
      } else if (over) {
        this.ry.target = clamp(nx, -1, 1) * 0.32 * amp;
        this.rx.target = -clamp(ny, -1, 1) * 0.28 * amp;
        this.rz.target = 0;
      } else if (this.pointer.inside) {
        this.ry.target = clamp(nx * 0.05, -0.12, 0.12) * amp;
        this.rx.target = -clamp(ny * 0.05, -0.12, 0.12) * amp;
        this.rz.target = 0;
      } else {
        this.ry.target = 0;
        this.rx.target = 0;
        this.rz.target = 0;
      }
      // Idle float
      const t = this.time;
      const idle = this.motion && !this.drag.active ? 1 : 0;
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

      const fy = Math.sin(t * 1.3) * 6 * idle;
      const rzIdle = Math.sin(t * 0.9) * 0.022 * idle;
      const rxIdle = Math.sin(t * 0.7 + 1) * 0.05 * idle;
      const ryIdle = Math.cos(t * 0.6) * 0.07 * idle;
      const RX = this.rx.x + rxIdle;
      const RY = this.ry.x + ryIdle + flipAngle;
      const RZ = this.rz.x + rzIdle;

      const tilt: [number, number] = [
        (this.ry.x + ryIdle) / 0.32 + Math.sin(t * 0.45) * 0.3 * idle,
        (this.rx.x + rxIdle) / 0.28 + Math.cos(t * 0.38) * 0.3 * idle,
      ];
      let light: [number, number];
      if (over && !this.drag.active) light = [clamp(nx * 0.5 + 0.5, 0, 1), clamp(ny * 0.5 + 0.5, 0, 1)];
      else light = [0.5 - tilt[0] * 0.35, 0.4 - tilt[1] * 0.3];

      const lift = (this.sc.x - 1) * 120 + (this.drag.active ? 14 : 0);
      this.cards.drawCard(
        {
          cx: r.cx + this.ox.x,
          cy: r.cy + this.oy.x + fy,
          w: r.w,
          h: r.h,
          rx: RX,
          ry: RY,
          rz: RZ,
          scale: this.sc.x,
          edition: ed.shader,
          intensity: state.intensity,
          pixel: PIXEL_STEPS[state.pixel] ?? 0,
          tilt,
          light,
          alpha: 1,
          flash: this.flash,
          shadow: [10 + lift * 0.3 - RY * 18, 16 + lift * 0.5 + RX * 10],
        },
        this.time,
      );
      // Info box sways a little with the card, like a hanging tag.
      // ...but holds still while someone is pointing at it or typing in it.
      if (this.o.info.matches(':hover, :focus-within')) this.o.info.style.transform = '';
      else this.o.info.style.transform = `translate(${(this.ox.x * 0.12).toFixed(1)}px, ${(this.oy.x * 0.12 + fy * 0.4).toFixed(1)}px) rotate(${(RZ * 0.25).toFixed(4)}rad)`;
    }

    this.stepParticles(dt);
    this.cards.drawParticles(this.particles);
    requestAnimationFrame(this.frame);
  };

  private stepHand(dt: number, state: ReturnType<Store['get']>) {
    const { hr, w, h, spacing, arcK, rowH, slot } = this.handLayout();
    const ox = hr.left - this.canvasRect.left;
    const oy = hr.top - this.canvasRect.top;
    const active = this.hovered >= 0 ? this.hovered : this.focused;
    const order: number[] = [];
    this.hand.forEach((card, i) => {
      const sel = card.id === state.edition;
      const hot = i === active;
      if (this.time > card.dealAt) card.deal.target = 0;
      card.lift.target = (sel ? 20 : 0) + (hot ? 12 : 0);
      card.scale.target = hot ? 1.1 : sel ? 1.04 : 1;
      // Hovered card leans toward the pointer
      if (hot && this.hovered === i) {
        const { row, d } = slot(i);
        const cx = hr.left + hr.width / 2 + d * spacing;
        const cy = hr.top + row * rowH + 30 + h / 2;
        card.tiltY.target = clamp((this.pointer.x - cx) / (w / 2), -1, 1) * 0.35;
        card.tiltX.target = -clamp((this.pointer.y - cy) / (h / 2), -1, 1) * 0.3;
      } else {
        card.tiltX.target = 0;
        card.tiltY.target = 0;
      }
      for (const s of [card.lift, card.scale, card.deal, card.tiltX, card.tiltY]) s.step(dt);
      order.push(i);
    });
    // Draw so the selected and hovered cards sit on top of their neighbours.
    order.sort((a, b) => {
      const rank = (i: number) => (i === active ? 2 : this.hand[i].id === state.edition ? 1 : 0);
      return rank(a) - rank(b);
    });
    for (const i of order) {
      const card = this.hand[i];
      const e = EDITIONS[i];
      const { row, d } = slot(i);
      const fan = d * 0.045;
      const arc = d * d * arcK;
      const x = hr.width / 2 + d * spacing;
      const y = row * rowH + 30 + h / 2 + arc - card.lift.x + card.deal.x * 260;
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
      this.cards.drawCard(
        {
          cx: ox + x,
          cy: oy + y,
          w,
          h,
          rx: card.tiltX.x + Math.sin(t * 0.8) * 0.06 * idle,
          ry: card.tiltY.x + Math.cos(t * 0.7) * 0.08 * idle,
          rz: rot + card.deal.x * 0.6 * (d >= 0 ? 1 : -1),
          scale: card.scale.x,
          edition: e.shader,
          intensity: state.intensity,
          pixel: PIXEL_STEPS[state.pixel] ? Math.max(18, PIXEL_STEPS[state.pixel] * 0.5) : 0,
          tilt: [card.tiltY.x / 0.35 + Math.sin(t * 0.5) * 0.5 * idle, card.tiltX.x / 0.3 + Math.cos(t * 0.4) * 0.5 * idle],
          light: [0.5, 0.35],
          alpha: 1 - clamp(card.deal.x, 0, 1) * 0.6,
          flash: 0,
          shadow: [4 + card.lift.x * 0.12, 6 + card.lift.x * 0.25],
          plate: false,
        },
        this.time,
      );
    }
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
