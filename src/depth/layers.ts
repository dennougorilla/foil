// Turns a depth estimate into the paper sheets of the Shadowbox finish. Pure functions with no
// imports, so they run in the page, in the depth worker and under Node's test runner alike.

/** A single-channel image. */
export interface Gray {
  w: number;
  h: number;
  data: Float32Array;
}

/**
 * The sheets over the art window, as an RGBA texture: r, g and b are the cut sheets from the
 * front back (255 where the sheet stands, softened by a pixel at its edge), a is the depth
 * (255 = nearest). Everything else lies on the whole back sheet.
 */
export interface LayerMap {
  w: number;
  h: number;
  /** How many cut sheets stand in front of the back one (0 to 3). */
  cuts: number;
  data: Uint8ClampedArray;
  /**
   * The picture with the cut-out subjects painted out: what the back sheet shows where a tilt
   * uncovers the space behind them, instead of a second copy of the subject. Its alpha is the
   * depth, painted out the same way, which the back sheet uses as gentle relief.
   */
  plate: Uint8ClampedArray;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const luma = (r: number, g: number, b: number) => r * 0.299 + g * 0.587 + b * 0.114;

/** Stretches the 2nd to 98th percentile to 0..1 (in place), so stray extremes don't flatten the rest. */
export function normalizeDepth(d: Float32Array, lo = 0.02, hi = 0.98): Float32Array {
  const sorted = Float32Array.from(d).sort();
  const a = sorted[Math.floor((sorted.length - 1) * lo)];
  const b = sorted[Math.ceil((sorted.length - 1) * hi)];
  const span = b - a;
  for (let i = 0; i < d.length; i++) d[i] = span > 1e-9 ? clamp01((d[i] - a) / span) : 0.5;
  return d;
}

/** Bilinear resample. */
export function resample(src: Gray, w: number, h: number): Gray {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.h - 1, Math.max(0, ((y + 0.5) * src.h) / h - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(src.h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.w - 1, Math.max(0, ((x + 0.5) * src.w) / w - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(src.w - 1, x0 + 1);
      const fx = sx - x0;
      const top = src.data[y0 * src.w + x0] * (1 - fx) + src.data[y0 * src.w + x1] * fx;
      const bot = src.data[y1 * src.w + x0] * (1 - fx) + src.data[y1 * src.w + x1] * fx;
      out[y * w + x] = top * (1 - fy) + bot * fy;
    }
  }
  return { w, h, data: out };
}

/** Mean over a (2r+1)² window, shrinking the window at the borders. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/**
 * Edge-preserving smoothing of `src` steered by `guide` (He et al.'s guided filter): flat where
 * the guide is flat, and its steps line up with the guide's edges.
 */
export function guidedFilter(guide: Gray, src: Gray, r: number, eps: number): Gray {
  const { w, h } = guide;
  const n = w * h;
  const I = guide.data;
  const p = src.data;
  const ii = new Float32Array(n);
  const ip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ii[i] = I[i] * I[i];
    ip[i] = I[i] * p[i];
  }
  const mI = boxBlur(I, w, h, r);
  const mP = boxBlur(p, w, h, r);
  const mII = boxBlur(ii, w, h, r);
  const mIP = boxBlur(ip, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i];
    a[i] = (mIP[i] - mI[i] * mP[i]) / (varI + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = boxBlur(a, w, h, r);
  const mB = boxBlur(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = mA[i] * I[i] + mB[i];
  return { w, h, data: out };
}

/**
 * Cuts for `classes` groups of values in 0..1 that are as tight as possible (Otsu's method,
 * searched exhaustively). Ascending. A cut that lands on the edge of an empty stretch moves to
 * its middle, so it falls in the valley rather than against one of the groups.
 */
export function multiOtsu(values: Float32Array, classes: number, bins = 64): number[] {
  const hist = new Float64Array(bins);
  for (let i = 0; i < values.length; i++) hist[Math.min(bins - 1, Math.max(0, Math.floor(values[i] * bins)))]++;
  const P = new Float64Array(bins + 1);
  const S = new Float64Array(bins + 1);
  for (let i = 0; i < bins; i++) {
    P[i + 1] = P[i] + hist[i];
    S[i + 1] = S[i] + hist[i] * (i + 0.5);
  }
  // Between-class score of bins [a, b): sum² / count.
  const part = (a: number, b: number) => {
    const p = P[b] - P[a];
    return p > 0 ? ((S[b] - S[a]) * (S[b] - S[a])) / p : 0;
  };
  let best = -1;
  let cut: number[] = [];
  const k = classes - 1;
  const search = (from: number, chosen: number[], score: number) => {
    if (chosen.length === k) {
      const total = score + part(chosen[k - 1], bins);
      if (total > best + 1e-9) {
        best = total;
        cut = chosen.slice();
      }
      return;
    }
    const prev = chosen.length ? chosen[chosen.length - 1] : 0;
    for (let t = from; t <= bins - (k - chosen.length); t++) search(t + 1, [...chosen, t], score + part(prev, t));
  };
  search(1, [], 0);
  return cut.map((t) => {
    let lo = t;
    let hi = t;
    while (lo > 1 && hist[lo - 1] === 0) lo--;
    while (hi < bins - 1 && hist[hi] === 0) hi++;
    return (lo + hi) / 2 / bins;
  });
}

/**
 * Drops pieces smaller than `minArea` and fills enclosed holes smaller than it (in place).
 * One flood fill per 4-connected run, on typed buffers.
 */
export function cleanMask(mask: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const n = w * h;
  const seen = new Uint8Array(n);
  const run = new Int32Array(n);
  for (const value of [1, 0]) {
    seen.fill(0);
    for (let start = 0; start < n; start++) {
      if (seen[start] || mask[start] !== value) continue;
      // `run` doubles as the stack: [0, len) is everything found, [head, len) still to visit.
      let len = 0;
      let head = 0;
      let edge = false;
      run[len++] = start;
      seen[start] = 1;
      while (head < len) {
        const i = run[head++];
        const x = i % w;
        if (x === 0 || x === w - 1 || i < w || i >= n - w) edge = true;
        if (x > 0 && !seen[i - 1] && mask[i - 1] === value) (seen[i - 1] = 1), (run[len++] = i - 1);
        if (x < w - 1 && !seen[i + 1] && mask[i + 1] === value) (seen[i + 1] = 1), (run[len++] = i + 1);
        if (i >= w && !seen[i - w] && mask[i - w] === value) (seen[i - w] = 1), (run[len++] = i - w);
        if (i < n - w && !seen[i + w] && mask[i + w] === value) (seen[i + w] = 1), (run[len++] = i + w);
      }
      // Pieces go when small; holes are filled only when small and enclosed.
      if (len < minArea && (value === 1 || !edge)) for (let j = 0; j < len; j++) mask[run[j]] = 1 - value;
    }
  }
  return mask;
}

/**
 * Cut heights that follow real depth edges. A cut is kept only when nearly all of its outline runs
 * along a steep step in depth (a silhouette), never across a smooth slope such as a face turning
 * away; cuts tracing the same outline count once. A picture with no such edge (a plain
 * landscape) is left uncut: its slopes become the back sheet's relief. Ascending, at most three.
 */
export function edgeCuts(depth: Gray, maxCuts = 3): number[] {
  const { w, h, data: d } = depth;
  const n = w * h;
  const grad = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = (d[y * w + Math.min(w - 1, x + 1)] - d[y * w + Math.max(0, x - 1)]) / 2;
      const gy = (d[Math.min(h - 1, y + 1) * w + x] - d[Math.max(0, y - 1) * w + x]) / 2;
      grad[i] = Math.sqrt(gx * gx + gy * gy);
    }
  // Depth change per pixel that counts as a step rather than a slope.
  const STEP = 0.02;
  const levels: { t: number; area: number; strong: number; count: number; step: number }[] = [];
  for (let t = 0.04; t < 0.97; t += 0.02) {
    let above = 0;
    let count = 0;
    let strong = 0;
    const steps: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const a = d[i] >= t;
        if (a) above++;
        const pair = (j: number) => {
          if ((d[j] >= t) === a) return;
          count++;
          const g = Math.max(grad[i], grad[j]);
          steps.push(g);
          if (g > STEP) strong++;
        };
        if (x < w - 1) pair(i + 1);
        if (y < h - 1) pair(i + w);
      }
    // How steep the outline is along its weakest stretch.
    steps.sort((a, b) => a - b);
    levels.push({ t, area: above / n, strong: count ? strong / count : 0, count, step: count ? steps[Math.floor(count * 0.1)] : 0 });
  }
  const fits = levels.filter((l) => l.area > 0.015 && l.area < 0.92 && l.count >= 30 && l.strong >= 0.86);
  // Cleanest outlines first; the cleanest sets the scale, and an outline with a much fainter
  // stretch (a patch of wall that is a touch nearer) is not worth a sheet of its own.
  fits.sort((a, b) => b.step - a.step || b.count - a.count);
  const picked: { t: number; area: number }[] = [];
  const steepest = fits.length ? fits[0].step : 0;
  for (const l of fits) {
    if (picked.length >= maxCuts) break;
    if (l.step < steepest * 0.5) continue;
    if (picked.some((p) => Math.abs(p.area - l.area) < 0.04)) continue;
    // Several heights trace the same outline; take the middle one, halfway up the step.
    const same = fits.filter((o) => Math.abs(o.area - l.area) < 0.01).map((o) => o.t);
    picked.push({ t: (Math.min(...same) + Math.max(...same)) / 2, area: l.area });
  }
  return picked.map((p) => p.t).sort((a, b) => a - b);
}

/**
 * Fills the pixels marked in `hole` from what surrounds them (pull-push: average down to coarse
 * levels counting only known pixels, then blend back up), so a removed subject leaves a soft
 * continuation of its background. Known pixels are kept as they are.
 */
export function inpaint(rgba: Uint8ClampedArray, w: number, h: number, hole: Uint8Array): Uint8ClampedArray {
  type Level = { w: number; h: number; c: Float32Array; a: Float32Array };
  const base: Level = { w, h, c: new Float32Array(w * h * 3), a: new Float32Array(w * h) };
  for (let i = 0; i < w * h; i++) {
    const k = hole[i] ? 0 : 1;
    base.a[i] = k;
    for (let ch = 0; ch < 3; ch++) base.c[i * 3 + ch] = rgba[i * 4 + ch] * k;
  }
  // Pull: each coarser pixel holds the mean of its known children, weighted up to 1.
  const levels: Level[] = [base];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const f = levels[levels.length - 1];
    const cw = Math.ceil(f.w / 2);
    const chh = Math.ceil(f.h / 2);
    const l: Level = { w: cw, h: chh, c: new Float32Array(cw * chh * 3), a: new Float32Array(cw * chh) };
    for (let y = 0; y < chh; y++)
      for (let x = 0; x < cw; x++) {
        let a = 0;
        const c = [0, 0, 0];
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const fx = Math.min(f.w - 1, x * 2 + dx);
            const fy = Math.min(f.h - 1, y * 2 + dy);
            const j = fy * f.w + fx;
            a += f.a[j];
            for (let ch = 0; ch < 3; ch++) c[ch] += f.c[j * 3 + ch];
          }
        const i = y * cw + x;
        const k = a > 0 ? Math.min(1, a) / a : 0;
        l.a[i] = Math.min(1, a);
        for (let ch = 0; ch < 3; ch++) l.c[i * 3 + ch] = c[ch] * k;
      }
    levels.push(l);
  }
  // Push: from the top down, each pixel tops up its missing weight from the level above.
  let up = Float32Array.from(levels[levels.length - 1].c);
  for (let li = levels.length - 2; li >= 0; li--) {
    const l = levels[li];
    const p = levels[li + 1];
    const out = new Float32Array(l.w * l.h * 3);
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) {
        const i = y * l.w + x;
        // Bilinear look into the coarser level, so the fill has no blocks.
        const sx = Math.min(p.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const sy = Math.min(p.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = Math.min(p.w - 1, x0 + 1);
        const y1 = Math.min(p.h - 1, y0 + 1);
        const tx = sx - x0;
        const ty = sy - y0;
        for (let ch = 0; ch < 3; ch++) {
          const top = up[(y0 * p.w + x0) * 3 + ch] * (1 - tx) + up[(y0 * p.w + x1) * 3 + ch] * tx;
          const bot = up[(y1 * p.w + x0) * 3 + ch] * (1 - tx) + up[(y1 * p.w + x1) * 3 + ch] * tx;
          out[i * 3 + ch] = l.c[i * 3 + ch] + (1 - l.a[i]) * (top * (1 - ty) + bot * ty);
        }
      }
    up = out;
  }
  const plate = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    for (let ch = 0; ch < 3; ch++) plate[i * 4 + ch] = hole[i] ? up[i * 3 + ch] : rgba[i * 4 + ch];
    plate[i * 4 + 3] = 255;
  }
  return plate;
}

export interface LayerOptions {
  /** Cut sheets in front of the back one. */
  cuts: number;
  /** Fixed cut heights (ascending); found from the depth's own clusters when left out. */
  thresholds?: number[];
}

/**
 * Cuts the sheets out of a depth map (0..1, 1 = nearest) and packs them for the shader, with the
 * picture (`rgba`, same size) painted out behind them.
 */
export function buildLayers(depth: Gray, opts: LayerOptions, rgba: Uint8ClampedArray): LayerMap {
  const { w, h } = depth;
  const n = w * h;
  const t = (opts.thresholds ?? multiOtsu(depth.data, opts.cuts + 1)).slice(-opts.cuts);
  const minArea = Math.max(12, Math.round(n * 0.004));
  const data = new Uint8ClampedArray(n * 4);
  // Front sheet first: it is cut at the highest level.
  for (let k = 0; k < t.length; k++) {
    const level = t[t.length - 1 - k];
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = depth.data[i] >= level ? 1 : 0;
    cleanMask(m, w, h, minArea);
    const soft = new Float32Array(n);
    for (let i = 0; i < n; i++) soft[i] = m[i];
    const blurred = boxBlur(boxBlur(soft, w, h, 1), w, h, 1);
    for (let i = 0; i < n; i++) data[i * 4 + k] = Math.round(blurred[i] * 255);
  }
  // A sheet always stands wherever the one in front of it does.
  for (let k = 1; k < t.length; k++) for (let i = 0; i < n; i++) data[i * 4 + k] = Math.max(data[i * 4 + k], data[i * 4 + k - 1]);
  for (let i = 0; i < n; i++) data[i * 4 + 3] = Math.round(clamp01(depth.data[i]) * 255);
  // Behind everything that was cut out, widened a little so no edge colour is left behind.
  const hole = new Uint8Array(n);
  if (t.length) {
    const last = t.length - 1;
    // Wide enough that no rim of the subject is left on the back sheet to echo its outline.
    const r = Math.max(2, Math.round(w / 70));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + last] < 8) continue;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h) hole[yy * w + xx] = 1;
          }
      }
  }
  // The plate's alpha is the depth with the cut sheets painted out too: the back sheet's relief.
  const plate = inpaint(rgba, w, h, hole);
  const deep = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) deep[i * 4] = data[i * 4 + 3];
  const back = inpaint(deep, w, h, hole);
  for (let i = 0; i < n; i++) plate[i * 4 + 3] = back[i * 4];
  return { w, h, cuts: t.length, data, plate };
}

/** Luminance of an RGBA image, 0..1, as the guide for edge snapping. */
export function lumaOf(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = luma(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) / 255;
  return { w, h, data };
}

/**
 * A depth guess from colour alone, for when the depth model is still loading or can't run:
 * what stands out from the picture's surroundings comes forward, more so in the middle and low
 * in the frame. A white glare in a bright sky counts as light, not as a thing.
 */
export function colorDepth(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const n = w * h;
  const ch = [0, 1, 2].map((c) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = rgba[i * 4 + c] / 255;
    return boxBlur(a, w, h, Math.max(1, Math.round(w / 40)));
  });
  const at = (u: number, v: number) => {
    const i = Math.min(h - 1, Math.round(v * (h - 1))) * w + Math.min(w - 1, Math.round(u * (w - 1)));
    return [ch[0][i], ch[1][i], ch[2][i]];
  };
  // The surroundings: top and sides (the bottom is where ground and bodies stand), letting the
  // majority win over samples that land on the subject.
  const ring = [[0.08, 0.06], [0.5, 0.05], [0.92, 0.06], [0.06, 0.3], [0.94, 0.3], [0.06, 0.58], [0.94, 0.58]].map(([u, v]) => at(u, v));
  const mean = [0, 1, 2].map((c) => ring.reduce((s, p) => s + p[c], 0) / ring.length);
  let wsum = 0;
  const bg = [0, 0, 0];
  for (const p of ring) {
    const wgt = 1 / (0.02 + (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2);
    wsum += wgt;
    for (let c = 0; c < 3; c++) bg[c] += p[c] * wgt;
  }
  for (let c = 0; c < 3; c++) bg[c] /= wsum;
  const top = [0, 1, 2].map((c) => (ring[0][c] + ring[2][c]) / 2);
  const bgL = luma(bg[0], bg[1], bg[2]);
  // In a bright scene a difference in brightness alone is mostly light; colour tells things apart.
  const lightK = 1.1 + (0.5 - 1.1) * smooth(0.45, 0.75, bgL);
  const dist = (r: number, g: number, b: number, to: number[]) => {
    const dr = r - to[0];
    const dg = g - to[1];
    const db = b - to[2];
    const l = luma(dr, dg, db);
    return Math.sqrt((dr - l) ** 2 + (dg - l) ** 2 + (db - l) ** 2) + Math.abs(l) * lightK;
  };
  const near = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = ch[0][i];
      const g = ch[1][i];
      const b = ch[2][i];
      const l = luma(r, g, b);
      let stand = smooth(0.04, 0.5, Math.min(dist(r, g, b, bg), dist(r, g, b, top) * 1.15));
      const chroma = Math.sqrt((r - l) ** 2 + (g - l) ** 2 + (b - l) ** 2);
      stand *= 1 - smooth(0.8, 0.94, l) * smooth(0.45, 0.7, bgL) * (1 - smooth(0.06, 0.18, chroma));
      const rx = (x + 0.5) / w - 0.5;
      const ry = (y + 0.5) / h - 0.5;
      const centre = 1 - smooth(0.1, 0.65, Math.sqrt(rx * rx + ry * ry * 0.64));
      const ground = smooth(-0.2, 0.5, ry);
      near[i] = clamp01(stand * (0.64 + 0.28 * centre + 0.22 * ground));
    }
  // A blurrier second look closes small holes (eyes, mouths, folds).
  const wide = boxBlur(near, w, h, Math.max(2, Math.round(w / 16)));
  for (let i = 0; i < n; i++) near[i] = Math.max(near[i], wide[i] * 1.12 - 0.05);
  return { w, h, data: near };
}

/** Sheets from colour alone: the fallback. */
export function colorLayers(rgba: Uint8ClampedArray, w: number, h: number): LayerMap {
  const guide = lumaOf(rgba, w, h);
  const depth = guidedFilter(guide, colorDepth(rgba, w, h), Math.max(2, Math.round(w / 60)), 2e-3);
  return buildLayers(depth, { cuts: 2, thresholds: [0.25, 0.66] }, rgba);
}

/** Sheets from the depth model's output (`raw`, nearer = larger), fitted to the picture's edges. */
export function modelLayers(raw: Gray, rgba: Uint8ClampedArray, w: number, h: number): LayerMap {
  const depth = resample(raw, w, h);
  normalizeDepth(depth.data);
  const snapped = guidedFilter(lumaOf(rgba, w, h), depth, Math.max(2, Math.round(w / 80)), 1e-3);
  for (let i = 0; i < snapped.data.length; i++) snapped.data[i] = clamp01(snapped.data[i]);
  const thresholds = edgeCuts(snapped);
  return buildLayers(snapped, { cuts: thresholds.length, thresholds }, rgba);
}
