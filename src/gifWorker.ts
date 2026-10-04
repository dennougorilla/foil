// Quantizes and encodes the GIF off the main thread, so the card keeps moving while it saves.
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { ditherToPalette } from './gifDither';

export type GifRequest =
  | { type: 'frame'; data: ArrayBuffer }
  | {
      type: 'encode';
      width: number;
      height: number;
      /** Each frame's delay in ms, a whole number of 10 ms. */
      delays: number[];
      /** Frames were drawn without a backdrop: keep what is clear, clear. */
      clear: boolean;
      /** Colour that solid edge pixels are blended into, or null to keep their own colour. */
      matte: [number, number, number] | null;
      /** Smooth gradients: error-diffuse into the palette instead of snapping to it. */
      dither: boolean;
    };

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
/** Below this alpha a pixel turns clear; at or above it, solid. GIF has nothing in between. */
const CUTOFF = 128;

const post = (m: GifResponse, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

/**
 * GIF transparency is one bit: each pixel is either clear or solid. Soft edge pixels become
 * solid (blended into the matte, when one is given) or clear, split at half alpha.
 */
function cutOut(f: Uint8ClampedArray, matte: [number, number, number] | null) {
  for (let o = 0; o < f.length; o += 4) {
    const a = f[o + 3];
    if (a < CUTOFF) {
      f[o + 3] = 0;
      continue;
    }
    if (matte && a < 255) {
      const k = a / 255;
      f[o] = f[o] * k + matte[0] * (1 - k);
      f[o + 1] = f[o + 1] * k + matte[1] * (1 - k);
      f[o + 2] = f[o + 2] * k + matte[2] * (1 - k);
    }
    f[o + 3] = 255;
  }
}

/** One palette for the whole loop, built from pixels spread across every frame, so colours never flicker. */
function globalPalette() {
  const px = frames[0].length / 4;
  const stride = Math.max(1, Math.floor((px * frames.length) / SAMPLE)) | 1;
  const sample = new Uint8ClampedArray(Math.ceil(px / stride) * frames.length * 4);
  let o = 0;
  frames.forEach((f, i) => {
    // Shift the start per frame so the stride lands on different pixels each time.
    for (let p = (i * 7) % stride; p < px; p += stride) {
      // Clear pixels get their own index, so they never take a palette slot.
      if (f[p * 4 + 3] === 0) continue;
      sample[o] = f[p * 4];
      sample[o + 1] = f[p * 4 + 1];
      sample[o + 2] = f[p * 4 + 2];
      sample[o + 3] = 255;
      o += 4;
    }
  });
  // 255 colours: the last slot stays free as the key (unchanged pixels, or clear ones).
  return quantize(sample.subarray(0, o), 255);
}

function encode(m: Extract<GifRequest, { type: 'encode' }>) {
  const { width, height, delays, clear } = m;
  if (clear) frames.forEach((f) => cutOut(f, m.matte));
  const palette = globalPalette();
  const key = palette.length;
  const gif = GIFEncoder({ initialCapacity: 1 << 20 });
  let prev: Uint8Array | null = null;
  frames.forEach((f, i) => {
    const delay = delays[i];
    const index = m.dither ? ditherToPalette(f, width, palette, 16) : applyPalette(f, palette);
    const first = i === 0 ? { palette: [...palette, [0, 0, 0]], repeat: 0 } : {};
    if (clear) {
      // Each frame is drawn whole on a cleared canvas: the card moves, so what was solid may now be clear.
      for (let p = 0; p < index.length; p++) if (f[p * 4 + 3] === 0) index[p] = key;
      gif.writeFrame(index, width, height, { ...first, delay, transparent: true, transparentIndex: key, dispose: 2 });
    } else if (prev) {
      // Pixels identical to the frame underneath turn transparent; long runs of one index cost almost nothing.
      const delta = new Uint8Array(index.length);
      for (let p = 0; p < index.length; p++) delta[p] = index[p] === prev[p] ? key : index[p];
      gif.writeFrame(delta, width, height, { delay, transparent: true, transparentIndex: key, dispose: 1 });
    } else {
      gif.writeFrame(index, width, height, { ...first, delay, dispose: 1 });
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
    encode(m);
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};
