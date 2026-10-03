import { FACE_H, FACE_W } from './card/face';
import { BackgroundRenderer, CardRenderer, hexToRgb, type RGB } from './gl/renderers';
import type { Edition } from './editions';
import type { GifRequest, GifResponse } from './gifWorker';
import { fixedLight, loopPose, TUNE_DEFAULTS, tuneGl, type Tune } from './tune/model';
import { stillPose } from './lettering';
import type { RangeSnapshot } from './gl/range';

export interface ExportInput {
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  back: HTMLCanvasElement;
  edition: Edition;
  intensity: number;
  pixel: number;
  name: string;
  /** For animated sources: paints the card face as it looks `ms` into the animation. */
  faceAt?: (ms: number, face: HTMLCanvasElement, mask: HTMLCanvasElement) => void;
  /** Length of one loop of the animated source, in ms. */
  loopMs?: number;
  /** Fine-tuning of light and motion; defaults when left out. */
  tune?: Tune;
  /** Where on the face the finish lands; whole card when absent. */
  range?: RangeSnapshot;
  /** Backdrop swirl for clips; the finish's own when absent. */
  swirl?: [string, string, string];
}

const PIXEL_STEPS = [0, 96, 72, 56, 44, 34, 26];

export const fileSafe = (s: string) => (s.trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'card');

const nextFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));

export function download(blob: Blob, name: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}

/** A flat, transparent PNG at the face texture's native resolution, with a sheen frozen mid-tilt. */
export async function exportPng(input: ExportInput): Promise<string> {
  const pad = 24;
  const canvas = document.createElement('canvas');
  const r = new CardRenderer(canvas, { preserve: true, settled: true });
  const tune = input.tune ?? TUNE_DEFAULTS;
  r.tune = tuneGl(tune);
  r.setFace(input.face, input.mask);
  r.setBack(input.back);
  if (input.range) r.range.set(input.range);
  r.resize(FACE_W + pad * 2, FACE_H + pad * 2, 1);
  r.begin();
  r.drawCard(
    {
      cx: FACE_W / 2 + pad,
      cy: FACE_H / 2 + pad,
      w: FACE_W,
      h: FACE_H,
      rx: 0,
      ry: 0,
      rz: 0,
      scale: 1,
      edition: input.edition.shader,
      intensity: input.intensity,
      pixel: PIXEL_STEPS[input.pixel] ?? 0,
      // The light follows the tune; the tilt is nudged so foil or spot UV lettering catches it.
      ...stillPose([0.35, -0.25], tune.light === 'fixed' ? fixedLight(tune.lightAngle) : [0.32, 0.22]),
      alpha: 1,
      flash: 0,
      shadow: [0, 0],
    },
    1.7,
  );
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  r.gl.getExtension('WEBGL_lose_context')?.loseContext();
  if (!blob) throw new Error('png');
  return download(blob, `${fileSafe(input.name)}-${input.edition.id}.png`);
}

export interface Scene {
  out: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Draws loop position p∈[0,1) of a loop `loopSec` long: the card orbits once on the swirl backdrop. */
  draw(p: number, bgTime: number, loopSec: number, sourceMs?: number): void;
  dispose(): void;
}

/**
 * The shared stage for video and GIF: a pixel swirl upscaled nearest, with the card composited on top.
 * `transparent` leaves the swirl out so only the card and its shadow are drawn (APNG).
 */
export function createScene(input: ExportInput, W: number, H: number, readback = false, transparent = false): Scene {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d', { willReadFrequently: readback })!;
  const bgCanvas = document.createElement('canvas');
  const bg = new BackgroundRenderer(bgCanvas);
  bg.resize(W / 4, H / 4);
  const cardCanvas = document.createElement('canvas');
  const cards = new CardRenderer(cardCanvas, { settled: true });
  const tune = input.tune ?? TUNE_DEFAULTS;
  cards.tune = tuneGl(tune);
  cards.setFace(input.face, input.mask);
  cards.setBack(input.back);
  if (input.range) cards.range.set(input.range);
  cards.resize(W, H, 1);
  const colors = (input.swirl ?? input.edition.swirl).map(hexToRgb) as [RGB, RGB, RGB];
  // Animated sources repaint their own face canvases so the live card is left alone.
  const animFace = input.faceAt ? document.createElement('canvas') : null;
  const animMask = input.faceAt ? document.createElement('canvas') : null;
  // Everything is laid out for a 900px-tall frame and scaled from there.
  const k = H / 900;
  const ch = 640 * k;
  const cw = (ch * 5) / 7;

  return {
    out,
    ctx,
    draw(p, bgTime, loopSec, sourceMs) {
      // The card's motion and light follow the tune; the defaults give the classic orbit.
      const pose = loopPose(tune, p);
      if (input.faceAt && animFace && animMask && sourceMs !== undefined) {
        input.faceAt(sourceMs, animFace, animMask);
        cards.setFace(animFace, animMask);
      }
      if (!transparent) bg.render({ time: bgTime, colors, pointer: [0.5, 0.5] });
      cards.begin();
      const { rx, ry } = pose;
      cards.drawCard(
        {
          cx: W / 2,
          cy: H / 2 + pose.dy * k,
          w: cw,
          h: ch,
          rx,
          ry,
          rz: pose.rz,
          scale: pose.scale,
          edition: input.edition.shader,
          intensity: input.intensity,
          pixel: PIXEL_STEPS[input.pixel] ?? 0,
          tilt: pose.tilt,
          light: pose.light,
          alpha: 1,
          flash: 0,
          shadow: [(12 - (tune.idle === 'spin' ? Math.sin(ry) : ry) * 18) * k, (18 + rx * 10) * k],
          loop: loopSec * tune.speed,
        },
        p * loopSec * tune.speed,
      );
      ctx.imageSmoothingEnabled = false;
      if (transparent) ctx.clearRect(0, 0, W, H);
      else ctx.drawImage(bgCanvas, 0, 0, W, H);
      ctx.drawImage(cardCanvas, 0, 0);
    },
    dispose() {
      bg.gl.getExtension('WEBGL_lose_context')?.loseContext();
      cards.gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

export function videoSupported(): string | null {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Records a 4-second loop: the card orbits once on the swirl backdrop. */
export async function exportVideo(input: ExportInput, onProgress?: (p: number) => void): Promise<string> {
  const mime = videoSupported();
  if (!mime) throw new Error('video-unsupported');
  const scene = createScene(input, 720, 900);

  const stream = scene.out.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));

  const DUR = 4;
  const t0 = performance.now();
  rec.start();
  for (let p = 0; p < 1; ) {
    await nextFrame();
    p = Math.min((performance.now() - t0) / 1000 / DUR, 1);
    scene.draw(p, 40 + p * 6, DUR, p * DUR * 1000);
    onProgress?.(p);
  }
  rec.stop();
  await done;
  scene.dispose();
  // Some encoders hand back nothing at all; fail loudly rather than saving an empty file.
  if (!chunks.length) throw new Error('video-empty');
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  return download(new Blob(chunks, { type: mime.split(';')[0] }), `${fileSafe(input.name)}-${input.edition.id}.${ext}`);
}

/**
 * Loop length for animated exports. An animated source sets it so its motion and the orbit
 * repeat together: short sources play whole cycles, and long ones are sped up to fit, so the
 * export always loops seamlessly. `sourceSpan` is the source time one loop covers.
 */
export function animLoop(sourceMs: number | undefined, fallbackMs: number): { loopMs: number; sourceSpan: number } {
  if (!sourceMs) return { loopMs: fallbackMs, sourceSpan: fallbackMs };
  const loopMs = Math.min(sourceMs * Math.ceil(1200 / sourceMs), 6000);
  return { loopMs, sourceSpan: sourceMs > 6000 ? sourceMs : loopMs };
}

const GIF_W = 480;
const GIF_H = 600;
const GIF_FRAMES = 48;
const GIF_DELAY = 50;
/** Share of the progress bar spent drawing frames; the worker's encode fills the rest. */
const GIF_DRAW_SHARE = 0.35;

/**
 * Renders the orbit frame by frame (not in real time) and encodes it in a worker.
 * One frame is drawn per animation frame, so the stage keeps moving throughout.
 */
export async function exportGif(
  input: ExportInput,
  onProgress?: (p: number, encoding: boolean) => void,
): Promise<string> {
  const worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' });
  const send = (m: GifRequest, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  const result = new Promise<ArrayBuffer>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<GifResponse>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(GIF_DRAW_SHARE + m.p * (1 - GIF_DRAW_SHARE), true);
      else if (m.type === 'done') resolve(m.data);
      else reject(new Error(m.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'gif-worker'));
  });
  // A worker failure mid-draw surfaces at the await below, not as an unhandled rejection.
  result.catch(() => {});

  const { loopMs, sourceSpan } = animLoop(input.loopMs, GIF_FRAMES * GIF_DELAY);
  const frames = Math.round(loopMs / GIF_DELAY);
  const DUR = (frames * GIF_DELAY) / 1000;
  let scene: Scene | undefined;
  try {
    scene = createScene(input, GIF_W, GIF_H, true);
    for (let i = 0; i < frames; i++) {
      await nextFrame();
      const p = i / frames;
      // The swirl barely breathes and returns to where it started, so the loop is seamless and
      // most of the backdrop stays identical between frames, which is what keeps the file small.
      scene.draw(p, 40 + Math.sin(p * Math.PI * 2) * 0.15, DUR, p * sourceSpan);
      const { data } = scene.ctx.getImageData(0, 0, GIF_W, GIF_H);
      send({ type: 'frame', data: data.buffer }, [data.buffer]);
      onProgress?.(((i + 1) / frames) * GIF_DRAW_SHARE, false);
    }
    send({ type: 'encode', width: GIF_W, height: GIF_H, delay: GIF_DELAY });
    const bytes = await result;
    return download(new Blob([bytes], { type: 'image/gif' }), `${fileSafe(input.name)}-${input.edition.id}.gif`);
  } finally {
    scene?.dispose();
    worker.terminate();
  }
}
