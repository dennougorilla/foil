// Prints the words a face held back (card/words.ts) onto it once it is pixel art: in the pixel typeface,
// crisp, their dots on the pixel art's grid, at about the size they were laid out at, in their own
// colours, the message with its edge and hard drop (docs/features.md, Card → Pixel art).
import type { Word } from '../card/words';
import { turnFor, type TextRun } from '../lettering';
import { gridOf } from './model';
import { coverOf, EM_DOTS, glyphDot, inkDots, PAD, snap, snapStep, type RGBA } from './wordGrid';

const OUTLINE = '#161c1f';
const FONT = `${EM_DOTS}px "DotGothic16", monospace`;
const scratch = document.createElement('canvas');
const sx = scratch.getContext('2d', { willReadFrequently: true })!;

/** A CSS colour as RGBA bytes, at `alpha`. */
function rgba(css: string, alpha = 1): RGBA {
  scratch.width = scratch.height = 1;
  sx.clearRect(0, 0, 1, 1);
  sx.fillStyle = css;
  sx.fillRect(0, 0, 1, 1);
  const d = sx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], Math.round(d[3] * alpha)];
}

/** Dots as a canvas, one pixel a dot. */
function canvasOf(data: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c;
}

/**
 * Prints `words` on a face that is pixel art of `size` pixels across its short side; returns their
 * lines for the lettering map, which presses, foils or varnishes the letters as printed.
 */
export function printWords(face: HTMLCanvasElement, words: Word[], size: number): TextRun[] {
  const g = gridOf(face.width, face.height, size);
  const cw = face.width / g.w;
  const ch = face.height / g.h;
  const fx = face.getContext('2d')!;
  const runs: TextRun[] = [];
  for (const w of words) {
    sx.font = FONT;
    const tw = Math.max(1, Math.ceil(sx.measureText(w.text).width));
    const bold = parseInt(w.font, 10) >= 700;
    // As big as it was laid out, and no wider: another typeface keeps its line's width.
    const dx = glyphDot(Math.min(w.size, (EM_DOTS * w.width) / tw), cw);
    const dy = (dx * ch) / cw;
    const bw = tw + PAD * 2;
    const bh = EM_DOTS + PAD * 2;
    scratch.width = bw;
    scratch.height = bh;
    sx.font = FONT;
    sx.textBaseline = 'middle';
    sx.fillStyle = '#000';
    sx.fillText(w.text, PAD, PAD + EM_DOTS / 2);
    const cover = coverOf(sx.getImageData(0, 0, bw, bh).data, bw, bh);
    const fill = w.fill ? rgba(w.fill, w.alpha) : null;
    const { rgba: inked, glyph } = inkDots(cover, bw, bh, { fill, edge: fill && w.edge ? rgba(w.edge) : null, drop: fill && w.edge ? rgba(OUTLINE) : null, bold });
    const left0 = w.align === 'left' ? w.x : w.align === 'center' ? w.x + (w.width - tw * dx) / 2 : w.x - tw * dx;
    // The letters' em box goes onto the grid; the room round it (PAD dots) hangs outside.
    const left = snap(left0, snapStep(dx, cw)) - PAD * dx;
    const top = snap(w.y - (EM_DOTS / 2) * dy, snapStep(dy, ch)) - PAD * dy;
    fx.save();
    turnFor(fx, w);
    fx.imageSmoothingEnabled = false;
    fx.drawImage(canvasOf(inked, bw, bh), left, top, bw * dx, bh * dy);
    fx.restore();
    if (!w.part) continue;
    const white = new Uint8ClampedArray(bw * bh * 4);
    glyph.forEach((on, i) => on && white.set([255, 255, 255, 255], i * 4));
    const y = top + (PAD + EM_DOTS / 2) * dy;
    const run: TextRun = {
      part: w.part,
      text: w.text,
      font: `${bold ? '700 ' : ''}${EM_DOTS * dy}px "DotGothic16", monospace`,
      size: EM_DOTS * dy,
      x: left + PAD * dx,
      y,
      glyphs: { image: canvasOf(white, bw, bh), x: left, y: top, w: bw * dx, h: bh * dy },
    };
    if (w.stock !== undefined) run.stock = w.stock + y - w.y;
    if (w.rot) Object.assign(run, { rot: w.rot, cx: w.cx, cy: w.cy });
    runs.push(run);
  }
  return runs;
}
