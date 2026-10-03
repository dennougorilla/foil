// Quantizes and encodes the GIF off the main thread, so the card keeps moving while it saves.
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { ditherToPalette } from './gifDither';

export type GifRequest =
  | { type: 'frame'; data: ArrayBuffer }
  | { type: 'encode'; width: number; height: number; delay: number; dither: boolean };

export type GifResponse =
  | { type: 'progress'; p: number }
  | { type: 'done'; data: ArrayBuffer }
  | { type: 'error'; message: string };

// The project compiles against the DOM lib; this is the only worker surface needed.
const scope = self as unknown as {
  postMessage(m: GifResponse, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<GifRequest>) => void) | null;
};
const frames: Uint8ClampedArray[] = [];
const SAMPLE = 320_000;

const post = (m: GifResponse, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

/** One palette for the whole loop, built from pixels spread across every frame, so colours never flicker. */
function globalPalette() {
  const px = frames[0].length / 4;
  const stride = Math.max(1, Math.floor((px * frames.length) / SAMPLE)) | 1;
  const sample = new Uint8ClampedArray(Math.ceil(px / stride) * frames.length * 4);
  let o = 0;
  frames.forEach((f, i) => {
    // Shift the start per frame so the stride lands on different pixels each time.
    for (let p = (i * 7) % stride; p < px; p += stride, o += 4) {
      sample[o] = f[p * 4];
      sample[o + 1] = f[p * 4 + 1];
      sample[o + 2] = f[p * 4 + 2];
      sample[o + 3] = 255;
    }
  });
  // 255 colours: the last slot stays free as the "unchanged" key for delta frames.
  return quantize(sample.subarray(0, o), 255);
}

function encode(width: number, height: number, delay: number, dither: boolean) {
  const palette = globalPalette();
  const key = palette.length;
  const gif = GIFEncoder({ initialCapacity: 1 << 20 });
  let prev: Uint8Array | null = null;
  frames.forEach((f, i) => {
    const index = dither ? ditherToPalette(f, width, palette, 16) : applyPalette(f, palette);
    if (prev) {
      // Pixels identical to the frame underneath turn transparent; long runs of one index cost almost nothing.
      const delta = new Uint8Array(index.length);
      for (let p = 0; p < index.length; p++) delta[p] = index[p] === prev[p] ? key : index[p];
      gif.writeFrame(delta, width, height, { delay, transparent: true, transparentIndex: key, dispose: 1 });
    } else {
      gif.writeFrame(index, width, height, { palette: [...palette, [0, 0, 0]], delay, repeat: 0, dispose: 1 });
    }
    prev = index;
    post({ type: 'progress', p: (i + 1) / frames.length });
  });
  gif.finish();
  frames.length = 0;
  const out = gif.bytes();
  post({ type: 'done', data: out.buffer as ArrayBuffer }, [out.buffer]);
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'frame') {
    frames.push(new Uint8ClampedArray(m.data));
    return;
  }
  try {
    encode(m.width, m.height, m.delay, m.dither);
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};
