// Heat on the card for the Warmth finish: where it was touched, how warm it still is, and the
// fingerprints left by a press. A small grid over the card face, simulated on the CPU (a few
// thousand cells, so it costs next to nothing) and uploaded to the card shader as a texture.
//
// No imports: the tests load this file directly with Node.

/** Grid size. Cells are square on the 5:7 card, so one cell is 1/60 of the card's width. */
export const HEAT_W = 60;
export const HEAT_H = 84;

/** Most heat one spot holds: a finger left still for a while. */
const MAX = 1.5;
/** How fast heat spreads, in cells² per second: slow, so a cooling trail narrows along its line instead of smearing. */
const SPREAD = 0.5;
/** Newton cooling per second, plus a small steady loss so the tail really reaches zero. */
const COOL = 0.3;
const LOSS = 0.006;
/** Below this everywhere, the card counts as cold and stops simulating. */
const COLD = 0.002;
/** Fingerprints kept at once; the oldest makes way. */
const PRINTS = 3;

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
}

export class HeatField implements HeatSource {
  readonly data = new Float32Array(HEAT_W * HEAT_H);
  private next = new Float32Array(HEAT_W * HEAT_H);
  prints: Print[] = [];
  version = 0;
  private warm = false;
  private pressing: Print | null = null;

  get cold() {
    return !this.warm && !this.prints.length;
  }

  /**
   * Warms the card along a segment travelled during `dt` (card uv, y down). A firm touch (a
   * finger, a pressed button) is wider and warmer than a hovering mouse. Every spot passed gets
   * about the same warmth however fast the stroke goes; lingering adds more, up to MAX.
   */
  touch(u0: number, v0: number, u1: number, v1: number, dt: number, firm: boolean) {
    const r = (firm ? 0.055 : 0.042) * HEAT_W;
    const ax = u0 * HEAT_W - 0.5;
    const ay = v0 * HEAT_H - 0.5;
    const bx = u1 * HEAT_W - 0.5;
    const by = v1 * HEAT_H - 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const gain = (firm ? 2.4 : 1.1) * dt + (firm ? 0.55 : 0.34) * Math.min(Math.sqrt(len2) / r, 1);
    const reach = r * 2.6;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const x1 = Math.min(HEAT_W - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const y1 = Math.min(HEAT_H - 1, Math.ceil(Math.max(ay, by) + reach));
    if (x0 > x1 || y0 > y1) return;
    const inv = 1 / (r * r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
        const ex = x - ax - dx * t;
        const ey = y - ay - dy * t;
        const g = Math.exp(-(ex * ex + ey * ey) * inv);
        if (g < 1e-3) continue;
        const i = y * HEAT_W + x;
        this.data[i] = Math.min(MAX, this.data[i] + gain * g * (1 - this.data[i] / MAX));
      }
    }
    this.warm = true;
    this.version++;
  }

  /** A finger held at (u, v): its print forms over the first half second or so. */
  press(u: number, v: number, dt: number) {
    let p = this.pressing;
    if (!p) {
      // Turned a little, the same way for the same spot, so a recording comes out the same.
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
    if (this.warm) {
      // Spread (explicit diffusion, split into stable sub-steps), then cool.
      const k = SPREAD * dt;
      const n = Math.ceil(k / 0.2);
      for (let s = 0; s < n; s++) this.spread(k / n);
      const keep = Math.exp(-COOL * dt);
      const loss = LOSS * dt;
      let peak = 0;
      const d = this.data;
      for (let i = 0; i < d.length; i++) {
        const v = Math.max(0, d[i] * keep - loss);
        d[i] = v;
        if (v > peak) peak = v;
      }
      if (peak < COLD) {
        d.fill(0);
        this.warm = false;
      }
    }
    for (const p of this.prints) if (p !== this.pressing) p.heat = p.heat * Math.exp(-COOL * dt) - LOSS * dt;
    this.prints = this.prints.filter((p) => p === this.pressing || p.heat > 0.01);
    this.version++;
  }

  private spread(k: number) {
    const a = this.data;
    const b = this.next;
    for (let y = 0; y < HEAT_H; y++) {
      const up = (y > 0 ? y - 1 : y) * HEAT_W;
      const row = y * HEAT_W;
      const down = (y < HEAT_H - 1 ? y + 1 : y) * HEAT_W;
      for (let x = 0; x < HEAT_W; x++) {
        const l = x > 0 ? x - 1 : x;
        const r = x < HEAT_W - 1 ? x + 1 : x;
        const c = a[row + x];
        b[row + x] = c + k * (a[row + l] + a[row + r] + a[up + x] + a[down + x] - 4 * c);
      }
    }
    a.set(b);
  }
}

// ---------- The stroke drawn on its own (exports and the hand's preview card) ----------

/** Seconds of heat one loop covers, however long the clip plays it. */
export const AUTO_LOOP = 6;
/** Where in the loop a still picture (PNG, a held preview) is taken: the stroke and print both warm. */
export const AUTO_STILL = 0.55;
/** Simulation ticks per loop: fixed, so every recording of the same phase is identical. */
const TICKS = 120;
/** Share of the loop the finger spends drawing, and when it presses. */
const DRAW = 0.3;
const PRESS: [number, number] = [0.5, 0.64];
const PRESS_AT: [number, number] = [0.27, 0.68];
/** One thumb's sweep up across the art, as a right hand swipes a phone, in card uv. */
const PATH: [number, number][] = [
  [0.86, 0.8],
  [0.76, 0.64],
  [0.62, 0.5],
  [0.46, 0.4],
  [0.3, 0.33],
  [0.14, 0.3],
];

function pathAt(s: number): [number, number] {
  // Eased so the finger sets down and lifts off gently, Catmull-Rom through the points.
  const e = s * s * (3 - 2 * s);
  const f = e * (PATH.length - 1);
  const i = Math.min(PATH.length - 2, Math.floor(f));
  const t = f - i;
  const p0 = PATH[Math.max(0, i - 1)];
  const p1 = PATH[i];
  const p2 = PATH[i + 1];
  const p3 = PATH[Math.min(PATH.length - 1, i + 2)];
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
}

/**
 * A finger that draws the same stroke and press every loop. `at(phase)` takes the loop count
 * so far (2.5 = halfway through the third loop) and simulates up to it; after the first couple
 * of loops the heat repeats exactly, so asking for phase 3 + p gives a seamless loop.
 */
export class AutoTouch implements HeatSource {
  private f = new HeatField();
  private tick = 0;

  get data() {
    return this.f.data;
  }
  get version() {
    return this.f.version;
  }
  get prints() {
    return this.f.prints;
  }

  at(phase: number) {
    const target = Math.max(0, Math.round(phase * TICKS));
    if (target < this.tick) {
      this.f = new HeatField();
      this.tick = 0;
    }
    while (this.tick < target) this.advance(this.tick++);
  }

  private advance(tick: number) {
    const dt = AUTO_LOOP / TICKS;
    const p0 = (tick % TICKS) / TICKS;
    const p1 = p0 + 1 / TICKS;
    const f = this.f;
    if (p1 <= DRAW + 1e-9) {
      const [au, av] = pathAt(p0 / DRAW);
      const [bu, bv] = pathAt(p1 / DRAW);
      f.touch(au, av, bu, bv, dt, true);
    }
    if (p0 >= PRESS[0] && p0 < PRESS[1]) f.press(PRESS_AT[0], PRESS_AT[1], dt);
    else f.lift();
    f.step(dt);
  }
}

// ---------- From the screen to the card ----------

/** Where the card is drawn: the same numbers the card's vertex shader gets (css px, radians). */
export interface CardPose {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
}

/** The card's rotation (z, then x, then y, as in CARD_VS) applied to a point on its plane. */
function rotate(p: CardPose, x: number, y: number): [number, number, number] {
  const x1 = Math.cos(p.rz) * x - Math.sin(p.rz) * y;
  const y1 = Math.sin(p.rz) * x + Math.cos(p.rz) * y;
  const y2 = Math.cos(p.rx) * y1;
  const z2 = Math.sin(p.rx) * y1;
  return [Math.cos(p.ry) * x1 + Math.sin(p.ry) * z2, y2, -Math.sin(p.ry) * x1 + Math.cos(p.ry) * z2];
}

const depth = (p: CardPose) => Math.max(p.h, 120) * 3.2;

/** Screen position of card uv (u, v), y down. */
export function cardPoint(u: number, v: number, p: CardPose): [number, number] {
  const [x, y, z] = rotate(p, (u - 0.5) * p.w * p.scale, (v - 0.5) * p.h * p.scale);
  const w = (depth(p) - z) / depth(p);
  return [p.cx + x / w, p.cy + y / w];
}

/** The card uv under a screen position: the inverse of `cardPoint` (a ray meeting the card's plane). */
export function cardUv(sx: number, sy: number, p: CardPose): [number, number] {
  const D = depth(p);
  const a = rotate(p, 1, 0);
  const b = rotate(p, 0, 1);
  const qx = sx - p.cx;
  const qy = sy - p.cy;
  // D·(X·a + Y·b).xy = q·(D − (X·a + Y·b).z), linear in the plane coordinates X and Y.
  const m11 = D * a[0] + qx * a[2];
  const m12 = D * b[0] + qx * b[2];
  const m21 = D * a[1] + qy * a[2];
  const m22 = D * b[1] + qy * b[2];
  const det = m11 * m22 - m12 * m21;
  const X = (qx * D * m22 - m12 * qy * D) / det;
  const Y = (m11 * qy * D - m21 * qx * D) / det;
  return [X / (p.w * p.scale) + 0.5, Y / (p.h * p.scale) + 0.5];
}
