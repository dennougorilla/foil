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

/**
 * Splits the picture into `k` regions of like color (k-means on the blurred features, started
 * from far-apart colors so it is deterministic). Null when the picture is all one color.
 */
function regions(F: Float32Array[], wt: number[], n: number, k: number): Uint8Array | null {
  const dims = F.length;
  const at = (i: number, c: number) => F[c][i] * wt[c];
  // Every 7th cell is enough to place the centres.
  const sample: number[] = [];
  for (let i = 0; i < n; i += 7) sample.push(i);
  const mean = new Array(dims).fill(0);
  for (const i of sample) for (let c = 0; c < dims; c++) mean[c] += at(i, c) / sample.length;
  const cent: number[][] = [];
  const d2 = (i: number, m: number[]) => {
    let s = 0;
    for (let c = 0; c < dims; c++) s += (at(i, c) - m[c]) ** 2;
    return s;
  };
  // Farthest-point start: the color farthest from the mean, then each next farthest from all chosen.
  const near = sample.map((i) => d2(i, mean));
  for (let j = 0; j < k; j++) {
    let best = 0;
    for (let s = 1; s < sample.length; s++) if (near[s] > near[best]) best = s;
    if (near[best] < 0.004) break;
    const m = Array.from({ length: dims }, (_, c) => at(sample[best], c));
    cent.push(m);
    for (let s = 0; s < sample.length; s++) near[s] = Math.min(near[s], d2(sample[s], m));
  }
  if (cent.length < 2) return null;
  const lab = new Uint8Array(n);
  for (let it = 0; it < 8; it++) {
    const sum = cent.map(() => new Array(dims + 1).fill(0));
    for (let i = 0; i < n; i++) {
      let b = 0;
      let bd = Infinity;
      for (let j = 0; j < cent.length; j++) {
        const d = d2(i, cent[j]);
        if (d < bd) {
          bd = d;
          b = j;
        }
      }
      lab[i] = b;
      const sm = sum[b];
      for (let c = 0; c < dims; c++) sm[c] += at(i, c);
      sm[dims]++;
    }
    for (let j = 0; j < cent.length; j++) if (sum[j][dims]) for (let c = 0; c < dims; c++) cent[j][c] = sum[j][c] / sum[j][dims];
  }
  return lab;
}

/** The radius a line bends at round point i, from its turning over `k` points either side. */
function bendAt(p: ArrayLike<number>, i: number, k: number, step: number): number {
  const n = p.length / 2;
  const a = Math.max(0, i - k);
  const b = Math.min(n - 1, i + k);
  if (i - a < 2 || b - i < 2) return Infinity;
  const ux = p[i * 2] - p[a * 2];
  const uy = p[i * 2 + 1] - p[a * 2 + 1];
  const vx = p[b * 2] - p[i * 2];
  const vy = p[b * 2 + 1] - p[i * 2 + 1];
  const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  return turn < 1e-4 ? Infinity : ((b - a) * 0.5 * step) / turn;
}

/** True where a closed line bends tighter than `minR` anywhere. */
function kinked(p: number[], minR: number, step: number): boolean {
  const k = Math.max(2, Math.round(minR / step));
  const n = p.length / 2;
  // Measured on the loop laid out three times, so every point has neighbours both sides.
  const q = p.concat(p, p);
  for (let i = n; i < 2 * n; i++) if (bendAt(q, i, k, step) < minR) return true;
  return false;
}

/** An open line cut into runs wherever it bends tighter than `minR` (a curl, a hook). */
function unkink(p: number[], minR: number, step: number): number[][] {
  const k = Math.max(2, Math.round(minR / step));
  const n = p.length / 2;
  const out: number[][] = [];
  let run: number[] = [];
  for (let i = 0; i < n; i++) {
    if (bendAt(p, i, k, step) < minR) {
      // Drop the bend and a little either side of it.
      if (run.length > 4 * k) out.push(run.slice(0, run.length - 2 * k));
      run = [];
      continue;
    }
    run.push(p[i * 2], p[i * 2 + 1]);
  }
  if (run.length) out.push(run);
  return out.filter((r) => r.length >= 8);
}

/**
 * Joins open tubes of one gas whose ends meet across a short break, heading towards each other
 * (a horizon cut in two), so the line is bent from one tube.
 */
function joinBroken(tubes: NeonTube[], reach: number, step: number, clear: number) {
  const dir = (p: Float32Array, end: boolean): [number, number, number, number] => {
    const n = p.length / 2;
    const i = end ? n - 1 : 0;
    const j = end ? Math.max(0, n - 8) : Math.min(n - 1, 7);
    const dx = p[i * 2] - p[j * 2];
    const dy = p[i * 2 + 1] - p[j * 2 + 1];
    const l = Math.hypot(dx, dy) || 1;
    return [p[i * 2], p[i * 2 + 1], dx / l, dy / l];
  };
  for (let again = true; again; ) {
    again = false;
    search: for (let a = 0; a < tubes.length; a++)
      for (let b = 0; b < tubes.length; b++) {
        if (a === b) continue;
        const A = tubes[a];
        const B = tubes[b];
        if (A.gas.join() !== B.gas.join()) continue;
        for (const ea of [true, false])
          for (const eb of [true, false]) {
            const [ax, ay, adx, ady] = dir(A.pts, ea);
            const [bx, by, bdx, bdy] = dir(B.pts, eb);
            const gx = bx - ax;
            const gy = by - ay;
            const g = Math.hypot(gx, gy);
            if (g > reach || g < 1) continue;
            // Both ends must point across the gap at each other.
            if ((adx * gx + ady * gy) / g < 0.45 || (bdx * gx + bdy * gy) / g > -0.45) continue;
            const pa = Array.from(ea ? A.pts : reverse(A.pts));
            const pb = Array.from(eb ? reverse(B.pts) : B.pts);
            // The bridge: a cubic from A's end to B's along their directions.
            const bridge: number[] = [];
            const m = Math.max(2, Math.ceil(g / step));
            const hnd = g * 0.4;
            const c1x = ax + adx * hnd;
            const c1y = ay + ady * hnd;
            const c2x = bx + bdx * hnd;
            const c2y = by + bdy * hnd;
            for (let s = 1; s < m; s++) {
              const u = s / m;
              const v = 1 - u;
              bridge.push(
                v * v * v * ax + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * bx,
                v * v * v * ay + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * by,
              );
            }
            // Never across another tube.
            const crosses = tubes.some((t, k) => {
              if (k === a || k === b) return false;
              for (let i = 0; i < bridge.length; i += 2)
                for (let j = 0; j < t.pts.length; j += 4) if (Math.hypot(bridge[i] - t.pts[j], bridge[i + 1] - t.pts[j + 1]) < clear) return true;
              return false;
            });
            if (crosses) continue;
            const pts = resample(pa.concat(bridge, pb), false, step);
            tubes[a] = { pts: Float32Array.from(pts), len: polyLen(pts), gas: B.len > A.len ? B.gas : A.gas, border: false };
            tubes.splice(b, 1);
            again = true;
            break search;
          }
      }
  }
}

function reverse(p: Float32Array): Float32Array {
  const n = p.length / 2;
  const out = new Float32Array(p.length);
  for (let i = 0; i < n; i++) {
    out[i * 2] = p[(n - 1 - i) * 2];
    out[i * 2 + 1] = p[(n - 1 - i) * 2 + 1];
  }
  return out;
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
  const W = 0.025 * S; // tube width: a thick body of glass, as on a real sign
  const sx = faceW / w;
  const sy = faceH / h;
  const STEP = 3;
  // Nothing shorter than about a sixth of the card's height: a stub reads as a stray mark.
  const minLen = 0.18 * Math.max(faceW, faceH);
  // A closed loop round a small, strong shape (an eye, a moon) may be shorter: one such accent.
  const minAccent = 0.2 * S;
  // Glass bends no tighter than this (centre line), so a curl in an outline is cut, not followed.
  const minBend = 1.5 * W;
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
    // The picture is first split into a few regions of like color (the subject, its parts, the
    // ground), as a sign designer would block it in; the tubes are the outlines of those regions,
    // so they run round shapes (a beak, an eye, the sun) instead of wherever the shading changes.
    // Worked on a blurred picture, so pixel-art steps, dither and fine texture never matter.
    const sigma = (0.012 * S) / sx;
    const F = [blur(tone, aw, ah, boxFor(sigma)), blur(rg, aw, ah, boxFor(sigma)), blur(yb, aw, ah, boxFor(sigma))];
    const FW8 = [1, 1.3, 1.1];
    const lines: (Line & { len: number })[] = [];
    // The step across an outline: the slope of the blurred picture over about a tube width.
    const g = new Float32Array(n);
    const reachG = Math.max(1, Math.round((0.6 * W) / sx));
    for (let y = reachG; y < ah - reachG; y++)
      for (let x = reachG; x < aw - reachG; x++) {
        const i = y * aw + x;
        let s2 = 0;
        for (let c = 0; c < 3; c++) {
          const f = F[c];
          s2 += (FW8[c] * (f[i + reachG] - f[i - reachG])) ** 2 + (FW8[c] * (f[i + reachG * aw] - f[i - reachG * aw])) ** 2;
        }
        g[i] = 0.5 * Math.sqrt(s2);
      }
    const REGIONS = 5;
    const labels = regions(F, FW8, n, REGIONS);
    if (labels) {
      const ind = new Float32Array(n);
      const rad = boxFor((0.01 * S) / sx);
      for (let k = 0; k < REGIONS; k++) {
        let any = 0;
        for (let i = 0; i < n; i++) any += ind[i] = labels[i] === k ? 1 : 0;
        if (any < 8 || any > n - 8) continue;
        for (const l of isoLines(blur(ind, aw, ah, rad), g, aw, ah, 0.5)) {
          if (l.contrast < 0.1) continue;
          for (let i = 0; i < l.pts.length; i += 2) {
            l.pts[i] = (l.pts[i] + ax0 + 0.5) * sx;
            l.pts[i + 1] = (l.pts[i + 1] + ay0 + 0.5) * sy;
          }
          const len = polyLen(l.pts) + (l.closed ? Math.hypot(l.pts[0] - l.pts[l.pts.length - 2], l.pts[1] - l.pts[l.pts.length - 1]) : 0);
          if (len >= (l.closed ? minAccent : minLen)) lines.push({ ...l, len });
        }
      }
    }

    // Kept well inside the art window, smoothed into broad bends, then the strongest long runs
    // taken one by one; anything running alongside a tube already taken (the parallel outlines
    // of one edge, the far side of a thin shape) is left out, and so is anything short.
    const margin = 2.6 * W;
    const inside = (x: number, y: number) =>
      x > art.x + margin && x < art.x + art.w - margin && y > art.y + margin && y < art.y + art.h - margin;
    type Cand = { pts: number[]; closed: boolean; score: number; contrast: number; ring?: boolean };
    const cands: Cand[] = [];
    const smoothPts = (0.026 * S) / STEP;
    // A shape outlined all the way round (the subject's silhouette, an eye, the sun's disc) says
    // more than a stretch of edge: it counts double.
    const CLOSED = 2.2;
    const worth = (l: { len: number; contrast: number; closed: boolean }) => l.len ** 1.5 * l.contrast ** 2 * (l.closed ? CLOSED : 1);
    // Open runs, cut wherever the line bends tighter than glass can be bent.
    const openRuns = (q: number[], contrast: number) => {
      for (const r of unkink(q, minBend, STEP)) {
        const L = polyLen(r);
        if (L < minLen) continue;
        // A short straight bar (a stripe's edge) is a partial mark, not a drawing.
        const chord = Math.hypot(r[r.length - 2] - r[0], r[r.length - 1] - r[1]);
        if (chord > 0.92 * L && L < 0.42 * S) continue;
        cands.push({ pts: r, closed: false, score: worth({ len: L, contrast, closed: false }), contrast });
      }
    };
    // Only the strongest few dozen are worth smoothing.
    lines.sort((a, b) => worth(b) - worth(a));
    for (const l of lines.slice(0, 48)) {
      const all = inside(l.pts[0], l.pts[1]) && l.closed;
      let p = resample(l.pts, l.closed, STEP);
      if (all) {
        let ok = true;
        for (let i = 0; i < p.length && ok; i += 2) ok = inside(p[i], p[i + 1]);
        if (ok) {
          p = smooth(p, true, smoothPts);
          const L = polyLen(p);
          if (!kinked(p, minBend, STEP)) {
            // A small loop is an accent only where the shape stands out strongly.
            if (L >= minLen || l.contrast > 0.3) cands.push({ pts: p, closed: true, score: worth({ len: L, contrast: l.contrast, closed: true }), contrast: l.contrast });
            continue;
          }
          if (L < minLen) continue;
        }
      }
      if (l.len < minLen) continue;
      // Open runs inside the margin.
      let run: number[] = [];
      const flush = () => {
        if (run.length / 2 > 4 && polyLen(run) >= minLen) openRuns(smooth(run, false, smoothPts), l.contrast);
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

    // The focal point: a small, strongly darker or lighter spot well inside the picture (an eye)
    // gets a ring of its own, laid first so the outlines give way round it.
    {
      const D = blur(tone, aw, ah, boxFor((0.015 * S) / sx));
      const D2 = blur(tone, aw, ah, boxFor((0.05 * S) / sx));
      const edge = Math.round((0.14 * S) / sx);
      let bi = -1;
      let bv = 0;
      for (let y = edge; y < ah - edge; y++)
        for (let x = edge; x < aw - edge; x++) {
          const i = y * aw + x;
          const v = Math.abs(D[i] - D2[i]);
          if (v > bv) {
            bv = v;
            bi = i;
          }
        }
      if (bi >= 0 && bv > 0.11) {
        const cx = ((bi % aw) + ax0 + 0.5) * sx;
        const cy = (Math.floor(bi / aw) + ay0 + 0.5) * sy;
        // The spot's edge: the circle round it where the picture steps most.
        let br = 0;
        let bg = 0;
        for (let r = 0.022 * S; r <= 0.07 * S; r += 3) {
          let sg = 0;
          for (let k = 0; k < 32; k++) {
            const a = (k / 32) * Math.PI * 2;
            const gx = Math.round((cx + Math.cos(a) * r) / sx - 0.5 - ax0);
            const gy = Math.round((cy + Math.sin(a) * r) / sy - 0.5 - ay0);
            if (gx >= 0 && gy >= 0 && gx < aw && gy < ah) sg += g[gy * aw + gx];
          }
          if (sg / 32 > bg) {
            bg = sg / 32;
            br = r;
          }
        }
        // A spot, not the corner of a larger shape: it stands out from its surround on every side.
        const at = (x: number, y: number) => {
          const gx = Math.min(aw - 1, Math.max(0, Math.round(x / sx - 0.5 - ax0)));
          const gy = Math.min(ah - 1, Math.max(0, Math.round(y / sy - 0.5 - ay0)));
          return D[gy * aw + gx];
        };
        const mid = at(cx, cy);
        let all = true;
        for (let k = 0; k < 16 && all; k++) {
          const a = (k / 16) * Math.PI * 2;
          all = Math.abs(at(cx + Math.cos(a) * br * 1.6, cy + Math.sin(a) * br * 1.6) - mid) > 0.08;
        }
        if (bg > 0.12 && all) {
          const R = Math.max(br + 0.8 * W, 0.05 * S);
          const ring: number[] = [];
          const m = Math.ceil((2 * Math.PI * R) / STEP);
          for (let k = 0; k < m; k++) ring.push(cx + Math.cos((k / m) * 2 * Math.PI) * R, cy + Math.sin((k / m) * 2 * Math.PI) * R);
          if (ring.every((v, k) => (k % 2 ? v > art.y + margin && v < art.y + art.h - margin : v > art.x + margin && v < art.x + art.w - margin)))
            cands.unshift({ pts: ring, closed: true, score: Infinity, contrast: bg, ring: true });
        }
      }
    }

    // Cells near a tube already taken.
    const mc = 4;
    const mw = Math.ceil(faceW / mc);
    const mh = Math.ceil(faceH / mc);
    const taken = new Uint8Array(mw * mh);
    const selfAt = new Int32Array(mw * mh);
    const selfGen = new Int32Array(mw * mh);
    let gen = 0;
    const keep = 2.5 * W;
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
    let accents = 0;
    for (const c of cands) {
      if (tubes.length >= NEON_MAX_TUBES) break;
      let p = c.pts;
      const accent = (c.closed && polyLen(p) < minLen) || !!c.ring;
      if (accent && accents > 0) continue;
      if (c.closed) {
        // A loop is bent from one tube whose two ends meet at its lowest point, where the electrodes
        // are tucked out of sight: open it there with a short gap.
        const N = p.length / 2;
        let lo = 0;
        for (let i = 0; i < N; i++) if (p[i * 2 + 1] > p[lo * 2 + 1]) lo = i;
        const gap = Math.ceil(((c.ring ? 0.9 : 1.9) * W) / STEP);
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
        // (A ring is a clean circle: its ends meeting across the gap are not it doubling back.)
        const near = taken[cell] || (!c.ring && selfGen[cell] === gen && i - selfAt[cell] > lag);
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
        if (len < (accent && r0.length === p.length ? Math.min(minAccent, len) : minLen)) continue;
        if (accent) accents++;
        for (let i = 0; i < r.length; i += 6) stamp(r[i], r[i + 1], c.ring ? 1.6 * W : keep, (j) => (taken[j] = 1));
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
    joinBroken(tubes, 2.4 * keep, STEP, keep);
    // A short tube off in a corner of the window or hugging its edge, away from the subject, reads as a stray.
    for (let i = tubes.length - 1; i >= 0; i--) {
      const t = tubes[i];
      if (t.len > 0.42 * S) continue;
      let cx = 0;
      let cy = 0;
      for (let k = 0; k < t.pts.length; k += 2) {
        cx += t.pts[k];
        cy += t.pts[k + 1];
      }
      cx /= t.pts.length / 2;
      cy /= t.pts.length / 2;
      const ex = Math.min(cx - art.x, art.x + art.w - cx) / art.w;
      const ey = Math.min(cy - art.y, art.y + art.h - cy) / art.h;
      if ((ex < 0.24 && ey < 0.24) || Math.min(ex, ey) < 0.15) tubes.splice(i, 1);
    }
    // So does a short tube standing off on its own, away from every longer one.
    const apartFrom = (a: NeonTube, b: NeonTube) => {
      let m = Infinity;
      for (let i = 0; i < a.pts.length; i += 6)
        for (let j = 0; j < b.pts.length; j += 6) m = Math.min(m, Math.hypot(a.pts[i] - b.pts[j], a.pts[i + 1] - b.pts[j + 1]));
      return m;
    };
    const lone = tubes.filter((t) => t.len < 0.42 * S && tubes.some((u) => u.len > t.len) && tubes.every((u) => u.len <= t.len || apartFrom(t, u) > 0.2 * S));
    for (const t of lone) tubes.splice(tubes.indexOf(t), 1);
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
export const NEON_REACH = 110;

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
  const h1 = 1.6 * d.width;
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
          one[j * w + i] += ds * (0.7 / (2 * h1 * a * Math.sqrt(a)) + 0.08 / (2 * h2 * b * Math.sqrt(b)));
        }
      }
    }
    const k = t.border ? 0.35 : 1;
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

/** Face px between the supports holding a tube; the border tube's are further apart. */
export const NEON_POST_GAP = 420;
const NEON_BORDER_POST_GAP = 620;
/** A tube shorter than this hangs from its electrode housings alone. */
export const NEON_NO_POST = 300;

/** Where the posts hold each tube, x, y pairs in face px: evenly along it, half a gap from each end. */
export function neonPosts(d: NeonDesign): number[] {
  const out: number[] = [];
  for (const t of d.tubes) {
    if (t.len < NEON_NO_POST) continue;
    const n = Math.max(1, Math.round(t.len / (t.border ? NEON_BORDER_POST_GAP : NEON_POST_GAP)));
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
