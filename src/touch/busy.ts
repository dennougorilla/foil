// Where a picture is busiest: a coarse map of local contrast and colour over the card face, so an
// exported swipe can go through what matters in the picture rather than the same place every time.
import { AutoTouch, pickSwipe } from './heat';

const W = 20;
const H = 28;

function busyMap(face: HTMLCanvasElement): Float32Array {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(face, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  const chroma = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    chroma[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  const busy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const edge = Math.abs(lum[i - 1] - lum[i + 1]) + Math.abs(lum[i - W] - lum[i + W]);
      busy[i] = edge + chroma[i] * 0.3;
    }
  }
  return busy;
}

/** The unseen finger for an export of this face. */
export const autoTouchFor = (face: HTMLCanvasElement) => new AutoTouch(pickSwipe(busyMap(face), W, H));
