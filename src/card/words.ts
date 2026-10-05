// The words a face painter prints (name, type line, message, fine print). Under pixel art they are held
// back instead of printed, so the face is shrunk to pixel art without them and they are printed
// afterwards, crisp, on the pixel art's grid (dot/words.ts; docs/features.md, Card → Pixel art).
// No DOM, so the tests run it as is.
import type { TextField } from '../lettering';

export interface Word {
  text: string;
  /** The font it was laid out in, at `size` face pixels, and how wide it came out. */
  font: string;
  size: number;
  width: number;
  /** Where it was laid out: `x` is its left edge (its right edge with `align` right), `y` its vertical middle. */
  x: number;
  y: number;
  /** Which edge stays put when it is printed again: a centred message keeps its centre. */
  align: 'left' | 'center' | 'right';
  /** Its flat colour; null prints no ink (a blind press: the lettering map only). */
  fill: string | null;
  /** How strongly the ink is laid (the trading card's fine print is faint). */
  alpha: number;
  /** Printed over the picture: an edge of this colour round the letters, over a dark hard drop. */
  edge: string | null;
  /** The piece of text it is, for the lettering map; the fine print is none. */
  part?: TextField;
  /** The name: a face row of bare stock just above it (see TextRun). */
  stock?: number;
  /** A freely placed piece is turned by `rot` radians about (cx, cy). */
  rot?: number;
  cx?: number;
  cy?: number;
}

/** Faces whose words are being held back, and the words so far. */
const held = new WeakMap<object, Word[]>();

/** Holds back the words painted on this context from now on (until takeWords). */
export function holdWords(ctx: object): void {
  held.set(ctx, []);
}

/** The words held back on this context, and stops holding them. */
export function takeWords(ctx: object): Word[] {
  const w = held.get(ctx) ?? [];
  held.delete(ctx);
  return w;
}

/** Holds a word back if its context holds words; true when it did (the painter then prints nothing). */
export function holdWord(ctx: object, w: Word): boolean {
  const list = held.get(ctx);
  if (!list) return false;
  list.push(w);
  return true;
}

