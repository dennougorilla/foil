// Words under pixel art (docs/features.md, Card → Pixel art): how big their dots are, where they sit on
// the pixel art's grid, and the letters inked on raw dots. dot/words.ts prints them on the face.
// No DOM, so the tests run it as is.

/** The pixel typeface (DotGothic16) is drawn on 16 dots to the em; its letters are taken at 16px, one dot a pixel. */
export const EM_DOTS = 16;
/** Dots of room round the letters: the edge, the drop under it, and a bold letter's extra dot. */
export const PAD = 2;
/** How much of a dot the typeface must cover for it to be inked (its letters come a little soft at 16px). */
const COVER = 110;

/**
 * One dot of the letters in face pixels, on a grid of `cell`-pixel squares: the largest that keeps the
 * letters no bigger than `em`, of two kinds that keep them on the grid — the grid's pixel split evenly
 * into dots (or a whole number of grid pixels to a dot), so every edge of a grid pixel is an edge
 * between dots; or letters a whole number of grid pixels tall (16 dots to that many pixels).
 */
export function glyphDot(em: number, cell: number): number {
  const d = em / EM_DOTS;
  const split = d >= cell ? Math.floor(d / cell + 1e-6) * cell : cell / Math.ceil(cell / d - 1e-6);
  const whole = (Math.floor(em / cell + 1e-6) * cell) / EM_DOTS;
  return Math.max(split, whole);
}

/** What a word's corner snaps to: its dots when they split the grid's pixels evenly, else the grid's pixels. */
export function snapStep(dot: number, cell: number): number {
  const k = cell / dot;
  return Math.abs(k - Math.round(k)) < 1e-6 ? dot : cell;
}

/** `v` moved onto the nearest line of a grid of `step` (from the face's corner, as the pixel art's grid is). */
export const snap = (v: number, step: number) => Math.round(v / step) * step;

/** The dots a typeface's letters cover, from its drawing's alpha (RGBA, w × h). */
export function coverOf(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = rgba[i * 4 + 3] >= COVER ? 1 : 0;
  return on;
}

export type RGBA = [number, number, number, number];

export interface Ink {
  /** The letters' colour, or null for no ink (a blind press). */
  fill: RGBA | null;
  /** Over the picture: an edge one dot wide round the letters, over a hard drop one dot under it. */
  edge: RGBA | null;
  drop: RGBA | null;
  /** A bold face: every stroke a dot wider to the right. */
  bold: boolean;
}

/** `on` grown by one dot to all eight sides. */
function grow(on: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(on.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on[y * w + x]) continue;
      for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++)
        for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + 1); i++) out[j * w + i] = 1;
    }
  return out;
}

/**
 * Letters on dots: the covered dots (`cover`, w × h) made bold if asked, then inked as RGBA — the drop,
 * the edge and the letters, each over the last. Returns the picture and the letters' own dots (what
 * the lettering map presses, foils or varnishes).
 */
export function inkDots(cover: Uint8Array, w: number, h: number, ink: Ink): { rgba: Uint8ClampedArray; glyph: Uint8Array } {
  const glyph = cover.slice();
  if (ink.bold) for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) if (cover[y * w + x - 1]) glyph[y * w + x] = 1;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const put = (on: Uint8Array, c: RGBA | null, dy = 0) => {
    if (!c) return;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const from = y - dy;
        if (from >= 0 && from < h && on[from * w + x]) rgba.set(c, (y * w + x) * 4);
      }
  };
  if (ink.edge || ink.drop) {
    const round = grow(glyph, w, h);
    put(round, ink.drop, 1);
    put(round, ink.edge);
  }
  put(glyph, ink.fill);
  return { rgba, glyph };
}
