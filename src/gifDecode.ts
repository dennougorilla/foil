import { decompressFrames, parseGIF } from 'gifuct-js';

export interface Anim {
  frames: HTMLCanvasElement[];
  /** Start time of each frame in ms, plus the total loop length. */
  starts: number[];
  duration: number;
}

/** Keeps every decoded frame in memory, so cap the total pixel budget (~120 MB of RGBA). */
const PIXEL_BUDGET = 30_000_000;
const MAX_FRAMES = 180;
/** Decompression expands every frame to RGBA at once, so cap the raw patch pixels (~400 MB) before it runs. */
const RAW_PIXEL_BUDGET = 100_000_000;

/**
 * Decodes an animated GIF into fully composited frames.
 * Returns null for single-frame GIFs so callers can treat them as still images.
 */
export function decodeGif(buf: ArrayBuffer): Anim | null {
  const gif = parseGIF(buf);
  // Keep only the frames we will use, and stop early on huge GIFs, before anything is decompressed.
  const images = gif.frames.filter((f) => 'image' in f);
  let px = 0;
  let n = 0;
  for (const f of images) {
    const { width, height } = f.image.descriptor;
    px += width * height;
    if (n >= MAX_FRAMES || (n >= 2 && px > RAW_PIXEL_BUDGET)) break;
    n++;
  }
  gif.frames = images.slice(0, n);
  const raw = decompressFrames(gif, true);
  if (raw.length < 2) return null;

  const W = gif.lsd.width;
  const H = gif.lsd.height;
  const k = Math.min(1, 1024 / Math.max(W, H), Math.sqrt(PIXEL_BUDGET / (W * H * raw.length)));
  const outW = Math.max(1, Math.round(W * k));
  const outH = Math.max(1, Math.round(H * k));

  // The logical screen we composite onto, honouring each frame's disposal method.
  const screen = document.createElement('canvas');
  screen.width = W;
  screen.height = H;
  const sctx = screen.getContext('2d', { willReadFrequently: true })!;
  const patch = document.createElement('canvas');
  const pctx = patch.getContext('2d')!;

  const frames: HTMLCanvasElement[] = [];
  const starts: number[] = [];
  let t = 0;
  let restore: ImageData | null = null;
  for (const f of raw) {
    const { width, height, left, top } = f.dims;
    if (f.disposalType === 3) restore = sctx.getImageData(0, 0, W, H);
    patch.width = width;
    patch.height = height;
    pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), width, height), 0, 0);
    sctx.drawImage(patch, left, top);

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d')!;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(screen, 0, 0, outW, outH);
    frames.push(out);
    starts.push(t);
    // Browsers treat tiny delays as 100 ms; match them so speed feels familiar.
    t += f.delay >= 20 ? f.delay : 100;

    if (f.disposalType === 2) sctx.clearRect(left, top, width, height);
    else if (f.disposalType === 3 && restore) sctx.putImageData(restore, 0, 0);
  }
  return { frames, starts, duration: t };
}

/** Index of the frame showing at time `ms` in a looping animation. */
export function frameAt(anim: Anim, ms: number): number {
  const t = ((ms % anim.duration) + anim.duration) % anim.duration;
  let lo = 0;
  let hi = anim.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (anim.starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
