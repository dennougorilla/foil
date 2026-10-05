// Pixel art on raw RGBA, already shrunk to its pixel grid: hard alpha, a small palette (picked from the
// picture by k-means, or FOIL's own), an optional light ordered dither and a one-pixel dark outline.
// No DOM, so the tests run it as is.
import type { Dot } from './model';

export type RGB = [number, number, number];

/** FOIL's own sixteen colours: the board's inks and slates, its paper, step colours and a few skin tones. */
export const FOIL_PALETTE: RGB[] = [
  [0x0d, 0x13, 0x15],
  [0x26, 0x33, 0x3a],
  [0x5a, 0x6e, 0x74],
  [0x9f, 0xb0, 0xb3],
  [0xf3, 0xee, 0xe2],
  [0x6b, 0x3a, 0x2a],
  [0xb8, 0x36, 0x2e],
  [0xff, 0x5a, 0x4f],
  [0xff, 0x8a, 0x3d],
  [0xf2, 0xc1, 0x4e],
  [0xf6, 0xd2, 0xa8],
  [0xc9, 0x8a, 0x5e],
  [0x3f, 0xc2, 0x8f],
  [0x2f, 0x7f, 0xd1],
  [0x6c, 0x43, 0xc9],
  [0xff, 0x6b, 0x8b],
];

/** How far apart two colours look (weighted RGB, squared). */
function dist(r: number, g: number, b: number, c: RGB): number {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return 3 * dr * dr + 4 * dg * dg + 2 * db * db;
}

function nearest(r: number, g: number, b: number, pal: RGB[]): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const d = dist(r, g, b, pal[i]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Shrunk pictures look washed out: a little more colour and contrast, as pixel art has. */
function punch(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
      continue;
    }
    d[i + 3] = 255;
    const y = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    for (let c = 0; c < 3; c++) d[i + c] = (y + (d[i + c] - y) * 1.2 - 128) * 1.06 + 128;
  }
}

/** `k` colours that sum up the picture's opaque pixels: k-means, seeded by k-means++ (deterministic). */
function pickPalette(frames: Uint8ClampedArray[], k: number): RGB[] {
  const total = frames.reduce((n, f) => n + f.length / 4, 0);
  // A few thousand pixels are plenty to find a handful of colours, and keep this to a few milliseconds.
  const step = Math.max(1, Math.floor(total / 3000));
  const px: RGB[] = [];
  let n = 0;
  for (const f of frames)
    for (let i = 0; i < f.length; i += 4, n++) if (n % step === 0 && f[i + 3]) px.push([f[i], f[i + 1], f[i + 2]]);
  if (!px.length) return [[0, 0, 0]];
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const centres: RGB[] = [[...px[Math.floor(rand() * px.length)]]];
  const near = px.map((p) => dist(p[0], p[1], p[2], centres[0]));
  while (centres.length < k) {
    const sum = near.reduce((a, b) => a + b, 0);
    if (!sum) break;
    let r = rand() * sum;
    let j = 0;
    while (j < px.length - 1 && (r -= near[j]) > 0) j++;
    const c: RGB = [...px[j]];
    centres.push(c);
    for (let i = 0; i < px.length; i++) near[i] = Math.min(near[i], dist(px[i][0], px[i][1], px[i][2], c));
  }
  for (let it = 0; it < 8; it++) {
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      const a = acc[nearest(px[i][0], px[i][1], px[i][2], centres)];
      a[0] += px[i][0];
      a[1] += px[i][1];
      a[2] += px[i][2];
      a[3]++;
    }
    acc.forEach((a, j) => {
      if (a[3]) centres[j] = [Math.round(a[0] / a[3]), Math.round(a[1] / a[3]), Math.round(a[2] / a[3])];
    });
  }
  return centres;
}

/** 4 × 4 Bayer matrix, centred on zero (−0.5 … 0.5). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
/** How far the light dither nudges a colour before it is matched (0–255). */
const DITHER = 36;
/** How much lighter a neighbour must be (0–255 luma) for an edge to be outlined. */
const EDGE = 60;

const luma = (d: Uint8ClampedArray, i: number) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;

/** Draws the outline on one frame: the darker side of strong edges and the rim of transparent holes. */
function outline(d: Uint8ClampedArray, w: number, h: number) {
  const src = d.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!src[i + 3]) continue;
      const me = luma(src, i);
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        if (!src[j + 3] || luma(src, j) - me > EDGE) edge = true;
      }
      if (edge) {
        // The pixel's own colour, deep in shadow, leaning to FOIL's ink.
        d[i] = src[i] * 0.28 + 4;
        d[i + 1] = src[i + 1] * 0.28 + 8;
        d[i + 2] = src[i + 2] * 0.28 + 10;
      }
    }
}

/**
 * Turns the frames (same size, RGBA) into pixel art in place, all with one palette: `pal` when given
 * (a moving picture keeps its first frame's), otherwise one picked from them. Returns the palette.
 */
export function dotFrames(frames: Uint8ClampedArray[], w: number, h: number, dot: Dot, pal?: RGB[]): RGB[] {
  for (const f of frames) punch(f);
  pal ??= dot.colors === 'foil' ? FOIL_PALETTE : pickPalette(frames, dot.colors);
  // Matching is cached per 15-bit colour.
  const memo = new Int16Array(32768).fill(-1);
  for (const f of frames) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!f[i + 3]) continue;
        const n = dot.dither ? BAYER[(y & 3) * 4 + (x & 3)] * DITHER : 0;
        const r = Math.min(255, Math.max(0, f[i] + n));
        const g = Math.min(255, Math.max(0, f[i + 1] + n));
        const b = Math.min(255, Math.max(0, f[i + 2] + n));
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        let j = memo[key];
        if (j < 0) j = memo[key] = nearest((r & 248) + 4, (g & 248) + 4, (b & 248) + 4, pal);
        f[i] = pal[j][0];
        f[i + 1] = pal[j][1];
        f[i + 2] = pal[j][2];
      }
    if (dot.outline) outline(f, w, h);
  }
  return pal;
}

/**
 * Pixelate under pixel art: the art window (`inArt`, one flag per pixel of the grid) is averaged in
 * `k` × `k` blocks of the grid before the colours are cut down, so Pixelate's blocks are whole pixels
 * of the pixel art and the outline follows them. Pixels outside the art window are left as they are.
 */
export function pixelateArt(d: Uint8ClampedArray, w: number, h: number, inArt: Uint8Array, k: number): void {
  if (k <= 1) return;
  for (let by = 0; by < h; by += k)
    for (let bx = 0; bx < w; bx += k) {
      const ye = Math.min(by + k, h);
      const xe = Math.min(bx + k, w);
      const sum = [0, 0, 0, 0];
      let n = 0;
      for (let y = by; y < ye; y++)
        for (let x = bx; x < xe; x++) {
          if (!inArt[y * w + x]) continue;
          const i = (y * w + x) * 4;
          for (let c = 0; c < 4; c++) sum[c] += d[i + c];
          n++;
        }
      if (!n) continue;
      for (let y = by; y < ye; y++)
        for (let x = bx; x < xe; x++) {
          if (!inArt[y * w + x]) continue;
          const i = (y * w + x) * 4;
          for (let c = 0; c < 4; c++) d[i + c] = Math.round(sum[c] / n);
        }
    }
}

/**
 * A face shrunk to its pixel grid made pixel art, in place, by area (dot/model.ts DotScope). On the
 * whole card, Pixelate's `block` first runs on the art window (`inArt`). On the frame only, the art
 * window is left exactly as it is (the picture keeps its own pixels, and Pixelate is the shader's
 * there): it is a hole while the rest is converted, so the palette is the frame's and the outline runs
 * round it. Returns the palette.
 */
export function dotGridFace(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  dot: Dot,
  area: { inArt?: Uint8Array; frameOnly: boolean; block: number },
  pal?: RGB[],
): RGB[] {
  const { inArt, frameOnly, block } = area;
  if (!inArt) return dotFrames([d], w, h, dot, pal);
  if (!frameOnly) {
    pixelateArt(d, w, h, inArt, block);
    return dotFrames([d], w, h, dot, pal);
  }
  const art = d.slice();
  for (let i = 0; i < inArt.length; i++) if (inArt[i]) d[i * 4 + 3] = 0;
  pal = dotFrames([d], w, h, dot, pal);
  for (let i = 0; i < inArt.length; i++) if (inArt[i]) d.set(art.subarray(i * 4, i * 4 + 4), i * 4);
  return pal;
}
