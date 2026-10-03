// Encodes full-colour, alpha-preserving APNG off the main thread. Frames are filtered and
// deflated as they arrive, so encoding overlaps with drawing and the card keeps moving.
import { chunk, PNG_SIG } from './png';

export type ApngRequest =
  | { type: 'start'; width: number; height: number }
  | { type: 'frame'; data: ArrayBuffer; delay: number }
  | { type: 'finish' };

export type ApngResponse =
  | { type: 'progress'; encoded: number }
  | { type: 'done'; data: ArrayBuffer }
  | { type: 'error'; message: string };

// The project compiles against the DOM lib; this is the only worker surface needed.
const scope = self as unknown as {
  postMessage(m: ApngResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ApngRequest>) => void) | null;
};

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  delay: number;
  zdata: Uint8Array;
}

let W = 0;
let H = 0;
let prev: Uint8Array | null = null;
let encoded = 0;
const frames: Frame[] = [];
// Frames are handled strictly in order: each waits for the one before it to finish deflating.
let queue: Promise<void> = Promise.resolve();

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  // "deflate" is the zlib wrapper PNG's IDAT expects.
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Filters each scanline of the sub-rectangle with whichever of PNG's five filters leaves the
 * smallest sum of residuals, the usual heuristic that lets deflate find long runs.
 */
function filtered(px: Uint8Array, x0: number, y0: number, w: number, h: number): Uint8Array {
  const bpl = w * 4;
  const out = new Uint8Array((bpl + 1) * h);
  const cand = Array.from({ length: 5 }, () => new Uint8Array(bpl));
  for (let y = 0; y < h; y++) {
    const row = (y0 + y) * W * 4 + x0 * 4;
    const up = y > 0 ? row - W * 4 : -1;
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let sum = 0;
      for (let i = 0; i < bpl; i++) {
        const v = px[row + i];
        const a = i >= 4 ? px[row + i - 4] : 0;
        const b = up >= 0 ? px[up + i] : 0;
        const cc = up >= 0 && i >= 4 ? px[up + i - 4] : 0;
        let r: number;
        if (f === 0) r = v;
        else if (f === 1) r = v - a;
        else if (f === 2) r = v - b;
        else if (f === 3) r = v - ((a + b) >> 1);
        else {
          const p = a + b - cc;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - cc);
          r = v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
        }
        r &= 0xff;
        c[i] = r;
        sum += r < 128 ? r : 256 - r;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    // A filter only wins after scanning its full row, so the early exit never truncates the winner.
    out[y * (bpl + 1)] = best;
    out.set(cand[best], y * (bpl + 1) + 1);
  }
  return out;
}

/** Bounding box of the pixels that differ from the previous frame, or null if none do. */
function changed(px: Uint8Array): { x: number; y: number; w: number; h: number } | null {
  if (!prev) return { x: 0, y: 0, w: W, h: H };
  const a = new Uint32Array(px.buffer, px.byteOffset, W * H);
  const b = new Uint32Array(prev.buffer, prev.byteOffset, W * H);
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let l = 0;
    while (l < W && a[o + l] === b[o + l]) l++;
    if (l === W) continue;
    let r = W - 1;
    while (r > l && a[o + r] === b[o + r]) r--;
    if (l < x0) x0 = l;
    if (r > x1) x1 = r;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function addFrame(data: ArrayBuffer, delay: number) {
  const px = new Uint8Array(data);
  const box = changed(px);
  if (!box) {
    // Nothing moved: hold the previous frame longer instead of storing an empty one.
    frames[frames.length - 1].delay += delay;
  } else {
    const zdata = await deflate(filtered(px, box.x, box.y, box.w, box.h));
    frames.push({ ...box, delay, zdata });
  }
  prev = px;
  encoded++;
  scope.postMessage({ type: 'progress', encoded });
}

function u32(v: DataView, o: number, n: number) {
  v.setUint32(o, n);
}

function assemble(): Uint8Array {
  const parts: Uint8Array[] = [PNG_SIG];
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  u32(hv, 0, W);
  u32(hv, 4, H);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, deflate, adaptive filtering, no interlace
  parts.push(chunk('IHDR', ihdr));
  const actl = new Uint8Array(8);
  u32(new DataView(actl.buffer), 0, frames.length);
  // num_plays 0: loop forever.
  parts.push(chunk('acTL', actl));
  // An sRGB chunk keeps colours the same across viewers that would otherwise guess.
  parts.push(chunk('sRGB', new Uint8Array([0])));
  let seq = 0;
  frames.forEach((f, i) => {
    const fc = new Uint8Array(26);
    const v = new DataView(fc.buffer);
    u32(v, 0, seq++);
    u32(v, 4, f.w);
    u32(v, 8, f.h);
    u32(v, 12, f.x);
    u32(v, 16, f.y);
    // Delays in milliseconds, kept within the 16-bit numerator.
    v.setUint16(20, Math.min(65535, Math.round(f.delay)));
    v.setUint16(22, 1000);
    fc[24] = 0; // dispose: none — the next frame paints over what is left
    fc[25] = 0; // blend: source — the patch replaces pixels, alpha included
    parts.push(chunk('fcTL', fc));
    if (i === 0) {
      // The first frame doubles as the still image shown by viewers that don't animate.
      parts.push(chunk('IDAT', f.zdata));
    } else {
      const fd = new Uint8Array(4 + f.zdata.length);
      u32(new DataView(fd.buffer), 0, seq++);
      fd.set(f.zdata, 4);
      parts.push(chunk('fdAT', fd));
    }
  });
  parts.push(chunk('IEND', new Uint8Array()));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

let failed = false;
const fail = (err: unknown) => {
  if (failed) return;
  failed = true;
  scope.postMessage({ type: 'error', message: (err as Error)?.message || 'apng' });
};

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start') {
    W = m.width;
    H = m.height;
  } else if (m.type === 'frame') {
    queue = queue.then(() => (failed ? undefined : addFrame(m.data, m.delay))).catch(fail);
  } else {
    queue = queue.then(() => {
      if (failed) return;
      const out = assemble();
      frames.length = 0;
      scope.postMessage({ type: 'done', data: out.buffer as ArrayBuffer }, [out.buffer]);
    }).catch(fail);
  }
};
