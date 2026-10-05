// High-quality animated export: the same orbit as the GIF, but full colour and with the card's
// rounded corners and soft shadow kept on a transparent background, saved as APNG.
import { createScene, download, fileSafe, packsLoaded, type ExportInput, type Scene } from '../exporter';
import { TUNE_DEFAULTS } from '../tune/model';
import { apngPlan, H, W } from './apngPlan';
import type { ApngRequest, ApngResponse } from './apngWorker';

/** Share of the bar given to drawing; encoding overlaps it and fills the rest. */
const DRAW_SHARE = 0.3;

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
  if (signal.aborted) throw aborted();
  await packsLoaded(input);
  if (signal.aborted) throw aborted();
  const plan = apngPlan(input.tune ?? TUNE_DEFAULTS, input.face.height / input.face.width, input.loopMs, !!input.edition.torch);
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
    scene = createScene(input, W, H, true, true);
    send({ type: 'start', width: plan.width, height: plan.height });
    for (let i = 0; i < frames; i++) {
      await nextFrame(signal);
      scene.draw(at / loopMs, 0, (at / loopMs) * plan.sourceSpan);
      const { data } = scene.ctx.getImageData(0, 0, plan.width, plan.height);
      send({ type: 'frame', data: data.buffer, delay: plan.delays[i] }, [data.buffer]);
      at += plan.delays[i];
      drawn = i + 1;
      report();
    }
    send({ type: 'finish' });
    const bytes = await result;
    const file = download(new File([bytes], `${fileSafe(input.name)}-${input.edition.id}-anim.png`, { type: 'image/png' }));
    return { file, bytes: bytes.byteLength };
  } finally {
    scene?.dispose();
    worker.terminate();
  }
}
