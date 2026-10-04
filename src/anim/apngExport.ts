// High-quality animated export: the same orbit as the GIF, but full colour and with the card's
// rounded corners and soft shadow kept on a transparent background, saved as APNG.
import { animLoop, createScene, download, fileSafe, packLoaded, type ExportInput, type Scene } from '../exporter';
import type { ApngRequest, ApngResponse } from './apngWorker';

const W = 320;
const H = 400;
/** 12.5 fps: smooth enough for the slow orbit, and half the frames (and bytes) of 25 fps. */
const DELAY = 80;
const DEFAULT_MS = 2400;
/** Long animated sources play at a lower frame rate rather than growing the file without end. */
const MAX_FRAMES = 40;
/** Share of the bar given to drawing; encoding overlaps it and fills the rest. */
const DRAW_SHARE = 0.3;
/** Measured average for one deflated frame at this size across finishes (busy pictures run higher). */
const BYTES_PER_FRAME = 95_000;

export interface ApngPlan {
  width: number;
  height: number;
  /** Delay of each frame in whole ms; together they add up to the loop length. */
  delays: number[];
  /** Rough size of the finished file in bytes. */
  bytes: number;
  /** Source time one loop covers (see `animLoop`). */
  sourceSpan: number;
}

/** Frame timing and expected size; an animated source sets the loop length, as for the GIF. */
export function apngPlan(loopMs?: number): ApngPlan {
  const { loopMs: ms, sourceSpan } = animLoop(loopMs, DEFAULT_MS);
  const frames = Math.min(MAX_FRAMES, Math.round(ms / DELAY));
  // Rounded per frame from the running total, so the loop length stays exact.
  const delays = Array.from({ length: frames }, (_, i) => Math.round(((i + 1) * ms) / frames) - Math.round((i * ms) / frames));
  return { width: W, height: H, delays, bytes: frames * BYTES_PER_FRAME, sourceSpan };
}

const aborted = () => new DOMException('Export cancelled', 'AbortError');

/** Waits for the next animation frame, or rejects as soon as the export is stopped. */
const nextFrame = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(aborted());
    const onAbort = () => {
      cancelAnimationFrame(id);
      reject(aborted());
    };
    const id = requestAnimationFrame(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
    signal.addEventListener('abort', onAbort, { once: true });
  });

export interface ApngResult {
  file: string;
  bytes: number;
}

/**
 * Draws the loop one frame per animation frame and streams each to a worker that encodes it,
 * so the UI never stalls. Aborting the signal stops both and rejects with an AbortError.
 */
export async function exportApng(
  input: ExportInput,
  onProgress: (p: number, frames: number) => void,
  signal: AbortSignal,
): Promise<ApngResult> {
  await packLoaded(input.edition);
  if (signal.aborted) throw aborted();
  const plan = apngPlan(input.loopMs);
  const worker = new Worker(new URL('./apngWorker.ts', import.meta.url), { type: 'module' });
  const send = (m: ApngRequest, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  let drawn = 0;
  let encoded = 0;
  const frames = plan.delays.length;
  const report = () => onProgress((drawn * DRAW_SHARE + encoded * (1 - DRAW_SHARE)) / frames, frames);
  const result = new Promise<ArrayBuffer>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ApngResponse>) => {
      const m = e.data;
      if (m.type === 'progress') {
        encoded = m.encoded;
        report();
      } else if (m.type === 'done') resolve(m.data);
      else reject(new Error(m.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'apng-worker'));
    // Stop encoding at once, even if drawing is paused (a hidden tab skips animation frames).
    signal.addEventListener(
      'abort',
      () => {
        worker.terminate();
        reject(aborted());
      },
      { once: true },
    );
  });
  // A worker failure mid-draw surfaces at the await below, not as an unhandled rejection.
  result.catch(() => {});

  const loopMs = plan.delays.reduce((a, b) => a + b, 0);
  let at = 0;
  let scene: Scene | undefined;
  try {
    scene = createScene(input, plan.width, plan.height, true, true);
    send({ type: 'start', width: plan.width, height: plan.height });
    for (let i = 0; i < frames; i++) {
      await nextFrame(signal);
      scene.draw(at / loopMs, 0, loopMs / 1000, (at / loopMs) * plan.sourceSpan);
      const { data } = scene.ctx.getImageData(0, 0, plan.width, plan.height);
      send({ type: 'frame', data: data.buffer, delay: plan.delays[i] }, [data.buffer]);
      at += plan.delays[i];
      drawn = i + 1;
      report();
    }
    send({ type: 'finish' });
    const bytes = await result;
    const file = download(new Blob([bytes], { type: 'image/png' }), `${fileSafe(input.name)}-${input.edition.id}-anim.png`);
    return { file, bytes: bytes.byteLength };
  } finally {
    scene?.dispose();
    worker.terminate();
  }
}
