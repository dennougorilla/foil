/// <reference lib="webworker" />
// Cuts the picture into the Shadowbox sheets off the main thread: first from colour (a moment),
// then from the depth model when it can run.
import { colorLayers, modelLayers, type LayerMap } from './layers';
import { estimateDepth, loadModel } from './model';

export interface CutRequest {
  id: number;
  /** The art window, RGBA. */
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
  /** Also run the depth model (otherwise colour only). */
  model: boolean;
}

export type CutReply =
  | { id: number; type: 'layers'; source: 'color' | 'model'; map: LayerMap }
  | { id: number; type: 'download'; loaded: number; total: number }
  | { id: number; type: 'running' }
  | { id: number; type: 'failed'; reason: string };

const post = (m: CutReply, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

/** Bilinear downscale of an RGBA picture. */
function scaleRgba(src: Uint8ClampedArray, sw: number, sh: number, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / h - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / w - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c] * (1 - tx) + src[(y0 * sw + x1) * 4 + c] * tx;
        const b = src[(y1 * sw + x0) * 4 + c] * (1 - tx) + src[(y1 * sw + x1) * 4 + c] * tx;
        out[(y * w + x) * 4 + c] = a * (1 - ty) + b * ty;
      }
    }
  }
  return out;
}

let latest = 0;

self.onmessage = async (e: MessageEvent<CutRequest>) => {
  const { id, rgba, w, h, model } = e.data;
  latest = id;
  const cw = w >> 1;
  const chh = h >> 1;
  const color = colorLayers(scaleRgba(rgba, w, h, cw, chh), cw, chh);
  post({ id, type: 'layers', source: 'color', map: color }, [color.data.buffer, color.plate.buffer]);
  if (!model) return;
  try {
    const runner = await loadModel((loaded, total) => post({ id, type: 'download', loaded, total }));
    // A newer picture arrived while the model loaded; it will get its own turn.
    if (id !== latest) return;
    post({ id, type: 'running' });
    const input = runner.w === w && runner.h === h ? rgba : scaleRgba(rgba, w, h, runner.w, runner.h);
    const raw = await estimateDepth(runner, input);
    if (id !== latest) return;
    const map = modelLayers(raw, rgba, w, h);
    post({ id, type: 'layers', source: 'model', map }, [map.data.buffer, map.plate.buffer]);
  } catch (err) {
    console.warn('depth: model failed, keeping the colour cut', err);
    post({ id, type: 'failed', reason: (err as Error).message || 'model' });
  }
};
