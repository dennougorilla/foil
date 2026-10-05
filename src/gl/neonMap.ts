// Neon's sign, designed off the card face the way a sign maker blocks in a picture: the subject's
// silhouette as one long tube with few bends, two or three details inside it that mean something,
// stylised strokes on a sparse picture, and a dim tube round the art window. The shader can't see a whole outline from one pixel, so the tubes
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
  /** What the tube draws (the silhouette, a detail, a stroke, the frame). */
  role?: NeonRole;
}

export interface NeonDesign {
  tubes: NeonTube[];
  /** Tube width (glass outside to outside), face px. */
  width: number;
}

/** Tubes bent from the picture (the border tube comes on top): the silhouette, three details or strokes, a horizon. */
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

/** The neon colors a gas comes in: white for light greys, null for dark greys (no gas of its own). */
export function neonGasOf(r: number, g: number, b: number): [number, number, number] | null {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  if (sat < 0.2 && mx > 0.7) return NEON_WHITE;
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
/** A cool white tube (a moon, an eye's glint). */
export const NEON_WHITE: [number, number, number] = [0.66, 0.8, 1.0];

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


/** Connected components (4-neighbour) of the set cells of `mask`; `lab` is -1 off the mask. */
function components(mask: Uint8Array, w: number, h: number): { lab: Int32Array; size: number[] } {
  const lab = new Int32Array(w * h).fill(-1);
  const size: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = size.length;
    let n = 0;
    lab[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0 && mask[i - 1] && lab[i - 1] < 0) (lab[i - 1] = id), stack.push(i - 1);
      if (x < w - 1 && mask[i + 1] && lab[i + 1] < 0) (lab[i + 1] = id), stack.push(i + 1);
      if (y > 0 && mask[i - w] && lab[i - w] < 0) (lab[i - w] = id), stack.push(i - w);
      if (y < h - 1 && mask[i + w] && lab[i + w] < 0) (lab[i + w] = id), stack.push(i + w);
    }
    size.push(n);
  }
  return { lab, size };
}

/** The mask with every hole filled: whatever the outside cannot reach without crossing it. */
function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h).fill(1);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!mask[i] && out[i]) {
      out[i] = 0;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) seed(x), seed((h - 1) * w + x);
  for (let y = 0; y < h; y++) seed(y * w), seed(y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  return out;
}

/** Share of a region's edge cells that lie on the edge of the window (a cropped subject touches it). */
function edgeContact(mask: Uint8Array, w: number, h: number): number {
  let edge = 0;
  let onWindow = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (border) {
        onWindow++;
        edge++;
      } else if (!mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) edge++;
    }
  return edge ? onWindow / edge : 0;
}

/** Douglas–Peucker: the few points that keep a line within `tol` of where it ran. */
function simplify(p: number[], closed: boolean, tol: number): number[] {
  const n = p.length / 2;
  if (n < 3) return p.slice();
  const keep = new Uint8Array(n);
  const rec = (a: number, b: number) => {
    const ax = p[a * 2];
    const ay = p[a * 2 + 1];
    const dx = p[b * 2] - ax;
    const dy = p[b * 2 + 1] - ay;
    const L = Math.hypot(dx, dy) || 1e-6;
    let far = -1;
    let fd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[i * 2] - ax) * dy - (p[i * 2 + 1] - ay) * dx) / L;
      if (d > fd) (fd = d), (far = i);
    }
    if (far < 0) return;
    keep[far] = 1;
    rec(a, far);
    rec(far, b);
  };
  // A loop is split at its point farthest from its start.
  let b = n - 1;
  if (closed) {
    let fd = 0;
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(p[i * 2] - p[0], p[i * 2 + 1] - p[1]);
      if (d > fd) (fd = d), (b = i);
    }
    rec(0, b);
    rec(b, n - 1);
  } else rec(0, b);
  keep[0] = keep[b] = keep[n - 1] = 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/**
 * A traced outline bent the way a glass blower bends a tube: the line kept within `tol` of where
 * it ran (Douglas–Peucker), so it follows the real contour, then each corner rounded with a
 * circular bend as wide as the straight runs either side allow (up to `rMax`, never tighter than
 * `rMin` unless the runs are too short for it). A gentle turn becomes a long sweep, a sharp one (a
 * beak's hook) a tight, even bend; no freehand wobble survives. Points `step` apart.
 */
export function glassBend(p: number[], closed: boolean, tol: number, rMin: number, rMax: number, step: number): number[] {
  let v = simplify(p, closed, tol);
  // Merge corners closer than the narrowest bend (they read as a kink, not a bend).
  for (let pass = 0; pass < 3; pass++) {
    const n = v.length / 2;
    if (n < (closed ? 4 : 3)) break;
    const keep: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const isEnd = !closed && (i === 0 || i === n - 1);
      const nextEnd = !closed && j === n - 1;
      if (!isEnd && !nextEnd && j !== 0 && Math.hypot(v[j * 2] - v[i * 2], v[j * 2 + 1] - v[i * 2 + 1]) < rMin) {
        // Replace this pair by its midpoint.
        keep.push((v[i * 2] + v[j * 2]) / 2, (v[i * 2 + 1] + v[j * 2 + 1]) / 2);
        i++;
        continue;
      }
      keep.push(v[i * 2], v[i * 2 + 1]);
    }
    if (keep.length === v.length) break;
    v = keep;
  }
  const n = v.length / 2;
  if (n < 2) return resample(v, closed, step);
  const out: number[] = [];
  const segLen = (i: number, j: number) => Math.hypot(v[j * 2] - v[i * 2], v[j * 2 + 1] - v[i * 2 + 1]);
  if (!closed) out.push(v[0], v[1]);
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    const vx = v[i * 2];
    const vy = v[i * 2 + 1];
    const la = segLen(a, i);
    const lb = segLen(i, b);
    const ux = (v[a * 2] - vx) / (la || 1);
    const uy = (v[a * 2 + 1] - vy) / (la || 1);
    const wx = (v[b * 2] - vx) / (lb || 1);
    const wy = (v[b * 2 + 1] - vy) / (lb || 1);
    const cosT = Math.max(-1, Math.min(1, ux * wx + uy * wy));
    const theta = Math.acos(cosT); // the inside angle at the corner
    const phi = Math.PI - theta; // how far the tube turns
    if (phi < 0.02 || la < 1e-3 || lb < 1e-3) {
      out.push(vx, vy);
      continue;
    }
    // Room on each side: half a run that has a bend at its other end too, nearly all of an end run.
    const ra = !closed && a === 0 ? 0.85 * la : 0.5 * la;
    const rb = !closed && b === n - 1 ? 0.85 * lb : 0.5 * lb;
    const tanH = Math.tan(phi / 2);
    let r = Math.min(rMax, Math.min(ra, rb) / tanH);
    r = Math.max(r, Math.min(rMin, Math.min(ra, rb) / tanH));
    const t = r * tanH;
    const bx = ux + wx;
    const by = uy + wy;
    const bl = Math.hypot(bx, by) || 1;
    const cd = r / Math.sin(theta / 2);
    const cx = vx + (bx / bl) * cd;
    const cy = vy + (by / bl) * cd;
    const p1x = vx + ux * t;
    const p1y = vy + uy * t;
    const p2x = vx + wx * t;
    const p2y = vy + wy * t;
    const a1 = Math.atan2(p1y - cy, p1x - cx);
    let a2 = Math.atan2(p2y - cy, p2x - cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    a2 = a1 + da;
    const m = Math.max(2, Math.ceil((Math.abs(da) * r) / (step * 0.5)));
    for (let k = 0; k <= m; k++) {
      const ang = a1 + (da * k) / m;
      out.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    }
  }
  if (!closed) out.push(v[(n - 1) * 2], v[(n - 1) * 2 + 1]);
  return resample(out, closed, step);
}

/**
 * An open traced line with its busy stretches calmed: where it zigzags (feather tips, a ragged
 * edge: much turning that cancels out), it is replaced by a heavily smoothed course; where it
 * turns one way (a crown, a beak's hook), it keeps its light smoothing. `S`: the card's short side.
 */
export function calm(p: number[], S: number, step: number): number[] {
  const n = p.length / 2;
  const light = smooth(p, false, (0.004 * S) / step);
  if (n < 12) return light;
  const heavy = smooth(p, false, (0.06 * S) / step);
  const mid = smooth(p, false, (0.008 * S) / step);
  const k = Math.max(2, Math.round((0.02 * S) / step));
  const turn = new Float32Array(n);
  for (let i = k; i < n - k; i++) {
    const ax = mid[i * 2] - mid[(i - k) * 2];
    const ay = mid[i * 2 + 1] - mid[(i - k) * 2 + 1];
    const bx = mid[(i + k) * 2] - mid[i * 2];
    const by = mid[(i + k) * 2 + 1] - mid[i * 2 + 1];
    turn[i] = Math.atan2(ax * by - ay * bx, ax * bx + ay * by) / k;
  }
  const win = Math.round((0.1 * S) / step);
  const busy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let abs = 0;
    let net = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) (abs += Math.abs(turn[j])), (net += turn[j]);
    busy[i] = Math.min(1, Math.max(0, (abs - Math.abs(net) - 0.5 * Math.PI) / Math.PI));
  }
  const out = new Array<number>(p.length);
  for (let i = 0; i < n; i++) {
    let wsum = 0;
    let c = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) (wsum += busy[j]), c++;
    const wgt = Math.min(1, (2 * wsum) / c);
    for (let d = 0; d < 2; d++) out[i * 2 + d] = light[i * 2 + d] + (heavy[i * 2 + d] - light[i * 2 + d]) * wgt;
  }
  return out;
}

/**
 * An open line cut where it folds back along itself (both sides of a narrow slot, a hairpin): a
 * sign tube never runs back beside its own glass. `near`: how close a fold comes; `apart`: how far
 * along the line two points must be before they count as a fold.
 */
export function unfold(p: number[], near: number, apart: number, step: number): number[][] {
  const n = p.length / 2;
  const gap = Math.max(2, Math.round(apart / step));
  const back = Math.max(1, Math.round(near / step));
  const pieces: number[][] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    let fold = false;
    for (let j = start; j < i - gap && !fold; j++) fold = Math.hypot(p[i * 2] - p[j * 2], p[i * 2 + 1] - p[j * 2 + 1]) < near;
    if (fold) {
      const end = Math.max(start, i - back);
      if (end - start > 2) pieces.push(p.slice(start * 2, end * 2));
      start = i;
    }
  }
  if (n - start > 2) pieces.push(p.slice(start * 2));
  return pieces;
}

/** How much of each side of the window a region runs along: top, bottom, left, right (0..1). */
function sidesOf(mask: Uint8Array, w: number, h: number): number[] {
  const sides = [0, 0, 0, 0];
  for (let x = 0; x < w; x++) (sides[0] += mask[x]), (sides[1] += mask[(h - 1) * w + x]);
  for (let y = 0; y < h; y++) (sides[2] += mask[y * w]), (sides[3] += mask[y * w + w - 1]);
  return [sides[0] / w, sides[1] / w, sides[2] / h, sides[3] / h];
}

/**
 * The circle a closed outline's upper part follows (Kåsa's least-squares fit), as cx, cy, r; null
 * when that part is not round (within 6 % of the radius) or covers less than about a third of a turn.
 */
function circleOf(p: number[]): [number, number, number] | null {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 1; i < p.length; i += 2) (y0 = Math.min(y0, p[i])), (y1 = Math.max(y1, p[i]));
  const top: number[] = [];
  for (let i = 0; i < p.length; i += 2) if (p[i + 1] < y0 + 0.55 * (y1 - y0)) top.push(p[i], p[i + 1]);
  const n = top.length / 2;
  if (n < 12) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) (mx += top[i * 2]), (my += top[i * 2 + 1]);
  mx /= n;
  my /= n;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (let i = 0; i < n; i++) {
    const u = top[i * 2] - mx;
    const v = top[i * 2 + 1] - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-6) return null;
  const a = 0.5 * (suuu + suvv);
  const b = 0.5 * (svvv + svuu);
  const uc = (a * svv - b * suv) / det;
  const vc = (b * suu - a * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  const cx = uc + mx;
  const cy = vc + my;
  let err = 0;
  let a0 = Infinity;
  let a1 = -Infinity;
  for (let i = 0; i < n; i++) {
    err += (Math.hypot(top[i * 2] - cx, top[i * 2 + 1] - cy) - r) ** 2;
    const ang = Math.atan2(top[i * 2 + 1] - cy, top[i * 2] - cx);
    a0 = Math.min(a0, ang);
    a1 = Math.max(a1, ang);
  }
  if (Math.sqrt(err / n) > 0.06 * r || a1 - a0 < 0.6 * Math.PI) return null;
  return [cx, cy, r];
}

/** x, y pairs of a straight line from a to b, `step` apart. */
function straight(ax: number, ay: number, bx: number, by: number, step: number): number[] {
  const L = Math.hypot(bx - ax, by - ay);
  const m = Math.max(1, Math.round(L / step));
  const out: number[] = [];
  for (let k = 0; k <= m; k++) out.push(ax + ((bx - ax) * k) / m, ay + ((by - ay) * k) / m);
  return out;
}

/** The area an open line encloses with the straight chord between its ends (signed). */
export function enclosed(p: ArrayLike<number>): number {
  const n = p.length / 2;
  let A = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return A / 2;
}

/** Where the horizontal line at y crosses a closed loop: its leftmost and rightmost crossing. */
function spanAt(p: ArrayLike<number>, y: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const y0 = p[i * 2 + 1];
    const y1 = p[j * 2 + 1];
    if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
    const x = p[i * 2] + ((p[j * 2] - p[i * 2]) * (y - y0)) / (y1 - y0);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return hi > lo ? [lo, hi] : null;
}

/** The tube's role in the sign: the subject's silhouette, a detail inside it, a stylised stroke, or the frame. */
export type NeonRole = 'outline' | 'detail' | 'dot' | 'stroke' | 'border';

/** Details inside the silhouette (an eye, a beak, a face) and stylised strokes, at most. */
const NEON_MAX_DETAILS = 3;

/**
 * Lays out the sign. `rgba`: the face drawn at `w` × `h` (each cell `faceW / w` face px);
 * `art`: the art window in face px.
 *
 * Designed the way a sign maker blocks in a picture: first the subject (the largest region that
 * stands out from the ground, or failing that the brightest, most colorful compact shape), whose
 * outer silhouette becomes one long tube with few bends; then at most three details that mean
 * something (a ring round an eye, the outline of a shape inside it, a long line where two colors
 * meet); and on a sparse picture (a sun or a moon on an empty sky) a few stylised strokes: cut
 * lines across a sun, dashes of water under a moon, the horizon.
 */
export function neonDesign(rgba: ArrayLike<number>, w: number, h: number, faceW: number, faceH: number, art: FaceRect): NeonDesign {
  const S = Math.min(faceW, faceH);
  const W = 0.026 * S; // tube width: a thick body of glass, as on a real sign
  const sx = faceW / w;
  const sy = faceH / h;
  const STEP = 3;
  // Glass bends no tighter than this (centre line).
  const minBend = 1.6 * W;
  // Bent tubes: kept within tol of the traced contour, corners bent between rMin and rMax.
  const tol = 0.009 * S;
  const rMin = 0.5 * W;
  const rMax = 0.12 * S;
  const tubes: NeonTube[] = [];

  // The art window in cells, a little inside its edge.
  const ax0 = Math.ceil(art.x / sx) + 1;
  const ay0 = Math.ceil(art.y / sy) + 1;
  const aw = Math.max(0, Math.floor((art.x + art.w) / sx) - 1 - ax0);
  const ah = Math.max(0, Math.floor((art.y + art.h) / sy) - 1 - ay0);
  const n = aw * ah;
  const toFace = (pts: number[]) => {
    for (let i = 0; i < pts.length; i += 2) {
      pts[i] = (pts[i] + ax0 + 0.5) * sx;
      pts[i + 1] = (pts[i + 1] + ay0 + 0.5) * sy;
    }
    return pts;
  };
  const cellAt = (x: number, y: number) =>
    Math.min(ah - 1, Math.max(0, Math.round(y / sy - 0.5 - ay0))) * aw + Math.min(aw - 1, Math.max(0, Math.round(x / sx - 0.5 - ax0)));

  // Brightness (saturated color counted as bright) and two color-opponent channels, so a red
  // shape on a green ground of the same brightness still stands apart.
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
  const cardGas = n ? neonGasOf(mr / n, mg / n, mb / n) : null;
  const fallback = cardGas ?? NEON_PINK;

  // Kept inside the art window by this much (centre line), so no tube grazes its edge.
  const margin = 1.8 * W;
  const inside = (x: number, y: number) => x > art.x + margin && x < art.x + art.w - margin && y > art.y + margin && y < art.y + art.h - margin;
  // Both ends of an open line at the window's edge (within a tube and a half of where tubes may go).
  const atEdge = (x: number, y: number) => Math.min(x - art.x, art.x + art.w - x, y - art.y, art.y + art.h - y) < margin + 1.5 * W;
  const edgeToEdge = (p: ArrayLike<number>) => atEdge(p[0], p[1]) && atEdge(p[p.length - 2], p[p.length - 1]);

  if (n > 64) {
    // Worked on a blurred picture, so pixel-art steps, dither and fine texture never matter.
    const F = [tone, rg, yb].map((f) => blur(f, aw, ah, boxFor((0.012 * S) / sx)));
    const FW8 = [1, 1.3, 1.1];
    const raw = regions(F, FW8, n, 5);
    if (raw) {
      const K = Math.max(...raw) + 1;
      // Regions of like color, cleaned of specks: each cell goes to the region most of its neighbourhood is in.
      const indR = boxFor((0.008 * S) / sx);
      const ind = Array.from({ length: K }, (_, k) => blur(Float32Array.from(raw, (v) => (v === k ? 1 : 0)), aw, ah, indR));
      const lab = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        let b = 0;
        for (let k = 1; k < K; k++) if (ind[k][i] > ind[b][i]) b = k;
        lab[i] = b;
      }
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
      const featDist = (a: number[], b: number[]) => Math.hypot(...a.map((v, c) => (v - b[c]) * FW8[c]));
      const meanFeat = (mask: Uint8Array, want: number) => {
        const m = [0, 0, 0];
        let c = 0;
        for (let i = 0; i < n; i++)
          if (mask[i] === want) {
            for (let k = 0; k < 3; k++) m[k] += F[k][i];
            c++;
          }
        return c ? m.map((v) => v / c) : m;
      };

      // ---- The subject ----
      const subjectFrom = (m: Uint8Array): Uint8Array | null => {
        const sm = blur(Float32Array.from(m), aw, ah, boxFor((0.015 * S) / sx));
        const bin = Uint8Array.from(sm, (v) => (v > 0.5 ? 1 : 0));
        const { lab: cl, size } = components(bin, aw, ah);
        if (!size.length) return null;
        let big = 0;
        for (let k = 1; k < size.length; k++) if (size[k] > size[big]) big = k;
        return fillHoles(Uint8Array.from(cl, (v) => (v === big ? 1 : 0)), aw, ah);
      };
      const areaOf = (m: Uint8Array) => m.reduce((s, v) => s + v, 0) / n;
      // How round a shape is (1 for a disc), from the length of its outline.
      const compactOf = (m: Uint8Array) => {
        const ls = isoLines(blur(Float32Array.from(m), aw, ah, 1), new Float32Array(n), aw, ah, 0.5);
        const L = ls.reduce((t, l) => t + polyLen(l.pts), 0);
        return L > 0 ? (4 * Math.PI * areaOf(m) * n) / (L * L) : 0;
      };

      // The figure against the ground. The ground is told by its colors: those along the window's
      // edge that are rare in its middle (a subject cropped by the window lines the edge too, but
      // fills the middle). Whatever stands apart from all of them is the figure.
      const edgeIdx: number[] = [];
      const midIdx: number[] = [];
      for (let y = 0; y < ah; y++)
        for (let x = 0; x < aw; x++) {
          if (x < 2 || y < 2 || x >= aw - 2 || y >= ah - 2) edgeIdx.push(y * aw + x);
          if (x > aw * 0.3 && x < aw * 0.7 && y > ah * 0.3 && y < ah * 0.7) midIdx.push(y * aw + x);
        }
      const featAt = (i: number) => [F[0][i], F[1][i], F[2][i]];
      const edgeF = [0, 1, 2].map((c) => Float32Array.from(edgeIdx, (i) => F[c][i]));
      const edgeLab = regions(edgeF, FW8, edgeIdx.length, 5) ?? new Uint8Array(edgeIdx.length);
      const KE = Math.max(...edgeLab) + 1;
      const ec = Array.from({ length: KE }, () => [0, 0, 0, 0]);
      edgeIdx.forEach((i, j) => {
        const c = ec[edgeLab[j]];
        for (let k = 0; k < 3; k++) c[k] += F[k][i];
        c[3]++;
      });
      // How much fine detail each edge color carries: a defocused backdrop is smooth, a subject
      // in focus is textured (feathers, fur, leaves) even where the window crops it.
      const fineTone = blur(tone, aw, ah, boxFor((0.005 * S) / sx));
      const detail = blur(Float32Array.from(tone, (v, i) => Math.abs(v - fineTone[i]) + Math.abs(v - F[0][i]) * 0.5), aw, ah, boxFor((0.012 * S) / sx));
      const ed = new Array(KE).fill(0);
      edgeIdx.forEach((i, j) => (ed[edgeLab[j]] += detail[i]));
      const edgeCent = ec
        .map((c, k) => ({ f: c.slice(0, 3).map((v) => v / (c[3] || 1)), share: c[3] / edgeIdx.length, mid: 0, detail: ed[k] / (c[3] || 1) }))
        .filter((c) => c.share > 0);
      for (const i of midIdx) {
        const f = featAt(i);
        for (const c of edgeCent) if (featDist(f, c.f) < 0.1) c.mid++;
      }
      const smoothest = Math.min(...edgeCent.filter((c) => c.share >= 0.08).map((c) => c.detail));
      const blurredBack = smoothest < 0.02;
      // Ground colors: common along the edge, rare in the middle and (behind a subject in focus)
      // smooth. A color of the same hue as one that is not ground, only darker or paler, is the
      // subject in shadow or in light where the window crops it, so it is not ground either.
      const plain = (c: (typeof edgeCent)[number]) => c.share >= 0.08 && c.mid < 0.12 * midIdx.length && !(blurredBack && c.detail > 2 * smoothest + 0.01);
      const hueOf = (f: number[]) => (Math.hypot(f[1], f[2]) > 0.06 ? Math.atan2(f[2], f[1]) : null);
      const subjectHues = edgeCent.filter((c) => c.share >= 0.05 && !plain(c)).map((c) => hueOf(c.f)).filter((h): h is number => h !== null);
      const sameHue = (c: (typeof edgeCent)[number]) => {
        const h = hueOf(c.f);
        return h !== null && subjectHues.some((m) => Math.abs(Math.atan2(Math.sin(h - m), Math.cos(h - m))) < 0.35);
      };
      let groundCent = edgeCent.filter((c) => plain(c) && !sameHue(c));
      if (!groundCent.length) groundCent = [edgeCent.reduce((a, b) => (b.mid < a.mid ? b : a))];
      const sal = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const f = featAt(i);
        sal[i] = Math.min(...groundCent.map((c) => featDist(f, c.f)));
      }
      // Split at the level that best parts the two (Otsu), but never below a clear step.
      let thr = 0.14;
      {
        const H = new Array(64).fill(0);
        let mx = 1e-6;
        for (let i = 0; i < n; i++) mx = Math.max(mx, sal[i]);
        for (let i = 0; i < n; i++) H[Math.min(63, Math.floor((sal[i] / mx) * 64))]++;
        let sum = 0;
        for (let k = 0; k < 64; k++) sum += k * H[k];
        let wB = 0;
        let sB = 0;
        let best = -1;
        for (let k = 0; k < 64; k++) {
          wB += H[k];
          if (!wB || wB === n) continue;
          sB += k * H[k];
          const mB = sB / wB;
          const mF = (sum - sB) / (n - wB);
          const v = wB * (n - wB) * (mB - mF) ** 2;
          if (v > best) (best = v), (thr = Math.min(0.24, Math.max(0.12, ((k + 1) / 64) * mx)));
        }
      }
      const isGround = Uint8Array.from(sal, (v) => (v > thr ? 0 : 1));
      // Refined a few times as two color models, figure and ground, each a few colors (so a dark
      // part of the subject joins the subject's other colors), with neighbouring cells pulled the
      // same way and the window's middle leaning to the figure, its edge to the ground.
      {
        const centres = (want: number) => {
          const idx: number[] = [];
          for (let i = 0; i < n; i += 2) if (isGround[i] === want) idx.push(i);
          if (idx.length < 16) return [];
          const sub = [0, 1, 2].map((c) => Float32Array.from(idx, (i) => F[c][i]));
          const l = regions(sub, FW8, idx.length, 4) ?? new Uint8Array(idx.length);
          const acc = Array.from({ length: Math.max(...l) + 1 }, () => [0, 0, 0, 0]);
          idx.forEach((i, j) => {
            const a = acc[l[j]];
            for (let c = 0; c < 3; c++) a[c] += F[c][i];
            a[3]++;
          });
          return acc.filter((a) => a[3] > idx.length * 0.03).map((a) => a.slice(0, 3).map((v) => v / a[3]));
        };
        for (let it = 0; it < 3; it++) {
          const fc = centres(0);
          const bc = centres(1);
          if (!fc.length || !bc.length) break;
          const lean = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const f = featAt(i);
            const x = i % aw;
            const y = (i - x) / aw;
            const r = Math.max(Math.abs(x / aw - 0.5), Math.abs(y / ah - 0.5)) * 2;
            lean[i] = Math.min(...bc.map((c) => featDist(f, c))) - Math.min(...fc.map((c) => featDist(f, c))) + 0.08 * (0.6 - r);
          }
          const sm = blur(lean, aw, ah, boxFor((0.012 * S) / sx));
          for (let i = 0; i < n; i++) isGround[i] = sm[i] > 0 ? 0 : 1;
        }
      }
      let figure = subjectFrom(Uint8Array.from(isGround, (v) => 1 - v));
      // A figure is a shape, not a band of sky or sea: it may be cropped by two sides of the window, not three.
      const sides = figure ? sidesOf(figure, aw, ah) : [];
      if (figure && (areaOf(figure) < 0.05 || areaOf(figure) > 0.8 || edgeContact(figure, aw, ah) > 0.5 || sides.filter((v) => v > 0.25).length > 2)) figure = null;
      // One that runs right across the window (left to right, or top to bottom) is a band of
      // landscape round something, unless nothing else stands out.
      const band = (sides[0] > 0.04 && sides[1] > 0.04) || (sides[2] > 0.04 && sides[3] > 0.04);

      // The brightest, most colorful compact shape that stands out from what surrounds it (a sun, a
      // moon, a lamp): the subject when there is no clear figure, or when the figure is a sprawl
      // (a sun sitting on a ridge) round it.
      let blob: Uint8Array | null = null;
      {
        let best = 0;
        for (let k = 0; k < K; k++) {
          const { lab: cl, size } = components(Uint8Array.from(lab, (v) => (v === k ? 1 : 0)), aw, ah);
          for (let c = 0; c < size.length; c++) {
            if (size[c] < 0.006 * n || size[c] > 0.5 * n) continue;
            const m = Uint8Array.from(cl, (v) => (v === c ? 1 : 0));
            const contact = edgeContact(m, aw, ah);
            if (contact > 0.25) continue;
            // Its color, and that of a ring round it.
            let x0 = aw;
            let y0 = ah;
            let x1 = 0;
            let y1 = 0;
            let vr = 0;
            let vg = 0;
            let vb = 0;
            for (let i = 0; i < n; i++)
              if (m[i]) {
                const x = i % aw;
                const y = (i - x) / aw;
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
                vr += R[i];
                vg += G[i];
                vb += B[i];
              }
            const pad = Math.round((0.05 * S) / sx);
            const ring = new Uint8Array(n);
            for (let y = Math.max(0, y0 - pad); y <= Math.min(ah - 1, y1 + pad); y++)
              for (let x = Math.max(0, x0 - pad); x <= Math.min(aw - 1, x1 + pad); x++) if (!m[y * aw + x]) ring[y * aw + x] = 1;
            const contrast = featDist(meanFeat(m, 1), meanFeat(ring, 1));
            const mx = Math.max(vr, vg, vb) / size[c];
            const sat = mx > 0 ? (mx - Math.min(vr, vg, vb) / size[c]) / mx : 0;
            // Compact: it fills its box rather than snaking across the picture.
            const fill = size[c] / ((x1 - x0 + 1) * (y1 - y0 + 1));
            const score = contrast * (mx + 0.5 * sat) * Math.sqrt(size[c] / n) * fill * (1 - contact) ** 2;
            if (score > best && contrast > 0.12) {
              best = score;
              // With the pieces of the same color right under it (a sun cut by bands of sky), as one shape.
              const whole = m.slice();
              for (let d = 0; d < size.length; d++) {
                if (d === c || size[d] < 0.0015 * n) continue;
                let ux = 0;
                let uy = 0;
                for (let i = 0; i < n; i++) if (cl[i] === d) (ux += i % aw), (uy += Math.floor(i / aw));
                ux /= size[d];
                uy /= size[d];
                if (ux >= x0 && ux <= x1 && uy >= y0 && uy <= y1 + (x1 - x0)) for (let i = 0; i < n; i++) if (cl[i] === d) whole[i] = 1;
              }
              blob = subjectFrom(whole);
            }
          }
        }
      }
      let subject = figure;
      if (!figure || (band && blob)) subject = blob;
      else if (blob && areaOf(blob) > 0.03 && compactOf(blob) > compactOf(figure) + 0.3) {
        // The blob must sit within the figure.
        let inF = 0;
        let all = 0;
        for (let i = 0; i < n; i++) if (blob[i]) (all++, (inF += figure[i]));
        if (inF > 0.8 * all) subject = blob;
      }

      // Cells near a tube already laid, so no two tubes run into each other.
      const mc = 4;
      const mw = Math.ceil(faceW / mc);
      const mh = Math.ceil(faceH / mc);
      const taken = new Uint8Array(mw * mh);
      const keep = 2.2 * W;
      const stamp = (x: number, y: number, rad: number) => {
        const cx = x / mc;
        const cy = y / mc;
        const r = rad / mc;
        for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(mh - 1, Math.ceil(cy + r)); j++)
          for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(mw - 1, Math.ceil(cx + r)); i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) taken[j * mw + i] = 1;
      };
      const isTaken = (x: number, y: number) => taken[Math.min(mh - 1, Math.max(0, Math.floor(y / mc))) * mw + Math.min(mw - 1, Math.max(0, Math.floor(x / mc)))] === 1;
      const lay = (pts: number[], gas: [number, number, number], role: NeonRole, rad = keep) => {
        for (let i = 0; i < pts.length; i += 6) stamp(pts[i], pts[i + 1], rad);
        tubes.push({ pts: Float32Array.from(pts), len: polyLen(pts), gas, border: false, role });
      };

      // One gas per tube: the color of the shape it outlines, from its brighter, more colorful side.
      const blurredRGB = [R, G, B].map((c) => blur(c, aw, ah, boxFor((0.006 * S) / sx)));
      const vividAt = (x: number, y: number, acc: number[]) => {
        const i = cellAt(x, y);
        const cr = blurredRGB[0][i];
        const cg = blurredRGB[1][i];
        const cb = blurredRGB[2][i];
        const mx = Math.max(cr, cg, cb);
        const v = mx > 0 ? (0.3 + (mx - Math.min(cr, cg, cb)) / mx) * mx * mx : 0;
        acc[0] += cr * v;
        acc[1] += cg * v;
        acc[2] += cb * v;
        acc[3] += v;
      };
      const gasOfSides = (r: number[]) => {
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
          vividAt(r[i] - ty * off, r[i + 1] + tx * off, side[0]);
          vividAt(r[i] + ty * off, r[i + 1] - tx * off, side[1]);
        }
        const b = side[0][3] >= side[1][3] ? side[0] : side[1];
        const s = b[3] || 1;
        return neonGasOf(b[0] / s, b[1] / s, b[2] / s) ?? fallback;
      };

      // ---- The silhouette: one long tube round the subject ----
      let outline: number[] | null = null;
      let outlineClosed = false;
      const subjectGrown = new Uint8Array(n);
      let gasMain = fallback;
      if (subject) {
        // Lightly blurred: it follows the subject's own contour (a beak's hook, a crest), not a hull round it.
        const sm = blur(Float32Array.from(subject), aw, ah, boxFor((0.006 * S) / sx));
        const ones = new Float32Array(n).fill(1);
        let longest: Line | null = null;
        let longestLen = 0;
        for (const l of isoLines(sm, ones, aw, ah, 0.5)) {
          const L = polyLen(l.pts);
          if (L > longestLen) (longest = l), (longestLen = L);
        }
        if (longest) {
          const p = resample(toFace(longest.pts), longest.closed, STEP);
          let all = longest.closed;
          for (let i = 0; i < p.length && all; i += 2) all = inside(p[i], p[i + 1]);
          if (all) {
            // A whole shape: simplified to a few long strokes, their corners rounded into broad
            // bends, smoothed further where glass still could not bend it.
            const q = glassBend(smooth(p, true, (0.004 * S) / STEP), true, tol, rMin, rMax, STEP);
            if (polyLen(q) > 0.3 * S) {
              outline = q;
              outlineClosed = true;
            }
            // A round shape (a sun, a moon) is bent as a true circle, from the arc of its upper
            // part, so a sun cut off by bands of sky or a ridge still gets its whole disc.
            const circle = circleOf(p);
            if (circle) {
              const [cx, cy, r] = circle;
              const ring: number[] = [];
              const m = Math.ceil((2 * Math.PI * r) / STEP);
              for (let k = 0; k < m; k++) ring.push(cx + Math.cos((k / m) * 2 * Math.PI) * r, cy + Math.sin((k / m) * 2 * Math.PI) * r);
              if (r > 0.08 * S && r < 0.4 * S && ring.every((v, k) => (k % 2 ? v > art.y + margin && v < art.y + art.h - margin : v > art.x + margin && v < art.x + art.w - margin))) {
                outline = ring;
                outlineClosed = true;
              }
            }
          } else {
            // A cropped subject: the part of its outline inside the window, as one open tube. Where
            // it only grazes the window's edge it is pulled in; where it runs along it, it is cut.
            const N = p.length / 2;
            if (longest.closed) {
              // Started inside the longest stretch along the window's edge, so a brief graze (a
              // beak's tip) never sits at the seam.
              let bi = 0;
              let bl = 0;
              for (let i = 0; i < N; i++) {
                let l = 0;
                while (l < N && !inside(p[((i + l) % N) * 2], p[((i + l) % N) * 2 + 1])) l++;
                if (l > bl) (bl = l), (bi = i + (l >> 1));
                if (l) i += l;
              }
              const rot = p.slice();
              for (let k = 0; k < N; k++) (p[k * 2] = rot[((bi + k) % N) * 2]), (p[k * 2 + 1] = rot[((bi + k) % N) * 2 + 1]);
            }
            {
              const out = new Uint8Array(N);
              for (let i = 0; i < N; i++) out[i] = inside(p[i * 2], p[i * 2 + 1]) ? 0 : 1;
              const brief = Math.round((0.3 * S) / STEP);
              for (let i = 0; i < N; ) {
                if (!out[i]) {
                  i++;
                  continue;
                }
                let j = i;
                while (j < N && out[j]) j++;
                const ends = i > 0 && j < N;
                if (ends && j - i < brief)
                  for (let k = i; k < j; k++) {
                    p[k * 2] = Math.min(art.x + art.w - margin - 1, Math.max(art.x + margin + 1, p[k * 2]));
                    p[k * 2 + 1] = Math.min(art.y + art.h - margin - 1, Math.max(art.y + margin + 1, p[k * 2 + 1]));
                  }
                i = j;
              }
            }
            let s0 = 0;
            if (longest.closed) for (let i = 0; i < N; i++) if (!inside(p[i * 2], p[i * 2 + 1])) { s0 = i; break; }
            const runs: number[][] = [];
            let run: number[] = [];
            for (let k = 0; k < N; k++) {
              const i = (s0 + k) % N;
              if (inside(p[i * 2], p[i * 2 + 1])) run.push(p[i * 2], p[i * 2 + 1]);
              else if (run.length) runs.push(run), (run = []);
            }
            if (run.length) runs.push(run);
            let best: number[] | null = null;
            for (const r0 of runs) {
              if (r0.length < 16) continue;
              // Zigzags calmed, cut where it folds back beside itself (both sides of a slot).
              for (const r of unfold(calm(r0, S, STEP), 2.4 * W, 0.2 * S, STEP)) {
              if (r.length < 16) continue;
              const top = glassBend(r, false, tol, rMin, rMax, STEP);
              // Of the pieces of a cropped outline, the upper one reads as the subject's silhouette
              // (a head and shoulders cut off by the bottom of the window).
              const worth = (q: number[]) => {
                let my = 0;
                for (let i = 1; i < q.length; i += 2) my += q[i];
                return polyLen(q) * (0.6 + 0.8 * (1 - (my / (q.length / 2) - art.y) / art.h));
              };
              if (top && (!best || worth(top) > worth(best))) best = top;
              }
            }
            if (best && polyLen(best) > 0.35 * S) outline = best;
          }
        }
        // The silhouette's gas: the subject's own most vivid color.
        const acc = [0, 0, 0, 0];
        for (let i = 0; i < n; i += 3)
          if (subject[i]) {
            const mx = Math.max(R[i], G[i], B[i]);
            const v = mx > 0 ? (0.3 + (mx - Math.min(R[i], G[i], B[i])) / mx) * mx * mx : 0;
            acc[0] += R[i] * v;
            acc[1] += G[i] * v;
            acc[2] += B[i] * v;
            acc[3] += v;
          }
        if (acc[3] > 0) gasMain = neonGasOf(acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]) ?? fallback;
        // Details are looked for inside the subject (grown a little, so its own edge counts).
        // Details are looked for well inside the subject, clear of its silhouette tube.
        const shrunk = blur(Float32Array.from(subject), aw, ah, boxFor((0.03 * S) / sx));
        for (let i = 0; i < n; i++) subjectGrown[i] = shrunk[i] > 0.75 ? 1 : 0;
      }
      if (outline) {
        let p = outline;
        if (outlineClosed) {
          // Bent from one tube whose two ends meet at its lowest point, where the electrodes are
          // tucked out of sight: opened there with a short gap.
          const N = p.length / 2;
          let lo = 0;
          for (let i = 0; i < N; i++) if (p[i * 2 + 1] > p[lo * 2 + 1]) lo = i;
          const gap = Math.ceil((1.4 * W) / STEP);
          const q: number[] = [];
          for (let k = gap; k < N - gap; k++) {
            const i = (lo + k) % N;
            q.push(p[i * 2], p[i * 2 + 1]);
          }
          p = q;
        }
        lay(p, gasMain, 'outline');
      }

      // ---- Details that mean something ----
      type Cand = { pts: number[]; closed: boolean; score: number; ring?: boolean; eye?: [number, number] };
      const cands: Cand[] = [];
      const inSubject = (x: number, y: number) => !subject || subjectGrown[cellAt(x, y)] === 1;
      // An eye: a small, strongly darker or lighter spot well inside the subject gets a ring with a
      // dot for its pupil. The strongest few spots are tried in turn (the first may be the corner of
      // a larger shape).
      {
        const D = blur(tone, aw, ah, boxFor((0.015 * S) / sx));
        const D2 = blur(tone, aw, ah, boxFor((0.05 * S) / sx));
        const Df = blur(tone, aw, ah, boxFor((0.006 * S) / sx));
        const edge = Math.round((0.1 * S) / sx);
        const nms = Math.max(1, Math.round((0.05 * S) / sx));
        const v = new Float32Array(n);
        for (let y = edge; y < ah - edge; y++)
          for (let x = edge; x < aw - edge; x++) {
            const i = y * aw + x;
            if (!subject || subject[i]) v[i] = Math.abs(D[i] - D2[i]);
          }
        const spots: number[] = [];
        for (let y = edge; y < ah - edge; y++)
          for (let x = edge; x < aw - edge; x++) {
            const i = y * aw + x;
            if (v[i] < 0.07) continue;
            let top = true;
            for (let j = Math.max(0, y - nms); j <= Math.min(ah - 1, y + nms) && top; j++)
              for (let k = Math.max(0, x - nms); k <= Math.min(aw - 1, x + nms) && top; k++) if (v[j * aw + k] > v[i] || (v[j * aw + k] === v[i] && j * aw + k < i)) top = false;
            if (top) spots.push(i);
          }
        spots.sort((p, q) => v[q] - v[p]);
        for (const bi of spots.slice(0, 6)) {
          const cx = ((bi % aw) + ax0 + 0.5) * sx;
          const cy = (Math.floor(bi / aw) + ay0 + 0.5) * sy;
          let br = 0;
          let bg = 0;
          for (let r = 0.018 * S; r <= 0.07 * S; r += 3) {
            let sg = 0;
            for (let k = 0; k < 32; k++) sg += g[cellAt(cx + Math.cos((k / 32) * Math.PI * 2) * r, cy + Math.sin((k / 32) * Math.PI * 2) * r)];
            if (sg / 32 > bg) (bg = sg / 32), (br = r);
          }
          // A spot, not the corner of a larger shape: at some radius it stands out from its
          // surround on every side, and that surround is all subject (an eye sits inside a head).
          const mid = Df[cellAt(cx, cy)];
          let all = false;
          let er = 0;
          for (const rr of [1.6 * br, 0.045 * S, 0.065 * S]) {
            let ok = true;
            for (let k = 0; k < 16 && ok; k++) {
              const a = (k / 16) * Math.PI * 2;
              const x = cx + Math.cos(a) * rr;
              const y = cy + Math.sin(a) * rr;
              ok = Math.abs(Df[cellAt(x, y)] - mid) > 0.07 && (!subject || subject[cellAt(x + Math.cos(a) * rr * 0.6, y + Math.sin(a) * rr * 0.6)] === 1);
            }
            if (ok) {
              all = true;
              er = rr;
              break;
            }
          }
          if (bg < 0.1 || !all) continue;
          // Wide enough for the pupil's dot to sit clear inside it.
          const Rr = Math.max(Math.min(br + 0.5 * W, 0.85 * er + 0.3 * W), 1.9 * W);
          const ring: number[] = [];
          const m = Math.ceil((2 * Math.PI * Rr) / STEP);
          for (let k = 0; k < m; k++) ring.push(cx + Math.cos((k / m) * 2 * Math.PI) * Rr, cy + Math.sin((k / m) * 2 * Math.PI) * Rr);
          let ok = true;
          for (let i = 0; i < ring.length && ok; i += 2) ok = inside(ring[i], ring[i + 1]) && !isTaken(ring[i], ring[i + 1]);
          if (ok) {
            cands.push({ pts: ring, closed: true, score: Infinity, ring: true, eye: [cx, cy] });
            break;
          }
        }
      }
      // Shapes inside the subject and long lines where two colors meet: the outlines of the color
      // regions, kept only where they fall inside the subject.
      const lines: { pts: number[]; closed: boolean; contrast: number }[] = [];
      for (let k = 0; k < K; k++) {
        const m = Float32Array.from(lab, (v) => (v === k ? 1 : 0));
        for (const l of isoLines(blur(m, aw, ah, boxFor((0.012 * S) / sx)), g, aw, ah, 0.5)) {
          if (l.contrast < 0.12) continue;
          const pts = toFace(l.pts);
          if (polyLen(pts) < 0.25 * S) continue;
          lines.push({ pts, closed: l.closed, contrast: l.contrast });
        }
      }
      // Bent like the silhouette: a few long strokes with rounded corners.
      const bend = (q: number[], closed: boolean) =>
        glassBend(smooth(q, closed, (0.008 * S) / STEP), closed, 0.014 * S, rMin, rMax, STEP);
      for (const l of lines) {
        const p = resample(l.pts, l.closed, STEP);
        // A closed shape inside the subject, round enough to read as a shape (a face, a cheek, a sun).
        // A thin one (a stripe, a glint) is neither a shape nor a line.
        if (l.closed) {
          let A = 0;
          for (let i = 0, N = p.length / 2; i < N; i++) {
            const j = (i + 1) % N;
            A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
          }
          const L = polyLen(p);
          if ((4 * Math.PI * Math.abs(A / 2)) / (L * L) < 0.25) continue;
        }
        let whole = l.closed;
        for (let i = 0; i < p.length && whole; i += 2) whole = inside(p[i], p[i + 1]) && inSubject(p[i], p[i + 1]);
        if (whole) {
          const q = bend(p, true);
          const L = polyLen(q);
          let A = 0;
          for (let i = 0, N = q.length / 2; i < N; i++) {
            const j = (i + 1) % N;
            A += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1];
          }
          const compact = (4 * Math.PI * Math.abs(A / 2)) / (L * L);
          const diam = 2 * Math.sqrt(Math.abs(A / 2) / Math.PI);
          if (compact > 0.45 && diam > 0.1 * S && diam < 0.7 * S && !kinked(q, 0.9 * rMin, STEP)) {
            cands.push({ pts: q, closed: true, score: L * l.contrast ** 2 * 2.5 });
            continue;
          }
        }
        // Otherwise only long runs inside the subject count; a short open arc means nothing.
        const N = p.length / 2;
        let run: number[] = [];
        const flush = () => {
          if (run.length / 2 > 8 && polyLen(run) > 0.3 * S)
            for (const r of unkink(bend(run, false), minBend, STEP)) {
              const L = polyLen(r);
              if (L < 0.4 * S) continue;
              // A straight bar (a stripe's edge) is a partial mark, not a drawing.
              const chord = Math.hypot(r[r.length - 2] - r[0], r[r.length - 1] - r[1]);
              if (chord > 0.8 * L && L < 0.8 * S) continue;
              // Nor is a hairpin (both sides of a thin stripe), which folds back along itself.
              const N2 = r.length / 2;
              let fold = Infinity;
              for (let i = 0; i < N2 * 0.4; i += 2) for (let j = Math.ceil(N2 * 0.6); j < N2; j += 2) fold = Math.min(fold, Math.hypot(r[i * 2] - r[j * 2], r[i * 2 + 1] - r[j * 2 + 1]));
              if (fold < 2.5 * W) continue;
              cands.push({ pts: r, closed: false, score: L * l.contrast ** 2 });
            }
          run = [];
        };
        let s0 = 0;
        if (l.closed) for (let i = 0; i < N; i++) if (!(inside(p[i * 2], p[i * 2 + 1]) && inSubject(p[i * 2], p[i * 2 + 1]))) { s0 = i; break; }
        for (let k = 0; k < N; k++) {
          const i = (s0 + k) % N;
          if (inside(p[i * 2], p[i * 2 + 1]) && inSubject(p[i * 2], p[i * 2 + 1])) run.push(p[i * 2], p[i * 2 + 1]);
          else flush();
        }
        flush();
      }
      cands.sort((a, b) => b.score - a.score);
      let details = 0;
      for (const c of cands) {
        if (details >= NEON_MAX_DETAILS) break;
        let p = c.pts;
        if (c.closed) {
          // Its electrodes side by side at its lowest point.
          const N = p.length / 2;
          let lo = 0;
          for (let i = 0; i < N; i++) if (p[i * 2 + 1] > p[lo * 2 + 1]) lo = i;
          const gap = Math.ceil(((c.ring ? 0.9 : 1.3) * W) / STEP);
          const q: number[] = [];
          for (let k = gap; k < N - gap; k++) {
            const i = (lo + k) % N;
            q.push(p[i * 2], p[i * 2 + 1]);
          }
          p = q;
        }
        // Cut where it comes near a tube already laid; keep only its longest piece.
        let best: number[] = [];
        let run: number[] = [];
        for (let i = 0; i < p.length; i += 2) {
          if (isTaken(p[i], p[i + 1])) {
            if (run.length > best.length) best = run;
            run = [];
          } else run.push(p[i], p[i + 1]);
        }
        if (run.length > best.length) best = run;
        const whole = best.length === p.length;
        // A piece of a ring or a shape is no longer that shape; a piece of a line must still be long.
        if (c.closed && !whole) continue;
        const trim = whole ? 0 : Math.ceil((0.6 * W) / STEP) * 2;
        const r = trim && best.length / 2 > trim * 2 + 4 ? best.slice(trim, best.length - trim) : best;
        if (!c.closed && polyLen(r) < 0.4 * S) continue;
        // What is left must still be a drawing, not a straight bar.
        if (!c.closed && Math.hypot(r[r.length - 2] - r[0], r[r.length - 1] - r[1]) > 0.8 * polyLen(r) && polyLen(r) < 0.6 * S) continue;
        if (r.length < 8) continue;
        // A line from one edge of the window to another that encloses nothing with it (a band, a
        // crease) is not a drawing.
        if (!c.closed && edgeToEdge(r) && Math.abs(enclosed(r)) < 0.03 * S * S) continue;
        let gas = gasOfSides(r);
        // An eye ring in the outline's own color would read as part of it: it takes white light.
        if (c.ring && gas.join() === gasMain.join()) gas = NEON_WHITE;
        lay(r, gas, 'detail', c.ring ? 1.6 * W : keep);
        // The pupil: a dot of the same gas, a stub of tube no longer than it is wide.
        if (c.eye) lay(straight(c.eye[0] - 0.2 * W, c.eye[1], c.eye[0] + 0.2 * W, c.eye[1], STEP / 3), gas, 'dot', 0.9 * W);
        details++;
      }

      // ---- Sparse pictures: a few stylised strokes instead of an empty sky ----
      const subjectShare = subject ? areaOf(subject) : 0;
      const lineDetails = tubes.filter((t) => t.role === 'detail' && t.len > 0.4 * S).length;
      // Only round a shape big enough to be the picture's subject (not an eye on a busy picture),
      // and only where it is a light in a darker sky: clearly brighter than the rest.
      let inT = 0;
      let inN = 0;
      let outT = 0;
      for (let i = 0; i < n; i++)
        if (subject && subject[i]) (inT += F[0][i]), inN++;
        else outT += F[0][i];
      const quiet = inN > 0 && inN < n && inT / inN > outT / (n - inN) + 0.25;
      if (outline && outlineClosed && quiet && subjectShare > 0.03 && subjectShare < 0.16 && lineDetails === 0) {
        const p = outline;
        let cx = 0;
        let cy = 0;
        let y0 = Infinity;
        let y1 = -Infinity;
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let i = 0; i < p.length; i += 2) {
          cx += p[i];
          cy += p[i + 1];
          x0 = Math.min(x0, p[i]);
          x1 = Math.max(x1, p[i]);
          y0 = Math.min(y0, p[i + 1]);
          y1 = Math.max(y1, p[i + 1]);
        }
        cx /= p.length / 2;
        cy /= p.length / 2;
        const D = Math.max(x1 - x0, y1 - y0);
        const warm = gasMain[0] > 0.9 && gasMain[2] < 0.3;
        // The horizon (or a ridge, the sea's edge): the strongest long, flat line below the
        // subject's middle.
        let hz: number[] | null = null;
        let hzScore = 0;
        for (const l of lines) {
          if (l.closed) continue;
          const q = resample(l.pts, false, STEP);
          let run: number[] = [];
          const consider = () => {
            if (run.length / 2 >= 8)
              for (const r of unkink(smooth(run, false, (0.04 * S) / STEP), minBend, STEP)) {
                let rx0 = Infinity;
                let rx1 = -Infinity;
                let ry0 = Infinity;
                let ry1 = -Infinity;
                let my = 0;
                for (let i = 0; i < r.length; i += 2) {
                  rx0 = Math.min(rx0, r[i]);
                  rx1 = Math.max(rx1, r[i]);
                  ry0 = Math.min(ry0, r[i + 1]);
                  ry1 = Math.max(ry1, r[i + 1]);
                  my += r[i + 1];
                }
                if (rx1 - rx0 < 0.6 * art.w || ry1 - ry0 > 0.3 * (rx1 - rx0) || my / (r.length / 2) < cy) continue;
                if ((rx1 - rx0) * l.contrast > hzScore) (hzScore = (rx1 - rx0) * l.contrast), (hz = r);
              }
            run = [];
          };
          for (let i = 0; i < q.length; i += 2) {
            if (inside(q[i], q[i + 1])) run.push(q[i], q[i + 1]);
            else consider();
          }
          consider();
        }
        const hyAt = (x: number) => {
          if (!hz) return Infinity;
          let by = Infinity;
          let bd = Infinity;
          for (let i = 0; i < hz.length; i += 2)
            if (Math.abs(hz[i] - x) < bd) (bd = Math.abs(hz[i] - x)), (by = hz[i + 1]);
          return bd < 3 * STEP ? by : Infinity;
        };
        let strokes = 0;
        if (warm) {
          // A sun. Where the horizon crosses its disc it is setting: its circle stops just above
          // the horizon, which runs on underneath.
          let floor = Infinity;
          const sun = tubes.find((t) => t.role === 'outline');
          if (sun && hz) {
            const N = p.length / 2;
            // Cut level: the horizon's highest point under the disc, so the arc ends level.
            let top = Infinity;
            for (let x = x0; x <= x1; x += STEP) top = Math.min(top, hyAt(x));
            const keepPt = Array.from({ length: N }, (_, i) => p[i * 2 + 1] < top - 1.4 * W);
            if (keepPt.some((k) => !k)) {
              let start = keepPt.findIndex((k, i) => k && !keepPt[(i + N - 1) % N]);
              if (start < 0) start = 0;
              const arc: number[] = [];
              for (let k = 0; k < N && keepPt[(start + k) % N]; k++) arc.push(p[((start + k) % N) * 2], p[((start + k) % N) * 2 + 1]);
              if (polyLen(arc) > 0.3 * S) {
                sun.pts = Float32Array.from(arc);
                sun.len = polyLen(arc);
                floor = top;
              }
            }
          }
          // Cut lines across its lower half, as on a retro sunset sign.
          // Spread evenly between its middle and the horizon (or its lower edge), well apart.
          const r = (y1 - y0) / 2;
          const lo = cy + 0.18 * r;
          const hi = Math.min(cy + 0.75 * r, floor - 1.7 * W);
          const count = Math.min(3, Math.floor((hi - lo) / (1.9 * W)) + 1);
          for (let k = 0; k < count && hi >= lo; k++) {
            const y = count > 1 ? lo + ((hi - lo) * k) / (count - 1) : (lo + hi) / 2;
            const span = spanAt(p, y);
            if (!span) continue;
            const a = span[0] + 1.5 * W;
            const b = span[1] - 1.5 * W;
            if (b - a < 2.5 * W) continue;
            lay(straight(a, y, b, y, STEP), gasMain, 'stroke', 1.2 * W);
            strokes++;
          }
          if (floor < Infinity) strokes++;
        } else if (cy < art.y + art.h * 0.6) {
          // A moon (or a lamp) over water: dashes of reflected light under it.
          const water: [number, number, number] = [0.1, 0.86, 1.0];
          let y = y1 + 0.09 * S;
          for (const f of [0.75, 0.5, 0.28]) {
            const half = (f * D) / 2;
            if (!inside(cx - half, y) || !inside(cx + half, y) || y > art.y + art.h - 0.08 * S) break;
            const pts = straight(cx - half, y, cx + half, y, STEP);
            if (pts.some((v, i) => i % 2 === 0 && (isTaken(v, pts[i + 1]) || Math.abs(pts[i + 1] - hyAt(v)) < 2 * W))) break;
            lay(pts, water, 'stroke', 1.6 * W);
            strokes++;
            y += 0.075 * S;
          }
        }
        // The horizon goes in only as part of such a scene, and in one piece.
        if (hz && strokes) {
          const h: number[] = hz;
          let clear = true;
          for (const t of tubes) for (let i = 0; i < t.pts.length && clear; i += 6) clear = Math.abs(t.pts[i + 1] - hyAt(t.pts[i])) > 0.9 * W;
          if (clear) lay(h, gasOfSides(h), 'stroke');
        }
      }
    }
  }

  tubes.length = Math.min(tubes.length, NEON_MAX_TUBES);
  // The border: one tube bent round the art window in the frame, its two ends side by side in a
  // short break near the top right, where its electrodes sit. It frames the sign, so it is drawn
  // dimmer and paler (see neon.ts).
  const room = Math.min(art.x, art.y, faceW - art.x - art.w, faceH - art.y - art.h);
  if (room > 1.6 * W) {
    const o = Math.min(room * 0.42, 0.024 * S);
    const p = roundRect(art.x - o, art.y - o, art.x + art.w + o, art.y + art.h + o, 0.035 * S, STEP);
    const N = p.length / 2;
    const breakAt = Math.floor(N - (0.16 * S) / STEP);
    const gap = Math.ceil((2.4 * W) / STEP);
    const q: number[] = [];
    for (let k = gap; k < N - gap; k++) {
      const i = (breakAt + k) % N;
      q.push(p[i * 2], p[i * 2 + 1]);
    }
    // A color that sets off the picture's tubes.
    const apart = (c: number[]) => Math.min(9, ...tubes.map((t) => Math.hypot(c[0] - t.gas[0], c[1] - t.gas[1], c[2] - t.gas[2])));
    const border = [fallback, NEON_PINK, [0.1, 0.86, 1.0] as [number, number, number]].find((c) => apart(c) > 0.5) ?? fallback;
    tubes.push({ pts: Float32Array.from(q), len: polyLen(q), gas: border, border: true, role: 'border' });
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
  const h2 = 0.065 * S;
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
      const r = 5 * h2;
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
          one[j * w + i] += ds * (0.5 / (2 * h1 * a * Math.sqrt(a)) + 0.45 / (2 * h2 * b * Math.sqrt(b)));
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

/**
 * Where the posts hold each tube, four numbers a post: x, y in face px and the tube's direction
 * there (a unit vector, for the clip across it). Evenly along it, half a gap from each end.
 */
export function neonPosts(d: NeonDesign): number[] {
  const out: number[] = [];
  for (const t of d.tubes) {
    if (t.len < NEON_NO_POST) continue;
    const n = Math.max(1, Math.round(t.len / (t.border ? NEON_BORDER_POST_GAP : NEON_POST_GAP)));
    const p = t.pts;
    let k = 0;
    let s = 0;
    for (let i = 2; i < p.length && k < n; i += 2) {
      const dx = p[i] - p[i - 2];
      const dy = p[i + 1] - p[i - 1];
      const L = Math.hypot(dx, dy);
      while (k < n && ((k + 0.5) * t.len) / n <= s + L) {
        const u = (((k + 0.5) * t.len) / n - s) / (L || 1);
        out.push(p[i - 2] + dx * u, p[i - 1] + dy * u, dx / (L || 1), dy / (L || 1));
        k++;
      }
      s += L;
    }
  }
  return out;
}
