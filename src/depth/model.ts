// The monocular depth model behind the Shadowbox and Lenticular finishes, run inside the depth worker.
// Depth Anything V2 Small (Apache-2.0), as ONNX from Hugging Face's onnx-community, pinned to one
// revision and checked against its published SHA-256 before it is used. It is fetched once on
// first use and kept in the browser's Cache Storage; the picture itself never leaves the device.
import cpuWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import gpuWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import type { Gray } from './layers';

const REPO = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/';
const CACHE = 'foil-depth-model-v1';

interface ModelFile {
  file: string;
  bytes: number;
  sha256: string;
}

/** 8-bit weights for the CPU; half precision with 4-bit weights where WebGPU has f16 shaders. */
const FILES: Record<'cpu' | 'gpu', ModelFile> = {
  cpu: { file: 'model_quantized.onnx', bytes: 27258801, sha256: 'fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d' },
  gpu: { file: 'model_q4f16.onnx', bytes: 19126267, sha256: 'eca72971aea64216d767c70c534160de53b5435b588d362bac6dbd5a73f9bf1e' },
};

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export type Progress = (loaded: number, total: number) => void;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The model's bytes: from the cache, or downloaded with progress and verified before caching. */
async function modelBytes(m: ModelFile, progress: Progress): Promise<ArrayBuffer> {
  const url = REPO + m.file;
  const cache = await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) {
    // The cached copy is checked like a fresh one; a damaged entry is dropped and fetched again.
    const buf = await hit.arrayBuffer();
    if (buf.byteLength === m.bytes && hex(await crypto.subtle.digest('SHA-256', buf)) === m.sha256) return buf;
    await cache?.delete(url).catch(() => false);
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model-http-${res.status}`);
  const out = new Uint8Array(m.bytes);
  const reader = res.body.getReader();
  let at = 0;
  progress(0, m.bytes);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.length > out.length) {
      // Stop the oversized download instead of letting it run on in the background.
      await reader.cancel().catch(() => {});
      throw new Error('model-size');
    }
    out.set(value, at);
    at += value.length;
    progress(at, m.bytes);
  }
  if (at !== m.bytes) throw new Error('model-size');
  if (hex(await crypto.subtle.digest('SHA-256', out)) !== m.sha256) throw new Error('model-hash');
  await cache?.put(url, new Response(out)).catch(() => {});
  return out.buffer;
}

async function gpuWithF16(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    return !!adapter?.features.has('shader-f16');
  } catch {
    return false;
  }
}

type Ort = typeof import('onnxruntime-web/wasm');

interface Runner {
  ort: Ort;
  session: import('onnxruntime-web/wasm').InferenceSession;
  /** Model input size (multiples of 14, portrait like the art window). */
  w: number;
  h: number;
}

let runner: Promise<Runner> | null = null;

async function open(kind: 'cpu' | 'gpu', progress: Progress): Promise<Runner> {
  const ort: Ort = kind === 'gpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm');
  ort.env.wasm.wasmPaths = { wasm: kind === 'gpu' ? gpuWasm : cpuWasm };
  // GitHub Pages can't opt into cross-origin isolation, so there is one thread.
  ort.env.wasm.numThreads = 1;
  const bytes = await modelBytes(FILES[kind], progress);
  const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: [kind === 'gpu' ? 'webgpu' : 'wasm'],
    graphOptimizationLevel: 'all',
  });
  // The CPU gets a smaller picture: the cut needs shapes, not fine detail, and it is 2x faster.
  return kind === 'gpu' ? { ort, session, w: 392, h: 518 } : { ort, session, w: 294, h: 392 };
}

/** Opens the model once: WebGPU when it has f16 shaders, otherwise (or if that fails) the CPU. */
export function loadModel(progress: Progress): Promise<Runner> {
  runner ??= (async () => {
    if (await gpuWithF16()) {
      try {
        return await open('gpu', progress);
      } catch (err) {
        console.warn('depth: webgpu unavailable, using wasm', err);
      }
    }
    return open('cpu', progress);
  })();
  runner.catch(() => (runner = null));
  return runner;
}

/** Relative depth (larger = nearer) for an RGBA picture already scaled to the model's input size. */
export async function estimateDepth(r: Runner, rgba: Uint8ClampedArray): Promise<Gray> {
  const { ort, session, w, h } = r;
  const n = w * h;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++) input[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, h, w]) };
  const out = await session.run(feeds);
  const t = out[session.outputNames[0]];
  const [oh, ow] = t.dims.slice(-2);
  const data = Float32Array.from(t.data as Float32Array);
  t.dispose();
  return { w: ow, h: oh, data };
}
