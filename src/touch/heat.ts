// Heat on the card for the Warmth finish (where it was touched, how warm it still is, and the
// fingerprints left by a press), the light stored by the Glow finish's ink, where Rainy Window's
// fogged glass was wiped, and how far Marble's floating ink has been carried (two numbers a cell: a
// direction). A small grid over
// the card face, simulated on the CPU (a few thousand cells, so it costs next to nothing) and
// uploaded to the card shader as a texture.
//
// No imports: the tests load this file directly with Node.

/** Grid cells across the card's short side; cells are square on every shape. */
const HEAT_CELLS = 60;

/** Most heat one spot holds: a finger left still for a while. */
const MAX = 1.5;
/** Below this everywhere, the card counts as cold and stops simulating. */
const COLD = 0.002;
/** Fingerprints kept at once; the oldest makes way. */
const PRINTS = 3;

/** The touch finishes: Warmth's heat, the light Glow's ink stores, Rainy Window's wiped glass, or how far Marble's ink was carried. */
export type TouchKind = 'warmth' | 'glow' | 'rain' | 'marble';

interface Fade {
  /** How fast it spreads, in cells² per second. */
  spread: number;
  /** Newton decay per second, plus a small steady loss so the tail really reaches zero. */
  cool: number;
  loss: number;
  /** Decay that grows with the square of what is left: a bright spot dims fast, a faint one lingers. */
  quench: number;
  /** A press leaves a fingerprint; without, holding still just keeps adding. */
  prints: boolean;
  /** The field is a displacement (u, v per cell): a stroke drags it along, a press stirs it round. */
  drag?: boolean;
}

const FADES: Record<TouchKind, Fade> = {
  // Heat spreads slowly, so a cooling trail narrows along its line instead of smearing; gone in about ten seconds.
  warmth: { spread: 0.5, cool: 0.42, loss: 0.02, quench: 0, prints: true },
  // Light stays where it was shone and dies away like a real afterglow: half gone in a couple of
  // seconds, then a faint glow that hangs on for twenty or so.
  glow: { spread: 0, cool: 0.02, loss: 0.0015, quench: 1, prints: false },
  // A wiped patch stays clear for a few seconds while the fog creeps back in from its edges; a
  // fingertip pressed on the glass leaves its print in the fog.
  rain: { spread: 0.4, cool: 0.3, loss: 0.02, quench: 0, prints: true },
  // The water draws dragged ink back gently: a third gone in a second or so, settled within a loop.
  // A little spreading softens a comb line into the broad sweep of a current as it relaxes.
  marble: { spread: 0.35, cool: 0.45, loss: 0, quench: 0, prints: false, drag: true },
};

/** How much of a stroke's travel the ink right under it follows: a finger, a hovering mouse. */
const DRAG_FIRM = 1;
const DRAG_HOVER = 0.35;
/** How fast a finger held still turns the ink under it, radians per second at its centre. */
const STIR = 2.6;
/** Below this everywhere (in card uv), Marble's ink counts as settled. */
const STILL = 0.0006;

export interface Print {
  /** Centre, in card uv (y down). */
  u: number;
  v: number;
  /** Turn of the print, radians. */
  angle: number;
  /** 0..1: builds while pressed, cools after. */
  heat: number;
}

/** What the card shader reads. `version` changes whenever `data` or `prints` do. */
export interface HeatSource {
  readonly data: Float32Array;
  readonly version: number;
  readonly prints: readonly Print[];
  /** Where the touch is right now (card uv) and how strongly: Glow draws its lamp there. */
  readonly lamp: readonly [number, number, number];
  /** Grid size, columns × rows. */
  readonly w: number;
  readonly h: number;
  /** Numbers per cell: 1 (heat, light) or 2 (Marble's displacement, u then v). */
  readonly channels: 1 | 2;
}

export class HeatField implements HeatSource {
  readonly w: number;
  readonly h: number;
  readonly channels: 1 | 2;
  readonly data: Float32Array;
  private next: Float32Array;
  prints: Print[] = [];
  version = 0;
  private warm = false;
  private pressing: Print | null = null;
  lamp: [number, number, number] = [0.5, 0.5, 0];
  /** Touched since the last step: the lamp stays on. */
  private lit = false;
  private fade: Fade;

  /** `k`: the card in units of its short side (shape.ts cardK); the trading card unless given. */
  constructor(kind: TouchKind = 'warmth', k: readonly [number, number] = [1, 1.4]) {
    this.fade = FADES[kind];
    this.w = Math.round(HEAT_CELLS * k[0]);
    this.h = Math.round(HEAT_CELLS * k[1]);
    this.channels = this.fade.drag ? 2 : 1;
    this.data = new Float32Array(this.w * this.h * this.channels);
    this.next = new Float32Array(this.data.length);
  }

  /** Its field moves the picture (Marble's ink), so under reduced motion it must hold still. */
  get moves() {
    return !!this.fade.drag;
  }

  get cold() {
    return !this.warm && !this.prints.length && !this.lamp[2];
  }

  /**
   * Warms the card along a segment travelled during `dt` (card uv, y down). A firm touch (a
   * finger, a pressed button) is wider and warmer than a hovering mouse. Every spot passed gets
   * about the same warmth however fast the stroke goes; lingering adds more, up to MAX.
   */
  touch(u0: number, v0: number, u1: number, v1: number, dt: number, firm: boolean) {
    if (this.fade.drag) return this.drag(u0, v0, u1, v1, firm);
    const { w, h } = this;
    const r = (firm ? 0.07 : 0.042) * HEAT_CELLS;
    const ax = u0 * w - 0.5;
    const ay = v0 * h - 0.5;
    const bx = u1 * w - 0.5;
    const by = v1 * h - 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const gain = (firm ? 2.4 : 1.1) * dt + (firm ? 0.55 : 0.34) * Math.min(Math.sqrt(len2) / r, 1);
    const reach = r * 2.6;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + reach));
    if (x0 > x1 || y0 > y1) return;
    const inv = 1 / (r * r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
        const ex = x - ax - dx * t;
        const ey = y - ay - dy * t;
        const g = Math.exp(-(ex * ex + ey * ey) * inv);
        if (g < 1e-3) continue;
        const i = y * w + x;
        this.data[i] = Math.min(MAX, this.data[i] + gain * g * (1 - this.data[i] / MAX));
      }
    }
    this.warm = true;
    this.lamp = [u1, v1, 1];
    this.lit = true;
    this.version++;
  }

  /**
   * Marble: the ink near the stroke follows it, most of the way right under the finger and less
   * further out, so the rings are combed into feathered veins. The new field is the stroke's own
   * move plus the old field fetched from where the ink came from (a semi-Lagrangian step), so
   * strokes compose as real drags do.
   */
  private drag(u0: number, v0: number, u1: number, v1: number, firm: boolean) {
    const r = (firm ? 0.075 : 0.05) * HEAT_CELLS;
    const k = firm ? DRAG_FIRM : DRAG_HOVER;
    const mu = (u1 - u0) * k;
    const mv = (v1 - v0) * k;
    this.carry(u0, v0, u1, v1, r, () => [mu, mv]);
  }

  /** Marble, a finger held at (u, v): the ink turns round it, fastest at its centre, so it winds into a spiral. */
  private stir(u: number, v: number, dt: number) {
    const a = STIR * dt;
    const { w, h } = this;
    // A turn in square cells, given back in card uv.
    this.carry(u, v, u, v, 0.09 * HEAT_CELLS, (x, y, g) => {
      const dx = (x - (u * w - 0.5)) * g * a;
      const dy = (y - (v * h - 0.5)) * g * a;
      return [-dy / w, dx / h];
    });
  }

  /**
   * Moves the ink near the segment a→b (card uv) by `move` (card uv for a cell, given the cell and its
   * weight 0..1, a Gaussian of radius `r` cells round the segment).
   */
  private carry(u0: number, v0: number, u1: number, v1: number, r: number, move: (x: number, y: number, g: number) => [number, number]) {
    const { w, h } = this;
    const ax = u0 * w - 0.5;
    const ay = v0 * h - 0.5;
    const bx = u1 * w - 0.5;
    const by = v1 * h - 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const reach = r * 2.6;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + reach));
    if (x0 > x1 || y0 > y1) return;
    const old = this.next;
    old.set(this.data);
    const inv = 1 / (r * r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
        const ex = x - ax - dx * t;
        const ey = y - ay - dy * t;
        const g = Math.exp(-(ex * ex + ey * ey) * inv);
        if (g < 1e-3) continue;
        const [mu, mv] = move(x, y, g);
        const su = len2 > 0 ? mu * g : mu;
        const sv = len2 > 0 ? mv * g : mv;
        // Where this cell's ink came from, in cells, and what had been carried there.
        const [pu, pv] = this.sample(old, x - su * w, y - sv * h);
        const i = (y * w + x) * 2;
        this.data[i] = su + pu;
        this.data[i + 1] = sv + pv;
      }
    }
    this.warm = true;
    this.lamp = [u1, v1, 1];
    this.lit = true;
    this.version++;
  }

  /** The displacement at cell position (x, y), bilinear, held at the edges. */
  private sample(f: Float32Array, x: number, y: number): [number, number] {
    const { w, h } = this;
    x = Math.min(w - 1, Math.max(0, x));
    y = Math.min(h - 1, Math.max(0, y));
    const x0 = Math.min(w - 2, Math.floor(x));
    const y0 = Math.min(h - 2, Math.floor(y));
    const fx = x - x0;
    const fy = y - y0;
    const i00 = (y0 * w + x0) * 2;
    const i10 = i00 + 2;
    const i01 = i00 + w * 2;
    const i11 = i01 + 2;
    const lerp = (c: number) =>
      (f[i00 + c] * (1 - fx) + f[i10 + c] * fx) * (1 - fy) + (f[i01 + c] * (1 - fx) + f[i11 + c] * fx) * fy;
    return [lerp(0), lerp(1)];
  }

  /** A finger held at (u, v): its print forms over the first half second or so. */
  press(u: number, v: number, dt: number) {
    if (this.fade.drag) return this.stir(u, v, dt);
    if (!this.fade.prints) return this.touch(u, v, u, v, dt, true);
    let p = this.pressing;
    if (!p) {
      // Turned a little, the same way for the same spot, so every export comes out the same.
      p = { u, v, angle: -0.3 + 0.35 * Math.sin(u * 91.7 + v * 37.3), heat: 0 };
      this.prints.push(p);
      if (this.prints.length > PRINTS) this.prints.shift();
      this.pressing = p;
    }
    p.heat = Math.min(1, p.heat + dt * 1.6);
    this.version++;
  }

  /** The finger is gone: its print starts to cool. */
  lift() {
    this.pressing = null;
  }

  step(dt: number) {
    if (this.cold) return;
    // The lamp goes out within a fifth of a second of the touch leaving.
    if (!this.lit) this.lamp[2] = Math.max(0, this.lamp[2] - dt * 5);
    this.lit = false;
    if (this.warm) {
      // Spread (explicit diffusion, split into stable sub-steps), then cool.
      const { spread, cool, quench } = this.fade;
      const k = spread * dt;
      const n = Math.ceil(k / 0.2);
      for (let s = 0; s < n; s++) this.spread(k / n);
      const keep = Math.exp(-cool * dt);
      const loss = this.fade.loss * dt;
      let peak = 0;
      const d = this.data;
      if (this.fade.drag) {
        for (let i = 0; i < d.length; i++) {
          d[i] *= keep;
          peak = Math.max(peak, Math.abs(d[i]));
        }
      } else {
        for (let i = 0; i < d.length; i++) {
          const v = Math.max(0, d[i] * (keep - quench * d[i] * dt) - loss);
          d[i] = v;
          if (v > peak) peak = v;
        }
      }
      if (peak < (this.fade.drag ? STILL : COLD)) {
        d.fill(0);
        this.warm = false;
      }
    }
    for (const p of this.prints) if (p !== this.pressing) p.heat = p.heat * Math.exp(-this.fade.cool * dt) - this.fade.loss * dt;
    this.prints = this.prints.filter((p) => p === this.pressing || p.heat > 0.01);
    this.version++;
  }

  private spread(k: number) {
    const a = this.data;
    const b = this.next;
    const { w, h, channels: n } = this;
    for (let y = 0; y < h; y++) {
      const up = (y > 0 ? y - 1 : y) * w;
      const row = y * w;
      const down = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) {
        const l = x > 0 ? x - 1 : x;
        const r = x < w - 1 ? x + 1 : x;
        for (let ch = 0; ch < n; ch++) {
          const c = a[(row + x) * n + ch];
          b[(row + x) * n + ch] = c + k * (a[(row + l) * n + ch] + a[(row + r) * n + ch] + a[(up + x) * n + ch] + a[(down + x) * n + ch] - 4 * c);
        }
      }
    }
    a.set(b);
  }
}

// ---------- An unseen finger (the hint on arrival, the hand's preview card, exports) ----------

/** One thumb's sweep up across the art, as a right hand swipes a phone: points around its centre, card uv. */
const ARC: [number, number][] = [
  [0.29, 0.2],
  [0.21, 0.08],
  [0.1, -0.03],
  [-0.03, -0.11],
  [-0.16, -0.16],
  [-0.29, -0.18],
];
/** Where the thumb presses afterwards, from the same centre: low on the side the swipe started from. */
const PRESS: [number, number] = [-0.2, 0.17];

/** Where a swipe sits on the card. `press` is the spot it presses afterwards. */
export interface SwipeShape {
  center: [number, number];
  mirror: boolean;
  press: [number, number];
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function shape(cu: number, cv: number, mirror: boolean): SwipeShape {
  const m = mirror ? -1 : 1;
  return { center: [cu, cv], mirror, press: [clamp(cu + PRESS[0] * m, 0.15, 0.85), clamp(cv + PRESS[1], 0.15, 0.75)] };
}

/** The placements to choose from; the first is the default (the hand's preview, the hint on arrival). */
export const SWIPES: SwipeShape[] = [shape(0.5, 0.45, false)];
for (const cv of [0.3, 0.45, 0.6]) {
  for (const cu of [0.42, 0.5, 0.58]) {
    for (const mirror of [false, true]) if (cv !== 0.45 || cu !== 0.5 || mirror) SWIPES.push(shape(cu, cv, mirror));
  }
}

/** Point `s` (0..1) along a swipe, eased so the finger sets down and lifts off gently. */
export function swipeAt(shape: SwipeShape, s: number): [number, number] {
  const e = s * s * (3 - 2 * s);
  const f = e * (ARC.length - 1);
  const i = Math.min(ARC.length - 2, Math.floor(f));
  const t = f - i;
  const p0 = ARC[Math.max(0, i - 1)];
  const p1 = ARC[i];
  const p2 = ARC[i + 1];
  const p3 = ARC[Math.min(ARC.length - 1, i + 2)];
  // Catmull-Rom through the points.
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  const x = cr(p0[0], p1[0], p2[0], p3[0]) * (shape.mirror ? -1 : 1);
  return [clamp(shape.center[0] + x, 0.08, 0.92), clamp(shape.center[1] + cr(p0[1], p1[1], p2[1], p3[1]), 0.07, 0.84)];
}

/**
 * The swipe that passes through the busiest part of the picture, so an export reveals what
 * matters in it. `busy` is a w×h map over the card (rows top to bottom), larger where more goes on.
 */
export function pickSwipe(busy: Float32Array, w: number, h: number): SwipeShape {
  let best = SWIPES[0];
  let top = -1;
  for (const sh of SWIPES) {
    let sum = 0;
    for (let i = 0; i <= 24; i++) {
      const [u, v] = swipeAt(sh, i / 24);
      sum += busy[Math.min(h - 1, Math.floor(v * h)) * w + Math.min(w - 1, Math.floor(u * w))];
    }
    if (sum > top * 1.05) {
      top = sum;
      best = sh;
    }
  }
  return best;
}

/** Seconds a swipe takes, when it presses, and when the thumb lifts. */
const SWIPE_DRAW = 1.4;
const PRESS_FROM = 1.6;
const PRESS_TO = 2.6;

/** Plays one swipe and press into a heat field; the owner keeps stepping the field itself. */
export class Swipe {
  private t = 0;
  private field: HeatField;
  private shape: SwipeShape;

  constructor(field: HeatField, shape: SwipeShape) {
    this.field = field;
    this.shape = shape;
  }

  /** Advances by `dt` seconds; false once the thumb has lifted. */
  step(dt: number): boolean {
    const t0 = this.t;
    const t1 = (this.t += dt);
    if (t0 < SWIPE_DRAW) {
      const [au, av] = swipeAt(this.shape, t0 / SWIPE_DRAW);
      const [bu, bv] = swipeAt(this.shape, Math.min(1, t1 / SWIPE_DRAW));
      this.field.touch(au, av, bu, bv, dt, true);
    }
    if (t0 >= PRESS_FROM && t0 < PRESS_TO) this.field.press(this.shape.press[0], this.shape.press[1], dt);
    if (t1 < PRESS_TO) return true;
    this.field.lift();
    return false;
  }
}

/** Seconds of heat one loop covers, however long the clip plays it: enough to cool all but fully. */
export const AUTO_LOOP = 10;
/**
 * Where in the loop a still picture (PNG, a held preview) is taken: for Warmth the swipe still warm
 * and the print just made, for Glow just after the light has left, the trail glowing on its own, for
 * Rainy Window the wipe and the print still clear, for Marble the stroke just drawn through the rings.
 */
export const AUTO_STILL: Record<TouchKind, number> = { warmth: 0.3, glow: 0.36, rain: 0.3, marble: 0.3 };
/** Simulation ticks per loop: fixed, so every export of the same phase is identical. */
const TICKS = 200;
/** The card shows cold for a moment before the finger comes. */
const START = 10;
/** Loops from a cold card after which the heat repeats (with margin). */
const RUN_UP = 3;

/**
 * A finger that swipes and presses once per loop, then leaves the card to cool. `at(phase)` takes
 * the loop count so far (2.5 = halfway through the third loop) and simulates up to it; after the
 * first couple of loops the heat repeats exactly, so asking for phase 3 + p gives a seamless loop.
 */
export class AutoTouch implements HeatSource {
  private f: HeatField;
  private tick = 0;
  private swipe: Swipe | null = null;
  private kind: TouchKind;
  private shape: SwipeShape;
  readonly k: readonly [number, number];

  constructor(kind: TouchKind = 'warmth', shape: SwipeShape = SWIPES[0], k: readonly [number, number] = [1, 1.4]) {
    this.kind = kind;
    this.shape = shape;
    this.k = k;
    this.f = new HeatField(kind, k);
  }

  get w() {
    return this.f.w;
  }
  get channels() {
    return this.f.channels;
  }
  get h() {
    return this.f.h;
  }

  get data() {
    return this.f.data;
  }
  get version() {
    return this.f.version;
  }
  get prints() {
    return this.f.prints;
  }
  get lamp() {
    return this.f.lamp;
  }

  at(phase: number) {
    const target = Math.max(0, Math.round(phase * TICKS));
    // Going back starts over; going far ahead (a preview first drawn late in a session) starts
    // three loops short, since the heat has repeated exactly long before then.
    if (target < this.tick || target - this.tick > RUN_UP * TICKS) {
      this.f = new HeatField(this.kind, this.k);
      this.swipe = null;
      this.tick = Math.max(0, target - RUN_UP * TICKS);
    }
    while (this.tick < target) this.advance(this.tick++);
  }

  private advance(tick: number) {
    const dt = AUTO_LOOP / TICKS;
    if (tick % TICKS === START) this.swipe = new Swipe(this.f, this.shape);
    if (this.swipe && !this.swipe.step(dt)) this.swipe = null;
    this.f.step(dt);
  }
}
