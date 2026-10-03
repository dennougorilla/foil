// Opening a pack: the overlay, its motion, input, light and sound. Loaded only when a pack is
// opened or replayed. The beats, timings and reasons are in docs/packs.md ("Opening — our beats").
//
// One WebGL canvas over the page draws the wrapper (printed in the pack's wrapper finish), the
// cards (the person's own card face in each finish) and pixel particles; light that has to bloom
// (the cut, the light pouring out, rays) is CSS over and under it.

import './opening.css';
import { BackgroundRenderer, CardRenderer, hexToRgb, type CardDraw, type Particle, type RGB } from '../gl/renderers';
import { editionById, type EditionId } from '../editions';
import { tierOf, type Pack } from '../packs';
import type { Dict } from '../i18n';
import type { PackId } from '../packs';
import { tuneGl, type Tune } from '../tune/model';
import type { FinishModule } from '../gl/finishes/types';
import { Spring } from '../stage';
import { sfx } from '../audio';
import { paintPack, paintShowpieceBack, PACK_H, PACK_W, TEAR_Y } from './packArt';
import { buzz, packSfx } from './sounds';
import { PACK_EN } from '../packText';

export interface OpeningOptions {
  pack: Pack;
  /** The shelf chip the pack flies out of. */
  from: DOMRect;
  /** Opened before: watching it again. */
  replay: boolean;
  dict: Dict;
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  back: HTMLCanvasElement;
  tune: Tune;
  intensity: number;
  /** The pack's finishes arriving (src/gl/finishes/registry.ts). */
  finishes: Promise<FinishModule>;
  /** Stops the stage underneath from drawing while the overlay is up. */
  pause: (on: boolean) => void;
  /** The pack counts as opened from the tear (or a skip) on. */
  onOpened: () => void;
  /** Closed; `pick` is the finish chosen to try, if any. */
  onClose: (pick: EditionId | null) => void;
}

type Phase = 'load' | 'pack' | 'rip' | 'draw' | 'deck' | 'haul' | 'closing';

interface CardSim {
  id: EditionId;
  shader: number;
  tier: 1 | 2 | 3;
  x: Spring;
  y: Spring;
  rz: Spring;
  s: Spring;
  /** Turn about the vertical axis: π shows the back. */
  flip: number;
  alpha: number;
  /** Thrown off the stack: moves on its own velocity. */
  flying: boolean;
  vx: number;
  vy: number;
  vr: number;
  flash: number;
  /** When it is dealt into the haul (seconds into the haul), and whether it has been. */
  dealAt: number;
  dealt: boolean;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutBack = (p: number) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
const band = (d: number, k = 520) => (d * 0.9) / (1 + Math.abs(d) / k);
const WHITE: RGB = [1, 1, 1];

/** What each theme's sparks are made of: hot metal sparks, rising star motes, drifting petals, print dots, gold leaf. */
const STYLES: Record<PackId, { palette: string[]; g: number; drag: number; sway: number; size: [number, number] }> = {
  metal: { palette: ['#fff6d8', '#f2c14e', '#d18a2c'], g: 1200, drag: 1.2, sway: 0, size: [3, 7] },
  light: { palette: ['#ffffff', '#c8f4ff', '#a99bff'], g: -50, drag: 2.6, sway: 0, size: [3, 6] },
  nature: { palette: ['#ffe0ea', '#ffa8c8', '#ff7aa8'], g: 120, drag: 3.2, sway: 120, size: [6, 9] },
  studio: { palette: ['#00b7eb', '#ff2e88', '#ffe600', '#f3eee2'], g: 800, drag: 1.4, sway: 0, size: [6, 9] },
  supporter: { palette: ['#f2c14e', '#ffe7a8', '#ffffff'], g: 900, drag: 1.5, sway: 40, size: [4, 8] },
};
const GOLD: RGB = hexToRgb('#f2c14e');

export function openPack(o: OpeningOptions) {
  const { pack, dict } = o;
  const t = dict.pack;
  const rich = !!pack.supporter;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const name = t.name[pack.id];
  const n = pack.finishes.length;
  const colors = pack.colors.map(hexToRgb) as [RGB, RGB, RGB];
  const style = STYLES[pack.id];
  const themed = style.palette.map(hexToRgb);
  /** The room's swirl: the pack's dark and mid tones, its light one held back so the cards stay the brightest thing. */
  const room = [colors[0], colors[1], colors[1].map((v, i) => v * 0.6 + colors[2][i] * 0.2)] as [RGB, RGB, RGB];

  // ---------- DOM ----------

  const root = document.createElement('div');
  root.className = 'pk';
  if (rich) root.classList.add('is-supporter');
  if (reduced) root.classList.add('is-still');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t.dialog.replace('{name}', name));
  root.tabIndex = -1;
  root.style.setProperty('--a', pack.colors[0]);
  root.style.setProperty('--b', pack.colors[1]);
  root.style.setProperty('--c', pack.colors[2]);
  root.innerHTML = `
    <div class="pk-room" aria-hidden="true"><canvas class="pk-swirl"></canvas></div>
    <div class="pk-stage" aria-hidden="true">
      <div class="pk-rays"></div>
      <div class="pk-aura"></div>
      <canvas class="pk-gl"></canvas>
      <div class="pk-guide"><i></i></div>
      <div class="pk-cut"></div>
      <div class="pk-pour"></div>
      <div class="pk-sweep"></div>
    </div>
    <header class="pk-head">
      <p class="pk-title"><b></b><small></small></p>
      <div class="pk-tools">
        <button class="pk-skip" type="button"><span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3l6 5-6 5zm6 0l6 5-6 5z"/></svg></button>
        <button class="pk-x" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2h2v2h2V5h2V3h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2V9H7v2H5v2H3v-2h2V9h2V7H5V5H3z"/></svg></button>
      </div>
    </header>
    <p class="pk-hint" aria-hidden="true"></p>
    <button class="btn btn-paper pk-open" type="button"></button>
    <div class="pk-label" aria-hidden="true"><span class="pk-tags"><span class="pk-step"></span><span class="pk-tag"></span></span><b></b><small></small></div>
    <div class="pk-haul">
      <p class="pk-haul-title"><b></b><small></small></p>
      <ol class="pk-names"></ol>
      <div class="pk-actions">
        <button class="btn btn-quiet pk-close" type="button"></button>
        <button class="btn btn-primary pk-try" type="button"></button>
      </div>
    </div>
    <p class="sr-only pk-live" aria-live="polite"></p>`;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const canvas = $<HTMLCanvasElement>('.pk-gl');
  const stageEl = $('.pk-stage');
  const cutEl = $('.pk-cut');
  const guideEl = $('.pk-guide');
  const pourEl = $('.pk-pour');
  const sweepEl = $('.pk-sweep');
  const raysEl = $('.pk-rays');
  const auraEl = $('.pk-aura');
  const hintEl = $('.pk-hint');
  const labelEl = $('.pk-label');
  const openBtn = $<HTMLButtonElement>('.pk-open');
  const skipBtn = $<HTMLButtonElement>('.pk-skip');
  const live = $('.pk-live');
  $('.pk-title b').textContent = t.title.replace('{name}', name);
  $('.pk-title small').textContent = rich ? t.thanks : t.count.replace('{n}', String(n));
  skipBtn.querySelector('span')!.textContent = t.skip;
  $('.pk-x').setAttribute('aria-label', t.close);
  $('.pk-x').title = t.close;
  openBtn.textContent = t.openBtn;
  hintEl.textContent = t.loading;
  $('.pk-haul-title b').textContent = (o.replay ? t.haulReplay : t.haul).replace('{name}', name).replace('{n}', String(n));
  // One line under the title: where the finishes went (first time only), and what to do now.
  $('.pk-haul-title small').textContent = (o.replay ? '' : t.haulSub.replace('{name}', name) + ' ') + t.haulHint;
  $('.pk-try').textContent = t.try.replace('{finish}', dict.edition[pack.finishes[n - 1]]);
  $('.pk-close').textContent = t.close;
  document.body.appendChild(root);
  root.focus({ preventScroll: true });
  requestAnimationFrame(() => root.classList.add('is-in'));
  o.pause(true);

  const say = (msg: string) => {
    live.textContent = '';
    setTimeout(() => (live.textContent = msg), 50);
  };

  // ---------- GL ----------

  const r = new CardRenderer(canvas);
  // The room: FOIL's own swirl, in the pack's colors, drawn small and scaled up pixelated.
  const swirl = new BackgroundRenderer($<HTMLCanvasElement>('.pk-swirl'));
  r.tune = tuneGl(o.tune);
  r.setFace(o.face, o.mask);
  // Only the showpiece is ever seen face down, so the overlay's card back is its back.
  const back = document.createElement('canvas');
  paintShowpieceBack(back, o.back, pack);
  r.setBack(back);
  const packFace = document.createElement('canvas');
  const packMask = document.createElement('canvas');
  const wrap = editionById(pack.wrap).shader;
  const paint = () =>
    paintPack(packFace, packMask, pack, {
      big: PACK_EN.name[pack.id].toUpperCase(),
      title: t.title.replace('{name}', name),
      count: t.count.replace('{n}', String(n)),
      ribbon: rich ? t.supporterTag : undefined,
    });
  paint();
  r.setFace(packFace, packMask, 'pack');
  // The pixel font may still be on its way the first time; repaint once it is in.
  void document.fonts.load('76px Silkscreen').then(() => {
    paint();
    r.setFace(packFace, packMask, 'pack');
  });

  // ---------- Scene ----------

  const maxDpr = (navigator.hardwareConcurrency || 8) <= 4 || coarse ? 1.5 : 2;
  let vw = innerWidth;
  let vh = innerHeight;
  let cardW = 0;
  let cardH = 0;
  let packW = 0;
  let packH = 0;
  let cx = 0;
  let cy = 0;
  const layout = () => {
    vw = innerWidth;
    vh = innerHeight;
    cardH = Math.min(vh * 0.48, (vw - 32) * 0.62 * 1.4, 480);
    cardW = (cardH * 5) / 7;
    packW = cardW * 1.16;
    packH = (packW * PACK_H) / PACK_W;
    cx = vw / 2;
    cy = vh * 0.47;
  };
  layout();

  let phase: Phase = 'load';
  let phaseT = 0;
  let time = 0;
  const setPhase = (p: Phase) => {
    phase = p;
    phaseT = 0;
    root.dataset.phase = p;
  };
  setPhase('load');

  // The pack starts on its shelf chip and flies to the middle.
  const fromX = o.from.left + o.from.width / 2;
  const fromY = o.from.top + o.from.height / 2;
  const pk = {
    x: new Spring(reduced ? cx : fromX, cx, 170, 13),
    y: new Spring(reduced ? cy : fromY, cy, 170, 13),
    s: new Spring(reduced ? 1 : 0.12, 1, 170, 13),
    rz: new Spring(0, 0, 150, 9),
    rx: new Spring(0, 0, 210, 17),
    ry: new Spring(0, 0, 210, 17),
    alpha: 1,
    flash: 0,
    drop: { on: false, vy: 0, vr: 0 },
  };
  const strip = { on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, alpha: 1 };

  /** The cut being traced, in screen x. */
  const cut = { active: false, auto: false, done: false, draining: false, x0: 0, min: 0, max: 0, p: 0, grains: 0, buzzes: 0, autoT: 0, autoDir: 1, pid: -1, downT: 0, moved: 0, lastX: 0, speed: 0 };

  const cards: CardSim[] = pack.finishes.map((id, i) => ({
    id,
    shader: editionById(id).shader,
    tier: Math.min(3, tierOf(pack, i) + (rich && i < n - 1 ? 1 : 0)) as 1 | 2 | 3,
    x: new Spring(cx, cx, 150, 14),
    y: new Spring(cy, cy, 150, 14),
    rz: new Spring(0, 0, 200, 15),
    s: new Spring(1, 1, 320, 14),
    flip: i === n - 1 ? Math.PI : 0,
    alpha: 0,
    flying: false,
    vx: 0,
    vy: 0,
    vr: 0,
    flash: 0,
    dealAt: 0,
    dealt: false,
  }));
  const showpiece = cards[n - 1];
  let top = 0;
  /** The showpiece: face down, gathering itself, or turned up. */
  let hit: 'down' | 'charge' | 'up' = 'down';
  let hitT = 0;
  let boomed = false;
  /** Seconds since the showpiece turned up: for a moment it is held up and a light sweeps across it. */
  let revealT = 0;
  const REVEAL = 1.6;
  let nextBuzz = 0;
  const drag = { active: false, pid: -1, sx: 0, sy: 0, lx: 0, lt: 0, vx: 0, moved: 0 };
  const pointer = { x: cx, y: cy, at: -10 };
  let gyro: [number, number] | null = null;
  let gyro0: [number, number] | null = null;
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    gyro0 ??= [e.gamma, e.beta];
    gyro = [clamp((e.gamma - gyro0[0]) / 25, -1, 1), clamp((e.beta - gyro0[1]) / 25, -1, 1)];
  };
  addEventListener('deviceorientation', onTilt);

  const particles: (Particle & { g: number; drag: number; sway: number; ph: number })[] = [];
  const shake = { t: 0, dur: 0, amp: 0 };
  const quake = (dur: number, amp: number) => {
    if (reduced) return;
    Object.assign(shake, { t: 0, dur, amp });
  };
  /** Particles in the theme's own make unless told otherwise. */
  const spray = (x: number, y: number, count: number, opts: { speed: [number, number]; up?: number; spread?: number; dir?: number; g?: number; size?: [number, number]; palette?: RGB[] }) => {
    if (reduced) return;
    const pal = opts.palette ?? themed;
    for (let i = 0; i < count && particles.length < 500; i++) {
      const a = (opts.dir ?? -Math.PI / 2) + (Math.random() - 0.5) * (opts.spread ?? TAU);
      const sp = opts.speed[0] + Math.random() * (opts.speed[1] - opts.speed[0]);
      const size = opts.size ?? style.size;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up ?? 0),
        size: Math.random() > 0.6 ? size[1] : size[0],
        life: 1,
        decay: 0.8 + Math.random() * 1.1,
        color: pal[Math.floor(Math.random() * pal.length)],
        g: opts.g ?? style.g,
        drag: style.drag,
        sway: style.sway,
        ph: Math.random() * TAU,
      });
    }
  };

  // ---------- Steps ----------

  const label = (c: CardSim | null, tag = '') => {
    labelEl.classList.toggle('is-on', !!c);
    if (!c) return;
    labelEl.querySelector('.pk-tag')!.textContent = tag;
    labelEl.querySelector('b')!.textContent = c.flip > Math.PI / 2 && c.flip < Math.PI * 1.5 ? '？？？' : dict.edition[c.id];
    labelEl.querySelector('small')!.textContent = c.flip > Math.PI / 2 && c.flip < Math.PI * 1.5 ? '' : dict.look[c.id];
    labelEl.classList.remove('is-pop');
    void labelEl.offsetWidth;
    labelEl.classList.add('is-pop');
  };
  /** The next step under the card; with a keyboard at hand, its key too. */
  const hint = (text: string, key = '') => {
    hintEl.textContent = text;
    if (key && !coarse) hintEl.insertAdjacentHTML('beforeend', ` <kbd>${key}</kbd>`);
    hintEl.classList.toggle('is-on', !!text);
  };

  let opened = false;
  const markOpened = () => {
    if (opened) return;
    opened = true;
    o.onOpened();
  };

  /** The trace is complete: the strip tears off and light pours out. */
  function rip() {
    cut.active = false;
    cut.done = true;
    cut.min = pk.x.x - packW / 2;
    cut.max = pk.x.x + packW / 2;
    markOpened();
    setPhase('rip');
    root.classList.add('is-torn');
    hint('');
    if (document.activeElement === openBtn) root.focus({ preventScroll: true });
    openBtn.hidden = true;
    packSfx.rip(rich);
    buzz([18, 30, 40]);
    if (reduced) return toHaul();
    const ty = pk.y.x - packH / 2 + packH * TEAR_Y;
    Object.assign(strip, { on: true, x: pk.x.x, y: pk.y.x - packH / 2 + (packH * TEAR_Y) / 2, vx: 300 * cut.autoDir, vy: -820, rot: 0, vr: 4 * cut.autoDir, alpha: 1 });
    pk.s.v += 1.6;
    pk.flash = 0.6;
    quake(0.22, 10);
    for (let i = 0; i < 36; i++) spray(pk.x.x + (Math.random() - 0.5) * packW, ty, 1, { speed: [200, 620], dir: -Math.PI / 2, spread: 1.4 });
    pourEl.classList.add('is-on');
  }

  /** The cards rise out of the bag and the bag drops away. */
  function draw() {
    setPhase('draw');
    // The bag slides down as the cards rise out of it, so they come up in full view, never past the top.
    const slide = Math.min(packH * 0.3, vh - (cy + packH / 2) + packH * 0.42);
    pk.y.target = cy + slide;
    const opening = pk.y.x - packH / 2 + packH * TEAR_Y;
    const later = cy + slide - packH / 2 + packH * TEAR_Y;
    cards.forEach((c, i) => {
      c.x.x = c.x.target = pk.x.x;
      c.y.x = opening + cardH * 0.5 + 8;
      c.y.target = Math.max(later - cardH * 0.2, 70 + cardH / 2) - i * 4;
      c.rz.x = pk.rz.x;
      c.alpha = 1;
    });
  }

  function toDeck() {
    setPhase('deck');
    top = 0;
    packSfx.land();
    buzz(10);
    surface();
  }

  /** The card now on top comes forward; its entrance depends on how rare it is. */
  function surface() {
    const c = cards[top];
    c.s.x = reduced ? 1 : 0.94;
    labelEl.querySelector('.pk-step')!.textContent = `${top + 1} / ${n}`;
    if (c === showpiece) {
      hint(t.charge, 'Enter');
      label(c, `★ ${t.showpiece}`);
      root.classList.add('is-waiting');
      return;
    }
    packSfx.pop(top);
    if (c.tier >= 2) {
      packSfx.chime();
      buzz(14);
      sweepEl.classList.remove('is-on');
      void sweepEl.offsetWidth;
      sweepEl.classList.add('is-on');
      for (let i = 0; i < 18; i++) {
        const side = Math.random() * TAU;
        spray(c.x.x + Math.cos(side) * cardW * 0.5, c.y.x + Math.sin(side) * cardH * 0.5, 1, { speed: [60, 220], up: 80, g: 200, size: [4, 7] });
      }
    }
    if (rich) packSfx.deal(top + 4);
    hint(top === 0 ? t.swipe : '', '→');
    label(c, rich ? t.supporterTag : '');
    say(dict.edition[c.id]);
  }

  /** Throws the top card off the stack (dir: -1 left, 1 right). */
  function throwTop(dir: number, vx = 0, vy = 0) {
    const c = cards[top];
    c.flying = true;
    c.vx = dir * Math.max(1500, Math.abs(vx));
    c.vy = vy * 0.4 - 120;
    c.vr = dir * 3.2;
    packSfx.swish();
    buzz(8);
    if (c === showpiece) return toHaul();
    top++;
    surface();
  }

  function charge() {
    if (hit !== 'down') return;
    hit = 'charge';
    hitT = 0;
    nextBuzz = 0;
    root.classList.remove('is-waiting');
    root.classList.add('is-charging');
    hint(t.charging);
    packSfx.charge(reduced ? 0.4 : 0.9);
  }

  /** The haul: every card dealt into a row, live on the person's picture, the showpiece in the middle. */
  let haulOrder: CardSim[] = [];
  let haulAt: { x: number; y: number; w: number; h: number; rz: number }[] = [];
  const haulLayout = () => {
    haulOrder = cards.slice(0, n - 1);
    haulOrder.splice(Math.floor(n / 2), 0, showpiece);
    // On a narrow screen the cards overlap a little, like a dealt fan, so each stays big enough to see.
    const overlap = vw < 600 ? 0.24 : 0;
    const room = vw - 24;
    const fit = (room - (vw < 600 ? 0 : Math.max(12, vw * 0.02) * (n - 1))) / (n - (n - 1) * overlap);
    const h = Math.min(vh * 0.44, fit * 1.4, 400);
    const w = (h * 5) / 7;
    const gap = overlap ? -w * overlap : Math.max(12, vw * 0.02);
    const total = n * w + (n - 1) * gap;
    const mid = (n - 1) / 2;
    // The showpiece takes the middle, a size up; the block of title, cards, names and buttons sits mid-screen.
    haulAt = haulOrder.map((c, i) => {
      const k = c === showpiece ? 1.12 : 1;
      return { x: vw / 2 - total / 2 + w / 2 + i * (w + gap), y: vh * 0.5 - (vw < 600 ? 0 : 30) + Math.abs(i - mid) * h * 0.05, w: w * k, h: h * k, rz: (i - mid) * 0.05 };
    });
  };
  let hoverHaul = -1;

  function toHaul() {
    markOpened();
    setPhase('haul');
    root.classList.remove('is-waiting', 'is-charging');
    root.classList.add('is-torn', 'is-haul', 'is-up');
    hint('');
    label(null);
    openBtn.hidden = true;
    pourEl.classList.remove('is-on');
    pk.alpha = 0;
    strip.on = false;
    haulLayout();
    cards.forEach((c) => {
      c.flying = false;
      c.flip = 0;
      if (c.alpha === 0) {
        // Skipped before the cards came out: they rise from the middle.
        c.x.x = cx;
        c.y.x = cy + (reduced ? 0 : 60);
        c.s.x = reduced ? 1 : 0.6;
      }
    });
    const names = $('.pk-names');
    names.innerHTML = '';
    haulOrder.forEach((c, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pk-name';
      if (c === showpiece) b.classList.add('is-showpiece');
      b.innerHTML = `${c === showpiece ? `<i>★ ${t.showpiece}</i>` : ''}<b></b><small></small>`;
      b.querySelector('b')!.textContent = dict.edition[c.id];
      b.querySelector('small')!.textContent = dict.look[c.id];
      b.addEventListener('click', () => close(c.id));
      b.addEventListener('pointerenter', () => (hoverHaul = i));
      b.addEventListener('pointerleave', () => (hoverHaul = -1));
      b.addEventListener('focus', () => (hoverHaul = i));
      b.addEventListener('blur', () => (hoverHaul = -1));
      b.style.setProperty('--d', `${(reduced ? 150 : 90) * i}ms`);
      li.appendChild(b);
      names.appendChild(li);
      c.alpha = reduced ? 0 : 1;
      c.dealAt = (reduced ? 0.15 : 0.09) * i;
      c.dealt = false;
    });
    say($('.pk-haul-title b').textContent!);
    $<HTMLButtonElement>('.pk-try').focus({ preventScroll: true });
  }

  function skip() {
    if (phase === 'haul' || phase === 'closing') return;
    if (phase === 'load') return close(null);
    toHaul();
  }

  let closed = false;
  function close(pick: EditionId | null) {
    if (closed) return;
    closed = true;
    setPhase('closing');
    if (pick) sfx.select(Math.max(0, pack.finishes.indexOf(pick)) + 3);
    root.classList.remove('is-in');
    setTimeout(() => {
      cancelAnimationFrame(raf);
      removeEventListener('deviceorientation', onTilt);
      document.removeEventListener('keydown', onKey);
      removeEventListener('resize', layout);
      r.gl.getExtension('WEBGL_lose_context')?.loseContext();
      swirl.gl.getExtension('WEBGL_lose_context')?.loseContext();
      root.remove();
      o.pause(false);
      o.onClose(pick);
    }, reduced ? 120 : 220);
  }

  // ---------- Input ----------

  const packRect = () => ({ l: pk.x.x - (packW * pk.s.x) / 2, r: pk.x.x + (packW * pk.s.x) / 2, t: pk.y.x - (packH * pk.s.x) / 2, b: pk.y.x + (packH * pk.s.x) / 2 });

  function startAuto() {
    if (phase !== 'pack' || cut.done || cut.active) return;
    const pr = packRect();
    Object.assign(cut, { active: true, auto: true, draining: false, x0: pr.l + 10, min: pr.l + 10, max: pr.l + 10, p: 0, autoT: 0, autoDir: 1, grains: 0, buzzes: 0 });
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = time;
    if (phase === 'pack' && !cut.done && !cut.active) {
      const pr = packRect();
      if (e.clientX < pr.l - 30 || e.clientX > pr.r + 30 || e.clientY < pr.t - 50 || e.clientY > pr.b) return;
      canvas.setPointerCapture(e.pointerId);
      Object.assign(cut, { active: true, auto: false, draining: false, x0: e.clientX, min: e.clientX, max: e.clientX, p: 0, pid: e.pointerId, downT: time, moved: 0, lastX: e.clientX, grains: 0, buzzes: 0, speed: 0 });
      return;
    }
    if (phase === 'deck') {
      if (cards[top] === showpiece && hit !== 'up') return charge();
      canvas.setPointerCapture(e.pointerId);
      Object.assign(drag, { active: true, pid: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, lt: time, vx: 0, moved: 0 });
      return;
    }
    if (phase === 'haul') {
      const i = haulHit(e.clientX, e.clientY);
      if (i >= 0) close(haulOrder[i].id);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = time;
    if (cut.active && !cut.auto && e.pointerId === cut.pid) {
      cut.moved = Math.max(cut.moved, Math.abs(e.clientX - cut.x0));
      cut.speed = Math.abs(e.clientX - cut.lastX);
      if (e.clientX > cut.lastX) cut.autoDir = 1;
      else if (e.clientX < cut.lastX) cut.autoDir = -1;
      cut.lastX = e.clientX;
      const pr = packRect();
      const x = clamp(e.clientX, pr.l, pr.r);
      cut.min = Math.min(cut.min, x);
      cut.max = Math.max(cut.max, x);
      cut.p = clamp((cut.max - cut.min) / ((pr.r - pr.l) * 0.78), 0, 1);
      if (cut.p >= 1) rip();
    }
    if (drag.active && e.pointerId === drag.pid) {
      const dt = Math.max(0.001, time - drag.lt);
      drag.vx = drag.vx * 0.6 + ((e.clientX - drag.lx) / dt) * 0.4;
      drag.lx = e.clientX;
      drag.lt = time;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      const c = cards[top];
      c.x.target = cx + band(dx);
      c.y.target = cy + band(dy) * 0.35;
      c.rz.target = band(dx) * 0.0012;
    }
    if (phase === 'haul') hoverHaul = haulHit(e.clientX, e.clientY);
  });

  const release = (e: PointerEvent) => {
    if (cut.active && !cut.auto && e.pointerId === cut.pid) {
      // A tap on the pack opens it for you; a trace stopped short drains back.
      if (cut.moved < 8 && time - cut.downT < 0.4) {
        cut.active = false;
        startAuto();
      } else {
        cut.active = false;
        cut.draining = true;
        packSfx.fizzle();
      }
    }
    if (drag.active && e.pointerId === drag.pid) {
      drag.active = false;
      const c = cards[top];
      const dx = e.clientX - drag.sx;
      if (drag.moved < 8) throwTop(-1);
      else if (Math.abs(dx) > cardW * 0.28 || Math.abs(drag.vx) > 800) throwTop(Math.sign(dx || drag.vx), drag.vx);
      else {
        c.x.target = cx;
        c.y.target = cy;
        c.rz.target = 0;
      }
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const haulHit = (x: number, y: number) => haulAt.findIndex((a) => Math.abs(x - a.x) < a.w / 2 && Math.abs(y - a.y) < a.h / 2);

  openBtn.addEventListener('click', startAuto);
  skipBtn.addEventListener('click', skip);
  $('.pk-x').addEventListener('click', () => close(null));
  $('.pk-try').addEventListener('click', () => close(showpiece.id));
  $('.pk-close').addEventListener('click', () => close(null));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      return phase === 'haul' || phase === 'load' ? close(null) : skip();
    }
    if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const items = [...root.querySelectorAll<HTMLElement>('button:not([hidden])')].filter((b) => b.offsetParent);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
      e.preventDefault();
      items[next].focus();
      return;
    }
    // Buttons answer their own Enter and Space; everything else drives the opening.
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
    const go = e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowLeft';
    if (!go) return;
    e.preventDefault();
    if (phase === 'pack') startAuto();
    else if (phase === 'deck') {
      if (cards[top] === showpiece && hit !== 'up') charge();
      else throwTop(e.key === 'ArrowRight' ? 1 : -1);
    }
  };
  // On the document, so keys still work when the focused button (Open) goes away.
  document.addEventListener('keydown', onKey);
  addEventListener('resize', layout);

  // ---------- Frame ----------

  let last = performance.now();
  let raf = 0;
  let ready = false;
  let failed = false;
  o.finishes.then(
    () => (ready = true),
    () => {
      failed = true;
      hint(t.failed);
    },
  );

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    phaseT += dt;
    const dpr = Math.min(devicePixelRatio || 1, maxDpr);
    r.resize(vw, vh, dpr);
    swirl.resize(Math.ceil(vw / 4), Math.ceil(vh / 4));
    swirl.render({ time: (reduced ? 0 : time) + 40, colors: room, pointer: [0.5, 0.5], focus: [0.5, 0.53] });

    if (phase === 'load') {
      // Wait for the pack's finishes and every program this opening draws.
      if (failed) return;
      if (phaseT > 0.25) hint(t.loading);
      if (!ready || !r.ready(wrap) || !cards.every((c) => r.ready(c.shader))) return;
      // Draw every card once, unseen, so first-use work (Relief reading the picture, the driver's
      // own) lands here and not on the tear.
      r.begin();
      for (const c of cards) r.drawCard({ cx: -9999, cy: -9999, w: cardW, h: cardH, rx: 0, ry: 0, rz: 0, scale: 1, edition: c.shader, intensity: o.intensity, pixel: 0, tilt: [0, 0], light: [0.5, 0.5], alpha: 0, flash: 0, shadow: null }, 0);
      setPhase('pack');
      hint(t.trace, 'Enter');
      openBtn.hidden = false;
      if (!reduced) {
        pk.rz.v = 7;
        packSfx.whoosh();
        buzz(8);
      }
    }

    step(dt);
    render();
  };

  function step(dt: number) {
    const motion = reduced ? 0 : 1;
    // Pack
    if (phase === 'pack' || phase === 'rip' || phase === 'draw') {
      pk.x.target = cx;
      if (!pk.drop.on && phase !== 'draw') pk.y.target = cy;
      const pointing = time - pointer.at < 2.5 && !coarse;
      const lean = cut.active ? [clamp((cut.lastX - pk.x.x) / (packW / 2), -1, 1) * 0.5, -0.4] : pointing ? [clamp((pointer.x - pk.x.x) / (packW / 2), -1, 1), clamp((pointer.y - pk.y.x) / (packH / 2), -1, 1)] : gyro ?? [0, 0];
      pk.ry.target = lean[0] * 0.3 * motion;
      pk.rx.target = -lean[1] * 0.25 * motion;
      if (cut.active && !reduced) pk.rz.v += (Math.random() - 0.5) * Math.min(cut.speed, 40) * 0.05;
      for (let i = 0; i < 4; i++) for (const sp of [pk.x, pk.y, pk.s, pk.rz, pk.rx, pk.ry]) sp.step(dt / 4);
      pk.flash = Math.max(0, pk.flash - dt * 5);
    }
    // The trace
    if (cut.active && cut.auto) {
      const pr = packRect();
      cut.autoT += dt / 0.48;
      const p = easeInOut(clamp(cut.autoT, 0, 1));
      cut.lastX = pr.l + 10 + (pr.r - pr.l - 20) * p;
      cut.speed = 30;
      cut.max = cut.lastX;
      cut.p = p;
      if (cut.autoT >= 1) rip();
    }
    if (cut.active) {
      const g = Math.floor(cut.p / 0.04);
      if (g > cut.grains) {
        cut.grains = g;
        packSfx.tear(cut.p);
      }
      const b = Math.floor(cut.p / 0.12);
      if (b > cut.buzzes) {
        cut.buzzes = b;
        buzz(6);
      }
      const ty = pk.y.x - (packH * pk.s.x) / 2 + packH * pk.s.x * TEAR_Y;
      spray(cut.lastX, ty, cut.speed > 2 || cut.auto ? 3 : 1, { speed: [80, 380], up: 160 });
    }
    if (cut.draining) {
      cut.p = Math.max(0, cut.p - dt / 0.26);
      const mid = cut.x0;
      cut.min += (mid - cut.min) * Math.min(1, dt * 12);
      cut.max += (mid - cut.max) * Math.min(1, dt * 12);
      if (cut.p <= 0) cut.draining = false;
    }
    if (pk.drop.on && pk.alpha > 0) {
      pk.drop.vy += 4200 * dt;
      pk.y.x += pk.drop.vy * dt;
      pk.y.target = pk.y.x;
      pk.rz.x += pk.drop.vr * dt;
      if (pk.y.x - packH / 2 > vh) pk.alpha = 0;
    }
    // Rip: the strip flies, then the cards come out.
    if (strip.on) {
      strip.vy += 2200 * dt;
      strip.x += strip.vx * dt;
      strip.y += strip.vy * dt;
      strip.rot += strip.vr * dt;
      strip.alpha = Math.max(0, strip.alpha - dt / 0.7);
      if (strip.alpha <= 0) strip.on = false;
    }
    if (phase === 'rip' && phaseT > 0.35) draw();
    if (phase === 'draw') {
      // The bag lets go and falls; a beat later the stack settles where the bag was.
      if (phaseT > 0.42 && !pk.drop.on) {
        pk.drop.on = true;
        pk.drop.vy = 420;
        pk.drop.vr = 0.9;
        pourEl.classList.remove('is-on');
      }
      if (phaseT > 0.52 && cards[0].y.target < cy - 1)
        cards.forEach((c, i) => {
          c.y.target = cy + i * 7;
          c.s.target = 1 - i * 0.025;
        });
      if (phaseT > 0.9) toDeck();
    }
    // Deck: cards under the top one sit a little lower and smaller.
    if (phase === 'deck') {
      cards.forEach((c, i) => {
        if (c.flying || i < top) return;
        const k = i - top;
        if (i !== top || !drag.active) {
          c.x.target = cx;
          c.y.target = cy + k * 7;
          c.rz.target = k ? (k % 2 ? 0.035 : -0.03) : 0;
        }
        c.s.target = (1 - k * 0.025) * (c === showpiece && hit === 'charge' ? 1.08 : c === showpiece && boomed ? 1.06 : 1);
      });
      if (cards[top] === showpiece) stepHit(dt);
    }
    // Haul: each card floats and leans to the pointer; the hovered one lifts.
    if (phase === 'haul') {
      haulLayout();
      haulOrder.forEach((c, i) => {
        const at = haulAt[i];
        if (phaseT < c.dealAt) return;
        if (!c.dealt) {
          c.dealt = true;
          if (!reduced) packSfx.deal(i + 2);
        }
        c.x.target = at.x;
        c.y.target = at.y - (i === hoverHaul ? at.h * 0.05 : 0);
        c.rz.target = at.rz;
        c.s.target = (at.h / cardH) * (i === hoverHaul ? 1.06 : 1);
        if (reduced) {
          c.alpha = clamp((phaseT - c.dealAt) / 0.2, 0, 1);
          c.x.x = c.x.target;
          c.y.x = c.y.target;
          c.s.x = c.s.target;
          c.rz.x = c.rz.target;
        }
      });
    }
    // Every card
    for (const c of cards) {
      if (c.flying) {
        c.vy += 1400 * dt;
        c.x.x += c.vx * dt;
        c.y.x += c.vy * dt;
        c.rz.x += c.vr * dt;
        continue;
      }
      for (let i = 0; i < 4; i++) for (const sp of [c.x, c.y, c.rz, c.s]) sp.step(dt / 4);
      c.flash = Math.max(0, c.flash - dt * 2);
    }
    // Particles and shake
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g * dt;
      p.vx *= 1 - dt * p.drag;
      p.vy *= 1 - dt * p.drag * 0.4;
      if (p.sway) p.vx += Math.sin(p.ph + p.life * 9) * p.sway * dt * 6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    // (Held back while the pack tears and the cards come out, so the tear stays the one thing to watch.)
    if (rich && !reduced && phase !== 'rip' && phase !== 'draw' && particles.length < 80 && Math.random() < dt * 8) {
      // Gold dust drifting up through the room, the whole time.
      particles.push({ x: Math.random() * vw, y: vh + 10, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 60, size: Math.random() > 0.7 ? 6 : 4, life: 1, decay: 0.12 + Math.random() * 0.1, color: Math.random() > 0.3 ? GOLD : WHITE, g: -10, drag: 0, sway: 0, ph: 0 });
    }
    shake.t += dt;
  }

  /** The showpiece: gathering itself, then turning over with everything at once. */
  function stepHit(dt: number) {
    const c = showpiece;
    if (hit === 'down' && !reduced) {
      c.rz.target = Math.sin(time * 30) * 0.008;
      // Sparks rise off its edges while it waits to be turned over.
      if (Math.random() < dt * 10) {
        const side = Math.random() < 0.5 ? -1 : 1;
        spray(c.x.x + side * cardW * 0.5, c.y.x + (Math.random() - 0.5) * cardH, 1, { speed: [10, 60], up: 60, g: -40, size: [4, 6] });
      }
    }
    if (hit === 'charge') {
      hitT += dt;
      const dur = reduced ? 0.4 : 0.9;
      const k = clamp(hitT / dur, 0, 1);
      if (!reduced) {
        c.x.x = cx + (Math.random() - 0.5) * 12 * k;
        c.y.x = cy + (Math.random() - 0.5) * 8 * k;
      }
      raysEl.style.opacity = String(0.7 * k);
      if (hitT >= nextBuzz) {
        buzz(10);
        nextBuzz = hitT + 0.24 - 0.16 * k;
      }
      if (hitT >= dur) {
        hit = 'up';
        hitT = 0;
        root.classList.remove('is-charging');
        root.classList.add('is-up');
      }
    }
    if (hit === 'up') {
      hitT += dt;
      if (boomed) {
        revealT += dt;
        if (revealT > REVEAL) root.classList.remove('is-revealing');
      }
      const p = clamp(hitT / (reduced ? 0.01 : 0.42), 0, 1);
      c.flip = Math.PI + Math.PI * easeOutBack(p);
      if (!boomed && (reduced || c.flip > Math.PI * 1.5)) {
        boomed = true;
        revealT = 0;
        root.classList.add('is-revealing');
        c.flash = 0.9;
        c.s.v += 3.2;
        quake(0.36, 16);
        raysEl.style.opacity = '';
        spray(cx, cy, rich ? 80 : 64, { speed: [300, 900], up: 120, palette: [...themed, WHITE, hexToRgb(editionById(c.id).color)] });
        packSfx.reveal(rich);
        buzz([40, 40, 80]);
        label(c, `★ ${t.showpiece}`);
        hint(t.swipe, '→');
        say(`${t.showpiece}: ${dict.edition[c.id]}`);
      }
    }
  }

  const draws: CardDraw[] = [];
  function render() {
    // Screen shake moves the stage, not the words and buttons.
    const k = shake.dur ? Math.max(0, 1 - shake.t / shake.dur) : 0;
    stageEl.style.transform = k > 0 ? `translate(${((Math.random() - 0.5) * 2 * shake.amp * k * k).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * shake.amp * k * k).toFixed(1)}px)` : '';
    r.begin();
    draws.length = 0;
    const idle = reduced ? 0 : 1;
    const sway = Math.sin(time * TAU * 0.5) * 6 * idle;

    // Cards behind the pack while they come out, otherwise from the bottom of the stack up.
    // In the haul the showpiece sits on top of its neighbours, and the hovered card on top of all.
    const rank = (c: CardSim, i: number) => (i === hoverHaul ? 2 : c === showpiece ? 1 : 0);
    const order = phase === 'haul' ? haulOrder.map((c, i) => [c, i] as const).sort((a, b) => rank(...a) - rank(...b)) : [...cards].map((c, i) => [c, i] as const).reverse();
    const cardLayer: CardDraw[] = [];
    for (const [c, i] of order) {
      if (c.alpha <= 0) continue;
      const size = phase === 'haul' ? haulAt[i] : { w: cardW, h: cardH };
      const s = phase === 'haul' ? c.s.x / (size.h / cardH) : c.s.x;
      const floatY = phase === 'haul' ? Math.sin(time * 1.4 + i) * 4 * idle : 0;
      const lean = phase === 'haul' && i === hoverHaul && !reduced ? clamp((pointer.x - c.x.x) / (size.w / 2), -1, 1) * 0.3 : 0;
      // The turned-up showpiece rocks slowly so its finish keeps catching the light.
      const rock = c === showpiece && boomed && !c.flying ? Math.sin(time * 1.3) * (phase === 'haul' ? 0.12 : 0.24) * idle : 0;
      // Right after it turns, the light sweeps across the showpiece once, so its finish is the climax.
      const sweep = c === showpiece && phase === 'deck' && boomed && revealT < REVEAL ? easeInOut(revealT / REVEAL) : -1;
      const ry = c.flip + lean + rock + (phase === 'deck' && !c.flying ? Math.sin(time * 0.8 + i) * 0.04 * idle : 0);
      cardLayer.push({
        cx: c.x.x,
        cy: c.y.x + floatY,
        w: size.w,
        h: size.h,
        rx: phase === 'haul' ? Math.cos(time * 0.7 + i) * 0.05 * idle : 0,
        ry,
        rz: c.rz.x,
        scale: s,
        edition: c.shader,
        intensity: o.intensity,
        pixel: 0,
        tilt:
          sweep >= 0
            ? [-1.2 + sweep * 2.4, -0.6 + sweep * 1.2]
            : rock
              ? [Math.sin(time * 1.3) * 1.1 + lean * 3, Math.cos(time * 0.9) * 0.5]
              : [Math.sin(time * 0.6 + i) * 0.6 * idle + lean * 3 + (c.x.x - cx) / vw, Math.cos(time * 0.5 + i) * 0.5 * idle],
        light: sweep >= 0 ? [-0.2 + sweep * 1.4, 0.2 + sweep * 0.4] : rock ? [0.5 - Math.sin(time * 1.3) * 0.45, 0.3] : [0.5 - lean * 1.4, 0.35],
        alpha: c.alpha,
        flash: c.flash,
        shadow: [8 + (s - 1) * 40, 12 + (s - 1) * 60],
      });
    }
    const packLayer: CardDraw[] = [];
    if (pk.alpha > 0 && phase !== 'load' && phase !== 'haul') {
      const s = pk.s.x;
      const lean: [number, number] = [pk.ry.x / 0.3, pk.rx.x / 0.25];
      const base = {
        rx: pk.rx.x,
        ry: pk.ry.x,
        scale: 1,
        edition: wrap,
        intensity: 1,
        pixel: 0,
        tilt: [lean[0] + Math.sin(time * 0.7) * 0.4 * idle, lean[1] + Math.cos(time * 0.55) * 0.3 * idle] as [number, number],
        light: [clamp(0.5 + lean[0] * 0.4, 0, 1), clamp(0.35 + lean[1] * 0.3, 0, 1)] as [number, number],
        alpha: pk.alpha,
        flash: pk.flash,
        plate: false,
        face: 'pack',
      };
      const px = pk.x.x;
      const py = pk.y.x + (phase === 'pack' ? sway : 0);
      const W = packW * s;
      const H = packH * s;
      if (!cut.done) packLayer.push({ ...base, cx: px, cy: py, w: W, h: H, rz: pk.rz.x, shadow: [12, 18] });
      else {
        // The body below the tear; it rotates about the whole bag's centre.
        const off = (H * TEAR_Y) / 2;
        packLayer.push({ ...base, cx: px - Math.sin(pk.rz.x) * off, cy: py + Math.cos(pk.rz.x) * off, w: W, h: H * (1 - TEAR_Y), rz: pk.rz.x, uv: [0, TEAR_Y, 1, 1], shadow: [12, 18] });
      }
    }
    if (strip.on) {
      packLayer.push({
        cx: strip.x,
        cy: strip.y,
        w: packW,
        h: packH * TEAR_Y,
        rx: 0,
        ry: 0,
        rz: strip.rot,
        scale: 1,
        edition: wrap,
        intensity: 1,
        pixel: 0,
        tilt: [strip.rot, 0],
        light: [0.5, 0.3],
        alpha: strip.alpha,
        flash: 0,
        shadow: null,
        plate: false,
        face: 'pack',
        uv: [0, 0, 1, TEAR_Y],
      });
    }
    draws.push(...(phase === 'draw' || phase === 'rip' ? [...cardLayer, ...packLayer] : [...packLayer, ...cardLayer]));
    for (const d of draws) r.drawCard(d, time);
    r.drawParticles(particles);
    overlays(sway);
  }

  /** Places the CSS light (cut line, guide, aura, rays, sweep, label) on the scene. */
  function overlays(sway: number) {
    const s = pk.s.x;
    const ty = pk.y.x + (phase === 'pack' ? sway : 0) - (packH * s) / 2 + packH * s * TEAR_Y;
    const showGuide = phase === 'pack' && !cut.active && !cut.draining;
    guideEl.classList.toggle('is-on', showGuide);
    if (showGuide) guideEl.style.transform = `translate(${(pk.x.x - (packW * s) / 2 + 14).toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${pk.rz.x.toFixed(4)}rad)`;
    guideEl.style.width = `${(packW * s - 28).toFixed(1)}px`;
    guideEl.style.setProperty('--run', `${(packW * s - 54).toFixed(0)}px`);
    const hy = phase === 'pack' || phase === 'load' ? pk.y.x + (packH * s) / 2 + 20 : cy + cardH / 2 + 38 + labelEl.offsetHeight;
    root.style.setProperty('--hint-y', `${Math.min(hy, vh - 120).toFixed(0)}px`);
    const showCut = (cut.active || cut.draining || phase === 'rip') && cut.max > cut.min;
    cutEl.classList.toggle('is-on', showCut);
    if (showCut) {
      cutEl.style.width = `${(cut.max - cut.min).toFixed(1)}px`;
      cutEl.style.transform = `translate(${cut.min.toFixed(1)}px, ${ty.toFixed(1)}px)`;
    }
    if (phase === 'rip' || phase === 'draw') {
      pourEl.style.transform = `translate(${pk.x.x.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      pourEl.style.setProperty('--w', `${(packW * s).toFixed(0)}px`);
    }
    const focus = phase === 'haul' ? haulAt[haulOrder.indexOf(showpiece)] : null;
    const ax = focus ? focus.x : cx;
    const ay = focus ? focus.y : cy;
    raysEl.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`;
    auraEl.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`;
    auraEl.style.setProperty('--w', `${(focus ? focus.w : cardW).toFixed(0)}px`);
    auraEl.style.setProperty('--h', `${(focus ? focus.h : cardH).toFixed(0)}px`);
    if (phase === 'deck') {
      const c = cards[top];
      sweepEl.style.transform = `translate(${c.x.x.toFixed(1)}px, ${c.y.x.toFixed(1)}px) rotate(${c.rz.x.toFixed(4)}rad)`;
      sweepEl.style.setProperty('--w', `${(cardW * c.s.x).toFixed(0)}px`);
      sweepEl.style.setProperty('--h', `${(cardH * c.s.x).toFixed(0)}px`);
    }
    labelEl.style.top = `${(cy + cardH / 2 + 26).toFixed(0)}px`;
    if (phase === 'haul') {
      const names = root.querySelectorAll<HTMLElement>('.pk-name');
      haulAt.forEach((a, i) => {
        const el = names[i];
        if (!el) return;
        el.style.left = `${a.x.toFixed(1)}px`;
        el.style.top = `${(a.y + a.h / 2 + 14).toFixed(1)}px`;
        el.style.width = `${(a.w + 12).toFixed(0)}px`;
        el.classList.toggle('is-hot', i === hoverHaul);
      });
      // The title sits just above the cards and the buttons just under the names: one block.
      const above = Math.min(...haulAt.map((a) => a.y - a.h / 2));
      const after = Math.max(...[...names].map((el) => el.offsetTop + el.scrollHeight + 8));
      const haulEl = $('.pk-haul');
      haulEl.style.setProperty('--above', `${above.toFixed(0)}px`);
      haulEl.style.setProperty('--after', `${Math.min(after, vh - 80).toFixed(0)}px`);
    }
  }

  raf = requestAnimationFrame(frame);
}
