// Neon's sign, designed off the card face the way a glass bender works from a drawing: a few long
// outlines of the picture, simplified into smooth bends, each bent from one tube of one gas, plus
// a tube round the art window. The shader can't see a whole outline from one pixel, so the tubes
// are laid out here and handed over as two maps:
//
// - the tube map (fine): distance to the nearest tube's centre line, how far along that tube the
//   nearest point lies, and which tube it is;
// - the wall map (coarse): the colored light all tubes pool on the wall behind them, falling off
//   like the light of a lamp held a little off a wall.
//
// Pure (no DOM), so it can be tested. All lengths are in face pixels (a card's short side is 900).

export interface FaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NeonTube {
  /** Centre line, x, y pairs in face px, about STEP apart. */
  pts: Float32Array;
  /** Length in face px. */
  len: number;
  /** The gas color, 0..1. */
  gas: [number, number, number];
  /** The tube bent round the art window. */
  border: boolean;
}

export interface NeonDesign {
  tubes: NeonTube[];
  /** Tube width (glass outside to outside), face px. */
  width: number;
}

/** Tubes bent from the picture (the border tube comes on top). */
export const NEON_MAX_TUBES = 6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Separable box blur with clamped edges; three passes approach a Gaussian. */
function blur(src: Float32Array, w: number, h: number, r: number, passes = 3): Float32Array {
  if (r < 1) return src.slice();
  const a = src.slice();
  const b = new Float32Array(a.length);
  const line = new Float32Array(Math.max(w, h) + 2 * r + 1);
  const inv = 1 / (2 * r + 1);
  const pass = (from: Float32Array, to: Float32Array, n: number, lines: number, step: number, stride: number) => {
    for (let l = 0; l < lines; l++) {
      const o = l * stride;
      for (let i = -r; i < n + r + 1; i++) line[i + r] = from[o + Math.min(n - 1, Math.max(0, i)) * step];
      let s = 0;
      for (let i = 0; i <= 2 * r; i++) s += line[i];
      for (let i = 0; i < n; i++) {
        to[o + i * step] = s * inv;
        s += line[i + 2 * r + 1] - line[i];
      }
    }
  };
  for (let k = 0; k < passes; k++) {
    pass(a, b, w, h, 1, w);
    pass(b, a, h, w, w, 1);
  }
  return a;
}

/** Box radius whose three passes blur about `sigma` cells. */
const boxFor = (sigma: number) => Math.max(1, Math.round((-1 + Math.sqrt(1 + 4 * sigma * sigma)) / 2));

/** The neon colors a gas comes in; null for grey or very dark (no gas of its own). */
export function neonGasOf(r: number, g: number, b: number): [number, number, number] | null {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  if (sat < 0.2 || mx < 0.1) return null;
  const d = mx - mn;
  let hue = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  hue = (((hue / 6) % 1) + 1) % 1;
  if (hue < 0.045 || hue > 0.95) return [1.0, 0.16, 0.12]; // red
  if (hue < 0.11) return [1.0, 0.42, 0.08]; // amber
  if (hue < 0.2) return [1.0, 0.8, 0.16]; // yellow
  if (hue < 0.42) return [0.36, 1.0, 0.24]; // lime
  if (hue < 0.57) return [0.1, 0.86, 1.0]; // cyan
  if (hue < 0.7) return [0.26, 0.4, 1.0]; // blue
  if (hue < 0.83) return [0.66, 0.26, 1.0]; // violet
  return NEON_PINK;
}
export const NEON_PINK: [number, number, number] = [1.0, 0.2, 0.62];

type Line = { pts: number[]; closed: boolean; contrast: number };

/**
 * Iso-lines of `f` (aw × ah cells) at `level`, traced into polylines in cell coordinates, with
 * the mean of `g` (the field's step across them) along each.
 */
function isoLines(f: Float32Array, g: Float32Array, aw: number, ah: number, level: number): Line[] {
  const E = aw * ah * 2;
  const nb = new Int32Array(E * 2).fill(-1);
  const hE = (x: number, y: number) => (y * aw + x) * 2;
  const vE = (x: number, y: number) => (y * aw + x) * 2 + 1;
  const link = (a: number, b: number) => {
    nb[a * 2 + (nb[a * 2] < 0 ? 0 : 1)] = b;
    nb[b * 2 + (nb[b * 2] < 0 ? 0 : 1)] = a;
  };
  for (let y = 0; y < ah - 1; y++)
    for (let x = 0; x < aw - 1; x++) {
      const a = f[y * aw + x] > level ? 1 : 0;
      const b = f[y * aw + x + 1] > level ? 1 : 0;
      const c = f[(y + 1) * aw + x + 1] > level ? 1 : 0;
      const d = f[(y + 1) * aw + x] > level ? 1 : 0;
      const code = (a << 3) | (b << 2) | (c << 1) | d;
      if (code === 0 || code === 15) continue;
      const T = hE(x, y);
      const R = vE(x + 1, y);
      const B = hE(x, y + 1);
      const L = vE(x, y);
      switch (code) {
        case 1:
        case 14:
          link(L, B);
          break;
        case 2:
        case 13:
          link(B, R);
          break;
        case 3:
        case 12:
          link(L, R);
          break;
        case 4:
        case 11:
          link(T, R);
          break;
        case 6:
        case 9:
          link(T, B);
          break;
        case 7:
        case 8:
          link(T, L);
          break;
        case 5:
        case 10: {
          const mid = (f[y * aw + x] + f[y * aw + x + 1] + f[(y + 1) * aw + x + 1] + f[(y + 1) * aw + x]) / 4 > level ? 1 : 0;
          // Separate the corners that are on the other side from the centre.
          if ((code === 5) === (mid === 1)) {
            link(T, L);
            link(B, R);
          } else {
            link(T, R);
            link(L, B);
          }
        }
      }
    }
  const pos = (e: number, out: number[]) => {
    const i = e >> 1;
    const x = i % aw;
    const y = (i - x) / aw;
    const f0 = f[i];
    const f1 = e & 1 ? f[i + aw] : f[i + 1];
    const t = clamp01((level - f0) / (f1 - f0 || 1e-6));
    if (e & 1) out.push(x, y + t);
    else out.push(x + t, y);
    return g[i];
  };
  const seen = new Uint8Array(E);
  const lines: Line[] = [];
  const trace = (start: number) => {
    const pts: number[] = [];
    let sum = 0;
    let prev = -1;
    let e = start;
    let closed = false;
    for (;;) {
      seen[e] = 1;
      sum += pos(e, pts);
      const n0 = nb[e * 2];
      const n1 = nb[e * 2 + 1];
      const next = n0 !== prev && n0 >= 0 ? n0 : n1 !== prev && n1 >= 0 ? n1 : -1;
      if (next < 0) break;
      if (next === start) {
        closed = true;
        break;
      }
      if (seen[next]) break;
      prev = e;
      e = next;
    }
    if (pts.length >= 8) lines.push({ pts, closed, contrast: sum / (pts.length / 2) });
  };
  // Open lines first (from an end), then the loops left over.
  for (let e = 0; e < E; e++) if (!seen[e] && nb[e * 2] >= 0 && nb[e * 2 + 1] < 0) trace(e);
  for (let e = 0; e < E; e++) if (!seen[e] && nb[e * 2] >= 0) trace(e);
  return lines;
}

/** Points `step` apart along a polyline (x, y pairs). */
function resample(p: ArrayLike<number>, closed: boolean, step: number): number[] {
  const n = p.length / 2;
  const out: number[] = [p[0], p[1]];
  let carry = 0;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const ax = p[i * 2];
    const ay = p[i * 2 + 1];
    const j = ((i + 1) % n) * 2;
    const dx = p[j] - ax;
    const dy = p[j + 1] - ay;
    const L = Math.hypot(dx, dy);
    let t = step - carry;
    while (t <= L) {
      out.push(ax + (dx * t) / L, ay + (dy * t) / L);
      t += step;
    }
    carry = L - (t - step);
  }
  if (closed && out.length > 4) {
    // Drop a last point sitting on the first.
    const k = out.length - 2;
    if (Math.hypot(out[k] - out[0], out[k + 1] - out[1]) < step * 0.5) out.length = k;
  }
  return out;
}

/** Gaussian smoothing of a polyline (sigma in points); open lines are mirrored through their ends, so the ends hold their place and direction. */
function smooth(p: number[], closed: boolean, sigma: number): number[] {
  const n = p.length / 2;
  const r = Math.ceil(sigma * 2.5);
  const k: number[] = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) ks += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  const at = (i: number, c: number): number => {
    if (closed) return p[(((i % n) + n) % n) * 2 + c];
    if (i < 0) return 2 * p[c] - at(-i, c);
    if (i >= n) return 2 * p[(n - 1) * 2 + c] - at(2 * (n - 1) - i, c);
    return p[i * 2 + c];
  };
  const out = new Array<number>(p.length);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 2; c++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += k[j + r] * at(Math.max(-n + 1, Math.min(2 * n - 2, i + j)), c);
      out[i * 2 + c] = s / ks;
    }
  return out;
}

function polyLen(p: ArrayLike<number>): number {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}

/** A rounded rectangle's outline from (x0, y0) to (x1, y1), corner radius r, as points, starting at `start` along its top edge and running clockwise. */
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, step: number): number[] {
  const p: number[] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  arc(x1 - r, y0 + r, -Math.PI / 2);
  arc(x1 - r, y1 - r, 0);
  arc(x0 + r, y1 - r, Math.PI / 2);
  arc(x0 + r, y0 + r, Math.PI);
  return resample(p, true, step);
}

/**
 * Lays out the sign. `rgba`: the face drawn at `w` × `h` (each cell `faceW / w` face px);
 * `art`: the art window in face px.
 */
export function neonDesign(rgba: ArrayLike<number>, w: number, h: number, faceW: number, faceH: number, art: FaceRect): NeonDesign {
  const S = Math.min(faceW, faceH);
  const W = 0.015 * S; // tube width
  const sx = faceW / w;
  const sy = faceH / h;
  const STEP = 3;
  const minLen = 0.18 * S;
  const tubes: NeonTube[] = [];

  // The art window in cells, a little inside its edge.
  const ax0 = Math.ceil(art.x / sx) + 1;
  const ay0 = Math.ceil(art.y / sy) + 1;
  const aw = Math.max(0, Math.floor((art.x + art.w) / sx) - 1 - ax0);
  const ah = Math.max(0, Math.floor((art.y + art.h) / sy) - 1 - ay0);
  const n = aw * ah;

  // What is outlined: brightness (saturated color counted as bright) and two color-opponent
  // channels, so a red shape on a green ground of the same brightness still has an outline.
  const tone = new Float32Array(n);
  const rg = new Float32Array(n);
  const yb = new Float32Array(n);
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let y = 0; y < ah; y++)
    for (let x = 0; x < aw; x++) {
      const i = y * aw + x;
      const o = ((y + ay0) * w + x + ax0) * 4;
      const r = rgba[o] / 255;
      const g = rgba[o + 1] / 255;
      const b = rgba[o + 2] / 255;
      R[i] = r;
      G[i] = g;
      B[i] = b;
      mr += r;
      mg += g;
      mb += b;
      tone[i] = 0.5 * (0.299 * r + 0.587 * g + 0.114 * b) + 0.5 * Math.max(r, g, b);
      rg[i] = 0.5 * (r - g);
      yb[i] = 0.5 * ((r + g) / 2 - b);
    }

  if (n > 64) {
    // Traced on a blurred picture, so pixel-art steps, dither and fine texture never become tubes.
    const sigma = (0.022 * S) / sx;
    const rad = boxFor(sigma);
    const lines: (Line & { len: number })[] = [];
    for (const [field, weight] of [
      [tone, 1],
      [rg, 0.8],
      [yb, 0.7],
    ] as const) {
      const f = blur(field, aw, ah, rad);
      // The step across an outline, from the slope of the blurred picture.
      const g = new Float32Array(n);
      for (let y = 1; y < ah - 1; y++)
        for (let x = 1; x < aw - 1; x++) {
          const i = y * aw + x;
          g[i] = Math.hypot(f[i + 1] - f[i - 1], f[i + aw] - f[i - aw]) * 0.5 * sigma * 2.5 * weight;
        }
      const sorted = Float32Array.from(f).sort();
      const lo = sorted[Math.floor(n * 0.03)];
      const hi = sorted[Math.floor(n * 0.97)];
      if (hi - lo < 0.06) continue;
      const LEVELS = 9;
      for (let k = 1; k <= LEVELS; k++) {
        for (const l of isoLines(f, g, aw, ah, lo + ((hi - lo) * k) / (LEVELS + 1))) {
          if (l.contrast < 0.14) continue;
          for (let i = 0; i < l.pts.length; i += 2) {
            l.pts[i] = (l.pts[i] + ax0 + 0.5) * sx;
            l.pts[i + 1] = (l.pts[i + 1] + ay0 + 0.5) * sy;
          }
          const len = polyLen(l.pts) + (l.closed ? Math.hypot(l.pts[0] - l.pts[l.pts.length - 2], l.pts[1] - l.pts[l.pts.length - 1]) : 0);
          if (len >= minLen) lines.push({ ...l, len });
        }
      }
    }

    // Kept well inside the art window, smoothed into broad bends, then the strongest long runs
    // taken one by one; anything running alongside a tube already taken (the parallel outlines
    // of one edge, the far side of a thin shape) is left out, and so is anything short.
    const margin = 2.6 * W;
    const inside = (x: number, y: number) =>
      x > art.x + margin && x < art.x + art.w - margin && y > art.y + margin && y < art.y + art.h - margin;
    type Cand = { pts: number[]; closed: boolean; score: number; contrast: number };
    const cands: Cand[] = [];
    const smoothPts = (0.026 * S) / STEP;
    // Only the strongest few dozen are worth smoothing.
    lines.sort((a, b) => b.len ** 1.5 * b.contrast - a.len ** 1.5 * a.contrast);
    for (const l of lines.slice(0, 48)) {
      const all = inside(l.pts[0], l.pts[1]) && l.closed;
      let p = resample(l.pts, l.closed, STEP);
      if (all) {
        let ok = true;
        for (let i = 0; i < p.length && ok; i += 2) ok = inside(p[i], p[i + 1]);
        if (ok) {
          p = smooth(p, true, smoothPts);
          cands.push({ pts: p, closed: true, score: polyLen(p) ** 1.5 * l.contrast, contrast: l.contrast });
          continue;
        }
      }
      // Open runs inside the margin.
      let run: number[] = [];
      const flush = () => {
        if (run.length / 2 > 4 && polyLen(run) >= minLen) {
          const q = smooth(run, false, smoothPts);
          cands.push({ pts: q, closed: false, score: polyLen(q) ** 1.5 * l.contrast, contrast: l.contrast });
        }
        run = [];
      };
      const N = p.length / 2;
      // A loop that leaves the window: start the walk where it is outside, so its inside part is one run.
      let s0 = 0;
      if (l.closed) for (let i = 0; i < N; i++) if (!inside(p[i * 2], p[i * 2 + 1])) { s0 = i; break; }
      for (let k = 0; k < N; k++) {
        const i = (s0 + k) % N;
        if (inside(p[i * 2], p[i * 2 + 1])) run.push(p[i * 2], p[i * 2 + 1]);
        else flush();
      }
      flush();
    }
    cands.sort((a, b) => b.score - a.score);

    // Cells near a tube already taken.
    const mc = 4;
    const mw = Math.ceil(faceW / mc);
    const mh = Math.ceil(faceH / mc);
    const taken = new Uint8Array(mw * mh);
    const selfAt = new Int32Array(mw * mh);
    const selfGen = new Int32Array(mw * mh);
    let gen = 0;
    const keep = 3.4 * W;
    const stamp = (x: number, y: number, rad: number, fn: (j: number) => void) => {
      const cx = x / mc;
      const cy = y / mc;
      const r = rad / mc;
      for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(mh - 1, Math.ceil(cy + r)); j++)
        for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(mw - 1, Math.ceil(cx + r)); i++)
          if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) fn(j * mw + i);
    };
    const cellOf = (x: number, y: number) => Math.min(mh - 1, Math.max(0, Math.floor(y / mc))) * mw + Math.min(mw - 1, Math.max(0, Math.floor(x / mc)));
    const lag = Math.ceil((keep * 2.2) / STEP);
    const blurredRGB = [R, G, B].map((c) => blur(c, aw, ah, boxFor((0.006 * S) / sx)));
    const colorAt = (x: number, y: number): [number, number, number] => {
      const cx = Math.min(aw - 1, Math.max(0, Math.round(x / sx - 0.5 - ax0)));
      const cy = Math.min(ah - 1, Math.max(0, Math.round(y / sy - 0.5 - ay0)));
      const i = cy * aw + cx;
      return [blurredRGB[0][i], blurredRGB[1][i], blurredRGB[2][i]];
    };
    for (const c of cands) {
      if (tubes.length >= NEON_MAX_TUBES) break;
      let p = c.pts;
      if (c.closed) {
        // A loop is bent from one tube whose two ends meet at its lowest point, where the electrodes
        // are tucked out of sight: open it there with a short gap.
        const N = p.length / 2;
        let lo = 0;
        for (let i = 0; i < N; i++) if (p[i * 2 + 1] > p[lo * 2 + 1]) lo = i;
        const gap = Math.ceil((1.9 * W) / STEP);
        const q: number[] = [];
        for (let k = gap; k < N - gap; k++) {
          const i = (lo + k) % N;
          q.push(p[i * 2], p[i * 2 + 1]);
        }
        p = q;
      }
      // Walk the line, splitting it wherever it comes near a tube already taken or doubles back
      // alongside itself.
      gen++;
      const N = p.length / 2;
      const runs: number[][] = [];
      let run: number[] = [];
      for (let i = 0; i < N; i++) {
        const x = p[i * 2];
        const y = p[i * 2 + 1];
        const cell = cellOf(x, y);
        const near = taken[cell] || (selfGen[cell] === gen && i - selfAt[cell] > lag);
        if (near) {
          if (run.length) runs.push(run);
          run = [];
        } else run.push(x, y);
        if (i % 3 === 0)
          stamp(x, y, keep, (j) => {
            if (selfGen[j] !== gen) {
              selfGen[j] = gen;
              selfAt[j] = i;
            }
          });
      }
      if (run.length) runs.push(run);
      for (const r0 of runs) {
        if (tubes.length >= NEON_MAX_TUBES) break;
        // Pull the ends back from whatever cut them, so two tubes never touch.
        const trim = Math.ceil((0.6 * W) / STEP) * 2;
        const r = r0.length / 2 > trim * 2 + 4 && r0.length < p.length ? r0.slice(trim, r0.length - trim) : r0;
        const len = polyLen(r);
        if (len < minLen) continue;
        for (let i = 0; i < r.length; i += 6) stamp(r[i], r[i + 1], keep, (j) => (taken[j] = 1));
        // One gas per tube: the color of the shape it outlines, its brighter, more colorful side.
        const side = [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ];
        const off = 2.2 * W;
        for (let i = 2; i < r.length - 2; i += 6) {
          let tx = r[i + 2] - r[i - 2];
          let ty = r[i + 3] - r[i - 1];
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          for (let s = 0; s < 2; s++) {
            const sg = s ? -1 : 1;
            const [cr, cg, cb] = colorAt(r[i] - ty * off * sg, r[i + 1] + tx * off * sg);
            const mx = Math.max(cr, cg, cb);
            const vivid = mx > 0 ? (0.3 + (mx - Math.min(cr, cg, cb)) / mx) * mx * mx : 0;
            const sd = side[s];
            sd[0] += cr * vivid;
            sd[1] += cg * vivid;
            sd[2] += cb * vivid;
            sd[3] += vivid;
          }
        }
        const best = side[0][3] >= side[1][3] ? side[0] : side[1];
        const wsum = best[3] || 1;
        const gas = neonGasOf(best[0] / wsum, best[1] / wsum, best[2] / wsum);
        tubes.push({ pts: Float32Array.from(r), len, gas: gas ?? [-1, -1, -1], border: false });
      }
    }
  }

  // Grey tubes take the color of the whole card, or pink.
  const cardGas = n ? neonGasOf(mr / n, mg / n, mb / n) : null;
  const fallback = cardGas ?? NEON_PINK;
  for (const t of tubes) if (t.gas[0] < 0) t.gas = fallback;

  // The border: one tube bent round the art window in the frame, its two ends side by side in a
  // short break near the top right, where its electrodes sit.
  const room = Math.min(art.x, art.y, faceW - art.x - art.w, faceH - art.y - art.h);
  if (room > 1.6 * W) {
    const o = Math.min(room * 0.42, 0.024 * S);
    const p = roundRect(art.x - o, art.y - o, art.x + art.w + o, art.y + art.h + o, 0.035 * S, STEP);
    // The path starts at the top right corner's start; begin the tube just after the break.
    const N = p.length / 2;
    const breakAt = Math.floor(N - (0.16 * S) / STEP);
    const gap = Math.ceil((2.4 * W) / STEP);
    const q: number[] = [];
    for (let k = gap; k < N - gap; k++) {
      const i = (breakAt + k) % N;
      q.push(p[i * 2], p[i * 2 + 1]);
    }
    // The art tubes' colors are the picture's; the border takes a color that sets them off.
    const apart = (c: number[]) => Math.min(9, ...tubes.map((t) => Math.hypot(c[0] - t.gas[0], c[1] - t.gas[1], c[2] - t.gas[2])));
    const border = [fallback, NEON_PINK, [0.1, 0.86, 1.0] as [number, number, number]].find((c) => apart(c) > 0.5) ?? fallback;
    tubes.push({ pts: Float32Array.from(q), len: polyLen(q), gas: border, border: true });
  }
  return { tubes, width: W };
}

/** Past this distance (face px) the tube map holds no tube. */
export const NEON_REACH = 80;

/**
 * The tube map, `w` × `h` RGBA floats over the face: r: distance to the nearest tube's centre
 * line (face px, NEON_REACH where none is near), g: how far along that tube (face px), b: its index.
 */
export function neonTubeMap(d: NeonDesign, w: number, h: number, faceW: number, faceH: number): Float32Array {
  const out = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = NEON_REACH;
    out[i * 4 + 2] = -1;
    out[i * 4 + 3] = 1;
  }
  const sx = faceW / w;
  const sy = faceH / h;
  d.tubes.forEach((t, id) => {
    // Segments of three points: the line is smooth enough that this is exact to a fraction of a pixel.
    const p = t.pts;
    const last = p.length / 2 - 1;
    let s = 0;
    for (let k = 0; k < last; k += 3) {
      const k1 = Math.min(last, k + 3);
      const ax = p[k * 2];
      const ay = p[k * 2 + 1];
      const dx = p[k1 * 2] - ax;
      const dy = p[k1 * 2 + 1] - ay;
      const l2 = dx * dx + dy * dy || 1e-6;
      const L = Math.sqrt(l2);
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + dx) - NEON_REACH) / sx));
      const i1 = Math.min(w - 1, Math.ceil((Math.max(ax, ax + dx) + NEON_REACH) / sx));
      const j0 = Math.max(0, Math.floor((Math.min(ay, ay + dy) - NEON_REACH) / sy));
      const j1 = Math.min(h - 1, Math.ceil((Math.max(ay, ay + dy) + NEON_REACH) / sy));
      for (let j = j0; j <= j1; j++) {
        const qy = (j + 0.5) * sy - ay;
        for (let i = i0; i <= i1; i++) {
          const qx = (i + 0.5) * sx - ax;
          let u = (qx * dx + qy * dy) / l2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const ex = qx - dx * u;
          const ey = qy - dy * u;
          const d2 = ex * ex + ey * ey;
          const o = (j * w + i) * 4;
          if (d2 < out[o] * out[o]) {
            out[o] = Math.sqrt(d2);
            out[o + 1] = s + u * L;
            out[o + 2] = id;
          }
        }
      }
      s += L;
    }
  });
  return out;
}

/**
 * The wall map, `w` × `h` RGBA floats over the face: rgb, the colored light the tubes pool on the
 * wall (about 1 right behind a tube), a, the tube that lights it most. Each bit of tube is a lamp
 * standing a little off the wall: a tight pool right behind it and a broad spill further out.
 */
export function neonWallMap(d: NeonDesign, w: number, h: number, faceW: number, faceH: number): Float32Array {
  const out = new Float32Array(w * h * 4);
  const S = Math.min(faceW, faceH);
  const h1 = 1.7 * d.width;
  const h2 = 0.09 * S;
  const sx = faceW / w;
  const sy = faceH / h;
  const best = new Float32Array(w * h);
  const one = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i * 4 + 3] = -1;
  d.tubes.forEach((t, id) => {
    one.fill(0);
    const p = t.pts;
    const step = 2;
    for (let k = 0; k < p.length; k += step * 2) {
      const x = p[k];
      const y = p[k + 1];
      const ds = Math.min(step, (p.length - k) / 2) * 3;
      const r = 6 * h2;
      const i0 = Math.max(0, Math.floor((x - r) / sx));
      const i1 = Math.min(w - 1, Math.ceil((x + r) / sx));
      const j0 = Math.max(0, Math.floor((y - r) / sy));
      const j1 = Math.min(h - 1, Math.ceil((y + r) / sy));
      for (let j = j0; j <= j1; j++) {
        const dy = (j + 0.5) * sy - y;
        for (let i = i0; i <= i1; i++) {
          const dx = (i + 0.5) * sx - x;
          const d2 = dx * dx + dy * dy;
          // A line of lamps a height h off the wall gives 1 right behind it: ds / (2h) · (1 + d²/h²)^-3/2.
          const a = 1 + d2 / (h1 * h1);
          const b = 1 + d2 / (h2 * h2);
          one[j * w + i] += ds * (0.6 / (2 * h1 * a * Math.sqrt(a)) + 0.16 / (2 * h2 * b * Math.sqrt(b)));
        }
      }
    }
    const k = t.border ? 0.45 : 1;
    for (let i = 0; i < w * h; i++) {
      const e = one[i] * k;
      out[i * 4] += e * t.gas[0];
      out[i * 4 + 1] += e * t.gas[1];
      out[i * 4 + 2] += e * t.gas[2];
      if (e > best[i]) {
        best[i] = e;
        out[i * 4 + 3] = id;
      }
    }
  });
  return out;
}

/** Face px between posts along a tube (as NEON_POST_GAP in the shader); at least two per tube. */
export const NEON_POST_GAP = 300;

/** Where the posts hold each tube, x, y pairs in face px: evenly along it, half a gap from each end. */
export function neonPosts(d: NeonDesign): number[] {
  const out: number[] = [];
  for (const t of d.tubes) {
    const n = Math.max(2, Math.floor(t.len / NEON_POST_GAP));
    const p = t.pts;
    let k = 0;
    let s = 0;
    for (let i = 2; i < p.length && k < n; i += 2) {
      const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      while (k < n && ((k + 0.5) * t.len) / n <= s + L) {
        const u = (((k + 0.5) * t.len) / n - s) / (L || 1);
        out.push(p[i - 2] + (p[i] - p[i - 2]) * u, p[i - 1] + (p[i + 1] - p[i - 1]) * u);
        k++;
      }
      s += L;
    }
  }
  return out;
}
