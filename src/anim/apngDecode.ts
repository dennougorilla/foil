// Reads animated PNG (APNG) and animated WebP into the same frame list the GIF path uses,
// so the card face, the preview tick and the exports step through them unchanged.
import type { Anim } from '../gifDecode';
import { chunk, chunks, isPng, PNG_SIG } from './png';

export type AnimKind = 'GIF' | 'APNG' | 'WebP';

/** An animation that remembers which format it came from, for the thumbnail badge. */
export type KindedAnim = Anim & { kind: AnimKind };

/** Same memory rules as the GIF decoder: every frame stays decoded, so cap pixels and frame count. */
const PIXEL_BUDGET = 30_000_000;
const MAX_FRAMES = 180;
const MAX_SIDE = 1024;

export const animKind = (anim: Anim): AnimKind => (anim as Partial<KindedAnim>).kind ?? 'GIF';

/** Very short delays play at 100 ms in browsers; match that so the speed feels familiar. */
const delayMs = (ms: number) => (ms >= 10 ? Math.round(ms) : 100);

/** Which animated format the bytes hold, if any. Still PNG and still WebP return null. */
export function sniffAnimated(bytes: Uint8Array): Exclude<AnimKind, 'GIF'> | null {
  if (isPng(bytes)) {
    for (const c of chunks(bytes)) {
      // acTL must come before the first IDAT; after it, the file is a plain PNG.
      if (c.type === 'acTL') return new DataView(c.data.buffer, c.data.byteOffset).getUint32(0) > 1 ? 'APNG' : null;
      if (c.type === 'IDAT') return null;
    }
    return null;
  }
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  // RIFF....WEBPVP8X with the animation flag set in the extended header.
  if (bytes.length > 30 && tag(0) === 'RIFF' && tag(8) === 'WEBP' && tag(12) === 'VP8X' && bytes[20] & 0x02) {
    return 'WebP';
  }
  return null;
}

/**
 * Some systems hand over a .apng file with no MIME type. If the bytes are an APNG
 * (PNG signature plus acTL), return the same file labelled image/png; otherwise null.
 */
export async function asTypedApng(file: File): Promise<File | null> {
  // acTL sits right after IHDR, so the first few KB are plenty to tell.
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  return sniffAnimated(head) === 'APNG' ? new File([file], file.name, { type: 'image/png' }) : null;
}

function outputSize(w: number, h: number, frames: number) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(PIXEL_BUDGET / (w * h * frames)));
  return { outW: Math.max(1, Math.round(w * k)), outH: Math.max(1, Math.round(h * k)) };
}

function snapshot(src: CanvasImageSource, outW: number, outH: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, outW, outH);
  return out;
}

/**
 * Decodes an animated PNG or WebP. Returns null for still images (and for animated WebP where
 * the browser can't hand out frames), so callers fall back to the still-image path.
 */
export async function decodeAnimated(blob: Blob): Promise<KindedAnim | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniffAnimated(bytes);
  if (!kind) return null;
  const mime = kind === 'APNG' ? 'image/png' : 'image/webp';
  if (typeof ImageDecoder !== 'undefined') {
    try {
      if (await ImageDecoder.isTypeSupported(mime)) {
        const anim = await viaImageDecoder(bytes, mime);
        if (anim) return { ...anim, kind };
      }
    } catch (err) {
      // Some engines list the type but still refuse a file; the JS reader below covers APNG.
      console.warn('ImageDecoder could not read the animation', err);
    }
  }
  if (kind === 'APNG') {
    const anim = await viaApngReader(bytes);
    if (anim) return { ...anim, kind };
  }
  return null;
}

/** Chrome, Edge and Firefox: the browser composites every frame for us. */
async function viaImageDecoder(bytes: Uint8Array, type: string): Promise<Anim | null> {
  const dec = new ImageDecoder({ data: bytes, type });
  try {
    await dec.tracks.ready;
    const track = dec.tracks.selectedTrack;
    if (!track || track.frameCount < 2) return null;
    const count = Math.min(track.frameCount, MAX_FRAMES);
    const first = await dec.decode({ frameIndex: 0 });
    const { outW, outH } = outputSize(first.image.displayWidth, first.image.displayHeight, count);
    const frames: HTMLCanvasElement[] = [];
    const starts: number[] = [];
    let t = 0;
    for (let i = 0; i < count; i++) {
      const { image } = i === 0 ? first : await dec.decode({ frameIndex: i });
      frames.push(snapshot(image, outW, outH));
      starts.push(t);
      // VideoFrame durations are in microseconds.
      t += delayMs((image.duration ?? 0) / 1000);
      image.close();
    }
    return { frames, starts, duration: t };
  } finally {
    dec.close();
  }
}

interface FrameCtl {
  w: number;
  h: number;
  x: number;
  y: number;
  delay: number;
  dispose: number;
  blend: number;
  data: Uint8Array[];
}

/**
 * Safari and older engines: split the APNG into one plain PNG per frame, let the browser decode
 * each, then composite them by the APNG rules (blend and dispose ops) on a canvas.
 */
async function viaApngReader(bytes: Uint8Array): Promise<Anim | null> {
  let ihdr: Uint8Array | null = null;
  // Palette, transparency and colour chunks every frame needs to decode the same way.
  const shared: Uint8Array<ArrayBuffer>[] = [];
  const ctls: FrameCtl[] = [];
  let cur: FrameCtl | null = null;
  for (const c of chunks(bytes)) {
    const v = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
    if (c.type === 'IHDR') ihdr = c.data;
    else if (c.type === 'fcTL') {
      if (ctls.length >= MAX_FRAMES) break;
      const num = v.getUint16(20);
      const den = v.getUint16(22) || 100;
      cur = {
        w: v.getUint32(4),
        h: v.getUint32(8),
        x: v.getUint32(12),
        y: v.getUint32(16),
        delay: delayMs((num / den) * 1000),
        dispose: c.data[24],
        blend: c.data[25],
        data: [],
      };
      ctls.push(cur);
    } else if (c.type === 'IDAT') {
      // An IDAT without an fcTL before it is a still fallback image, not part of the animation.
      cur?.data.push(c.data);
    } else if (c.type === 'fdAT') {
      cur?.data.push(c.data.subarray(4));
    } else if (!ctls.length && ['PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT'].includes(c.type)) {
      shared.push(chunk(c.type, c.data));
    }
  }
  const frames = ctls.filter((f) => f.data.length);
  if (!ihdr || frames.length < 2) return null;

  const hv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  const W = hv.getUint32(0);
  const H = hv.getUint32(4);
  const { outW, outH } = outputSize(W, H, frames.length);
  const screen = document.createElement('canvas');
  screen.width = W;
  screen.height = H;
  const ctx = screen.getContext('2d', { willReadFrequently: true })!;

  const out: HTMLCanvasElement[] = [];
  const starts: number[] = [];
  let t = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const head = ihdr.slice();
    new DataView(head.buffer).setUint32(0, f.w);
    new DataView(head.buffer).setUint32(4, f.h);
    const parts = [PNG_SIG, chunk('IHDR', head), ...shared, ...f.data.map((d) => chunk('IDAT', d)), chunk('IEND', new Uint8Array())];
    const bmp = await createImageBitmap(new Blob(parts, { type: 'image/png' }));
    // Dispose op 2 on the first frame behaves like op 1, per the spec.
    const dispose = i === 0 && f.dispose === 2 ? 1 : f.dispose;
    const before = dispose === 2 ? ctx.getImageData(f.x, f.y, f.w, f.h) : null;
    if (f.blend === 0) ctx.clearRect(f.x, f.y, f.w, f.h);
    ctx.drawImage(bmp, f.x, f.y);
    bmp.close();
    out.push(snapshot(screen, outW, outH));
    starts.push(t);
    t += f.delay;
    if (dispose === 1) ctx.clearRect(f.x, f.y, f.w, f.h);
    else if (before) ctx.putImageData(before, f.x, f.y);
  }
  return { frames: out, starts, duration: t };
}
