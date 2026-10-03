// What the Relief shader can't see from one pixel, read off the card face whenever it changes:
// which part of the picture is the subject and which is plain backdrop, the subject's flat
// levels, how busy each area is, and the picture's own tonal range. Pure, so it can be tested.

export interface CellRect {
  /** Inclusive start, exclusive end, in cells. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ReliefMap {
  /** RGBA per cell. r: subject (255) or field (0), soft-edged; g: height (flat levels at edges); b: busy texture. */
  data: Uint8Array;
  /** The picture's tonal range (2nd and 98th percentile of luminance), 0..1. */
  lo: number;
  hi: number;
}

/** Flat levels the subject is struck in. */
const LEVELS = 4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Separable box blur with clamped edges (a running sum); `passes` of radius `r` approach a Gaussian. */
function blur(src: Float32Array, w: number, h: number, r: number, passes: number): Float32Array {
  const a = src.slice();
  const b = new Float32Array(a.length);
  const line = new Float32Array(Math.max(w, h) + 2 * r + 1);
  const inv = 1 / (2 * r + 1);
  const pass = (from: Float32Array, to: Float32Array, n: number, lines: number, step: number, stride: number) => {
    for (let l = 0; l < lines; l++) {
      const o = l * stride;
      // Copy the line with its ends repeated, so the running sum needs no bounds checks.
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

export function reliefMap(rgba: ArrayLike<number>, w: number, h: number, art: CellRect): ReliefMap {
  // Everything below works on the art rectangle alone.
  const aw = art.x1 - art.x0;
  const ah = art.y1 - art.y0;
  const n = aw * ah;
  const lum = new Float32Array(n);
  const rgb = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let y = 0; y < ah; y++)
    for (let x = 0; x < aw; x++) {
      const i = y * aw + x;
      const o = ((y + art.y0) * w + x + art.x0) * 4;
      const r = rgba[o] / 255;
      const g = rgba[o + 1] / 255;
      const b = rgba[o + 2] / 255;
      rgb[0][i] = r;
      rgb[1][i] = g;
      rgb[2][i] = b;
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

  // Tonal range.
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.round(lum[i] * 255)]++;
  const percentile = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= q * n) return v / 255;
    return 1;
  };
  const lo = percentile(0.02);
  const hi = percentile(0.98);

  // Busy texture: detail energy averaged over a neighbourhood, fine (dither, grain, hatching) and
  // brushstroke-sized. Fine detail calms the shader's grooves; both tell backdrop from texture.
  const near = blur(lum, aw, ah, 1, 1);
  const mid = blur(lum, aw, ah, 2, 2);
  const wide = blur(mid, aw, ah, 4, 1);
  const fine = new Float32Array(n);
  const coarse = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    fine[i] = Math.abs(lum[i] - near[i]);
    coarse[i] = Math.abs(mid[i] - wide[i]);
  }
  const fineAvg = blur(fine, aw, ah, 4, 2);
  const coarseAvg = blur(coarse, aw, ah, 3, 1);
  const busy = new Float32Array(n);
  // Cells the backdrop may not cross: clearly busy right where they are (line work, foam).
  const rough = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    busy[i] = smoothstep(0.01, 0.05, fineAvg[i]);
    rough[i] = fine[i] > 0.06 || coarse[i] > 0.03 ? 1 : 0;
  }

  // Backdrop: flood in from the top and the upper sides wherever the colour drifts only slowly
  // and nothing busy stands in the way, so it stops right at an outline. The bottom is left out,
  // since that is where subjects usually stand.
  const [sr, sg, sb] = rgb.map((c) => blur(c, aw, ah, 2, 2));
  const dist2 = (i: number, j: number) => (sr[i] - sr[j]) ** 2 + (sg[i] - sg[j]) ** 2 + (sb[i] - sb[j]) ** 2;
  const seedOf = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let tail = 0;
  const visit = (j: number, from: number) => {
    if (seedOf[j] >= 0 || rough[j]) return;
    if (from >= 0 && (dist2(from, j) > 0.03 ** 2 || dist2(seedOf[from], j) > 0.25 ** 2)) return;
    seedOf[j] = from >= 0 ? seedOf[from] : j;
    queue[tail++] = j;
  };
  for (let x = 0; x < aw; x++) visit(x, -1);
  for (let y = 0; y < ah * 0.6; y++) {
    visit(y * aw, -1);
    visit(y * aw + aw - 1, -1);
  }
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % aw;
    if (x + 1 < aw) visit(i + 1, i);
    if (x > 0) visit(i - 1, i);
    if (i + aw < n) visit(i + aw, i);
    if (i >= aw) visit(i - aw, i);
  }
  const flooded = new Uint8Array(n);
  for (let k = 0; k < tail; k++) flooded[queue[k]] = 1;

  // Connected areas of one kind, each passed to `keep` with its cells; dropped ones flip kind.
  const regions = (kind: Uint8Array, value: number, keep: (cells: Int32Array, touchesBottom: boolean) => boolean) => {
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (seen[s] || kind[s] !== value) continue;
      let size = 0;
      let bottom = false;
      seen[s] = 1;
      queue[size++] = s;
      for (let head = 0; head < size; head++) {
        const i = queue[head];
        const x = i % aw;
        if (i >= n - aw) bottom = true;
        const step = (j: number) => {
          if (seen[j] || kind[j] !== value) return;
          seen[j] = 1;
          queue[size++] = j;
        };
        if (x + 1 < aw) step(i + 1);
        if (x > 0) step(i - 1);
        if (i + aw < n) step(i + aw);
        if (i >= aw) step(i - aw);
      }
      const cells = queue.slice(0, size);
      if (!keep(cells, bottom)) for (const i of cells) kind[i] = 1 - value;
    }
  };
  // A backdrop is plain: an area that turns out to be texture on average (brushwork, noise)
  // belongs to the picture.
  regions(flooded, 1, (cells) => {
    let c = 0;
    let f = 0;
    for (const i of cells) {
      c += coarseAvg[i];
      f += fineAvg[i];
    }
    return c / cells.length <= 0.006 && f / cells.length <= 0.025;
  });
  // Small islands of subject inside the backdrop (stars, a bird) join the field, keeping only
  // their engraved lines; a subject that stands on the bottom edge always stays.
  regions(flooded, 0, (cells, bottom) => bottom || cells.length >= n * 0.03);
  const field = new Float32Array(n);
  let fieldCells = 0;
  for (let i = 0; i < n; i++) if (flooded[i]) {
    field[i] = 1;
    fieldCells++;
  }
  // A sliver of backdrop is noise, not a field; then the whole picture is subject.
  if (fieldCells < n * 0.12) field.fill(0);
  // Specks drop out and the edge softens over a few cells: the step the subject is raised by.
  const fieldSoft = blur(field, aw, ah, 2, 2);

  // Flat levels: the calmed tone in the picture's own range, cut into a few bands, with stray
  // single cells voted back into their neighbours. They only step where the picture has an edge;
  // across soft shading (a cheek, a sky) the height follows the tone smoothly, so no crease
  // appears where a band boundary happens to fall.
  // Busy areas (dither, grain) are read through a wider blur, so their pattern never becomes steps.
  const toneNear = blur(lum, aw, ah, 1, 2);
  const toneWide = blur(lum, aw, ah, 3, 2);
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i++) tone[i] = toneNear[i] + (toneWide[i] - toneNear[i]) * busy[i];
  const span = Math.max(hi - lo, 0.3);
  let level = new Uint8Array(n);
  for (let i = 0; i < n; i++) level[i] = Math.min(LEVELS - 1, Math.floor(clamp01((tone[i] - lo) / span) * LEVELS));
  const votes = new Uint8Array(LEVELS);
  for (let k = 0; k < 2; k++) {
    const next = level.slice();
    for (let y = 1; y < ah - 1; y++)
      for (let x = 1; x < aw - 1; x++) {
        const i = y * aw + x;
        votes.fill(0);
        for (let d = -aw; d <= aw; d += aw) {
          votes[level[i + d - 1]]++;
          votes[level[i + d]]++;
          votes[level[i + d + 1]]++;
        }
        let best = level[i];
        for (let v = 0; v < LEVELS; v++) if (votes[v] > votes[best]) best = v;
        next[i] = best;
      }
    level = next;
  }

  const slope = new Float32Array(n);
  for (let y = 1; y < ah - 1; y++)
    for (let x = 1; x < aw - 1; x++) {
      const i = y * aw + x;
      slope[i] = Math.max(Math.abs(tone[i + 1] - tone[i - 1]), Math.abs(tone[i + aw] - tone[i - aw])) / (2 * span);
    }
  // Reach a couple of cells either side of the edge, so a band boundary beside it steps cleanly.
  const edge = blur(slope, aw, ah, 2, 1);
  const height = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = smoothstep(0.02, 0.06, edge[i]);
    height[i] = k * (level[i] / (LEVELS - 1)) + (1 - k) * clamp01((tone[i] - lo) / span);
  }

  // Cells outside the art rectangle copy its nearest edge, so the art window's border (and its
  // inner shade) continue what lies just inside.
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = Math.min(ah - 1, Math.max(0, y - art.y0)) * aw + Math.min(aw - 1, Math.max(0, x - art.x0));
      const o = (y * w + x) * 4;
      data[o] = Math.round(smoothstep(0.35, 0.65, 1 - fieldSoft[i]) * 255);
      data[o + 1] = Math.round(height[i] * 255);
      data[o + 2] = Math.round(busy[i] * 255);
      data[o + 3] = 255;
    }
  return { data, lo, hi };
}
