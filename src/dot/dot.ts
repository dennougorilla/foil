// Pixel art on a painted card face (docs/features.md, Card → Pixel art): shrink the face to its pixel
// grid, cut its colours down, outline it, and draw it back up as hard squares on the same canvas.
// Loaded the first time pixel art is turned on (docs/performance.md). The grid is small (at most
// 128 × 180 pixels), so this runs right where the face is painted: about 5 ms with a kept palette
// (a moving picture's next frame), 15–20 ms when a palette is picked.
import { dotFrames, pixelateArt, type RGB } from './convert';
import { gridOf, type Dot } from './model';

const small = document.createElement('canvas');
const smallMask = document.createElement('canvas');
const half = document.createElement('canvas');
/** Palettes by what they were picked for (a moving picture keeps one from frame to frame; a file being made keeps its own). */
const kept = new Map<string, RGB[]>();

/** Shrinks `src` onto `small` at `w` × `h`, halving first so every pixel of the face counts. */
function shrink(src: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  let from: HTMLCanvasElement = src;
  let fw = src.width;
  let fh = src.height;
  while (fw / 2 >= w * 2 && fh / 2 >= h * 2) {
    const nw = Math.round(fw / 2);
    const nh = Math.round(fh / 2);
    const tmp = from === half ? document.createElement('canvas') : half;
    tmp.width = nw;
    tmp.height = nh;
    const x = tmp.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(from, 0, 0, fw, fh, 0, 0, nw, nh);
    from = tmp;
    fw = nw;
    fh = nh;
  }
  small.width = w;
  small.height = h;
  const x = small.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(from, 0, 0, fw, fh, 0, 0, w, h);
  return x;
}

/** Which pixels of the grid are in the art window (the mask's red, see card/face.ts). */
function artOf(mask: HTMLCanvasElement, w: number, h: number): Uint8Array {
  smallMask.width = w;
  smallMask.height = h;
  const x = smallMask.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingEnabled = false;
  x.drawImage(mask, 0, 0, mask.width, mask.height, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = d[i * 4] >= 128 ? 1 : 0;
  return on;
}

/**
 * Redraws `face` as pixel art in place. `palKey` names what the palette belongs to: while it stays the
 * same (the frames of one moving picture) the palette is kept, so the colours don't flicker. With `art`
 * (Pixelate on as well), the art window in `art.mask` is first pixelated in blocks of `art.block` pixels.
 */
export function dotFace(face: HTMLCanvasElement, dot: Dot, palKey: string, art?: { mask: HTMLCanvasElement; block: number }): void {
  const g = gridOf(face.width, face.height, dot.size);
  const x = shrink(face, g.w, g.h);
  const img = x.getImageData(0, 0, g.w, g.h);
  if (art && art.block > 1) pixelateArt(img.data, g.w, g.h, artOf(art.mask, g.w, g.h), art.block);
  const key = `${palKey}|${dot.colors}`;
  const pal = dotFrames([img.data], g.w, g.h, dot, kept.get(key));
  kept.set(key, pal);
  // Only the latest few are wanted again.
  if (kept.size > 6) kept.delete(kept.keys().next().value!);
  x.putImageData(img, 0, 0);
  const fx = face.getContext('2d')!;
  fx.save();
  fx.setTransform(1, 0, 0, 1, 0, 0);
  fx.clearRect(0, 0, face.width, face.height);
  fx.imageSmoothingEnabled = false;
  fx.drawImage(small, 0, 0, face.width, face.height);
  fx.restore();
}
