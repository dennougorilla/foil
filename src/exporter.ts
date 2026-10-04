import { FACE_H, FACE_W } from './card/face';
import { BackgroundRenderer, CardRenderer, hexToRgb, type RGB } from './gl/renderers';
import type { Edition } from './editions';
import type { GifRequest, GifResponse } from './gifWorker';
import { exportLoop, fixedLight, framePlan, loopView, TUNE_DEFAULTS, tuneGl, type Tune } from './tune/model';
import { stillPose } from './lettering';
import type { RangeSnapshot } from './gl/range';
import { AUTO_STILL, type TouchKind } from './touch/heat';
import { autoTouchFor } from './touch/busy';
import { TORCH_DRIFT, TORCH_STILL, torchAt } from './gl/torch';
import type { LayerMap } from './depth/layers';
import { packOf } from './packs';
import { loadPack } from './gl/finishes/registry';

/** A pack's finish draws once its pack's module has arrived (it usually has: the finish is in the hand). */
export async function packLoaded(edition: Edition): Promise<void> {
  const pack = packOf(edition.id);
  if (pack) await loadPack(pack.id);
}

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
  /** The Shadowbox sheets cut from the picture; 3D Lenticular reads their depth. */
  layers?: LayerMap;
  /** Flip Lenticular's other picture (card/face.ts drawFlip); the front one in pencil when absent. */
  flip?: HTMLCanvasElement;
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
  await packLoaded(input.edition);
  const pad = 24;
  const canvas = document.createElement('canvas');
  const r = new CardRenderer(canvas, { preserve: true, settled: true });
  const tune = input.tune ?? TUNE_DEFAULTS;
  r.tune = tuneGl(tune);
  r.setFace(input.face, input.mask);
  r.setBack(input.back);
  if (input.range) r.range.set(input.range);
  if (input.layers) r.setLayers(input.layers);
  r.setFlip(input.flip ?? null);
  r.resize(FACE_W + pad * 2, FACE_H + pad * 2, 1);
  r.begin();
  const tilt: [number, number] = [0.35, -0.25];
  // Blacklight's lamp shines on the art.
  const light: [number, number] = tune.light === 'fixed' ? fixedLight(tune.lightAngle) : input.edition.torch ? TORCH_STILL : [0.32, 0.22];
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
      // A finish that reacts to touch shows a swipe made for this picture, caught while it still shows.
      heat: input.edition.touch ? autoTouch(input.face, input.edition.touch) : undefined,
      // The light follows the tune; the tilt is nudged so foil or spot UV lettering catches it,
      // except on Flip Lenticular, where a nudge could land between its two pictures.
      ...(input.edition.id === 'lenticularflip' ? { tilt, light } : stillPose(tilt, light)),
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

function autoTouch(face: HTMLCanvasElement, kind: TouchKind) {
  const a = autoTouchFor(face, kind);
  a.at(3 + AUTO_STILL[kind]);
  return a;
}

export interface Scene {
  out: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Draws loop position p∈[0,1) of a loop `loopSec` long: the card as the stage shows it left alone, on the swirl backdrop. */
  draw(p: number, bgTime: number, loopSec: number, sourceMs?: number): void;
  dispose(): void;
}

/**
 * The shared stage for GIF and APNG: a pixel swirl upscaled nearest, with the card composited on top.
 * `transparent` leaves the swirl out so only the card (and its shadow, unless `shadow` is off) is drawn.
 */
export function createScene(input: ExportInput, W: number, H: number, readback = false, transparent = false, shadow = true): Scene {
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
  if (input.layers) cards.setLayers(input.layers, !input.faceAt);
  cards.setFlip(input.flip ?? null);
  cards.resize(W, H, 1);
  const colors = input.edition.swirl.map(hexToRgb) as [RGB, RGB, RGB];
  // Animated sources repaint their own face canvases so the live card is left alone.
  const animFace = input.faceAt ? document.createElement('canvas') : null;
  const animMask = input.faceAt ? document.createElement('canvas') : null;
  // Touch finishes get a finger that swipes the card once per loop, then lets it cool (seamless after a run-up).
  const kind = input.edition.touch;
  const touch = kind ? autoTouchFor(input.face, kind) : null;
  // Everything is laid out for a 900px-tall frame and scaled from there.
  const k = H / 900;
  const ch = 640 * k;
  const cw = (ch * 5) / 7;

  return {
    out,
    ctx,
    draw(p, bgTime, loopSec, sourceMs) {
      // The card's motion, sheen and light are the stage's at the same moment of its idle cycle.
      const { pose, tilt, light } = loopView(tune, p);
      const time = p * loopSec * tune.speed;
      if (input.faceAt && animFace && animMask && sourceMs !== undefined) {
        input.faceAt(sourceMs, animFace, animMask);
        cards.setFace(animFace, animMask);
      }
      if (kind) touch?.at(3 + (tune.speed <= 0 ? AUTO_STILL[kind] : p));
      if (!transparent) bg.render({ time: bgTime, colors, pointer: [0.5, 0.5] });
      cards.begin();
      // The shadow as the stage drops it, for a card 500 px tall.
      const u = ch / 500;
      const lift = (pose.scale - 1) * 120 - pose.dy * 300;
      cards.drawCard(
        {
          cx: W / 2 + pose.dx * ch,
          cy: H / 2 + pose.dy * ch,
          w: cw,
          h: ch,
          rx: pose.rx,
          ry: pose.ry + pose.spin,
          rz: pose.rz,
          scale: pose.scale,
          edition: input.edition.shader,
          intensity: input.intensity,
          pixel: PIXEL_STEPS[input.pixel] ?? 0,
          tilt,
          // Blacklight's lamp drifts round the art as on the stage (unless the tune fixes the light).
          light: input.edition.torch && tune.light !== 'fixed' ? torchAt(time / TORCH_DRIFT) : light,
          alpha: 1,
          flash: pose.flash,
          glint: pose.glint,
          beam: pose.beam,
          spot: pose.spot,
          dim: pose.dim,
          star: pose.star,
          shadow: shadow ? [(10 + lift * 0.3 - pose.ry * 18) * u, (16 + lift * 0.5 + pose.rx * 10) * u] : null,
          loop: loopSec * tune.speed,
          heat: touch ?? undefined,
        },
        time,
      );
      ctx.imageSmoothingEnabled = false;
      if (transparent) ctx.clearRect(0, 0, W, H);
      else {
        ctx.drawImage(bgCanvas, 0, 0, W, H);
        // A light motion's dim room takes the backdrop down with the card.
        if (pose.dim > 0) {
          ctx.fillStyle = `rgba(6, 8, 20, ${Math.min(0.88, pose.dim * 1.15)})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
      ctx.drawImage(cardCanvas, 0, 0);
    },
    dispose() {
      bg.gl.getExtension('WEBGL_lose_context')?.loseContext();
      cards.gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

const GIF_W = 480;
const GIF_H = 600;
/** Up to 20 fps, and at most this many frames: a slow loop plays at a lower frame rate rather than growing without end. */
const GIF_MIN_DELAY = 50;
const GIF_MAX_FRAMES = 90;
/** Share of the progress bar spent drawing frames; the worker's encode fills the rest. */
const GIF_DRAW_SHARE = 0.35;

export interface GifOptions {
  /**
   * Leave the backdrop out. GIF keeps one fully clear colour and nothing in between, so the
   * shadow is dropped and every edge pixel is either clear or solid.
   */
  clear: boolean;
  /** 'auto' keeps the card's own edge colour on solid edge pixels; a '#rrggbb' blends them into it. */
  matte: string;
}

/**
 * Renders the orbit frame by frame (not in real time) and encodes it in a worker.
 * One frame is drawn per animation frame, so the stage keeps moving throughout.
 */
export async function exportGif(
  input: ExportInput,
  onProgress?: (p: number, encoding: boolean) => void,
  opts: GifOptions = { clear: false, matte: 'auto' },
): Promise<string> {
  await packLoaded(input.edition);
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

  const { loopMs, sourceSpan } = exportLoop(input.tune ?? TUNE_DEFAULTS, input.loopMs);
  const delays = framePlan(loopMs, GIF_MIN_DELAY, GIF_MAX_FRAMES, 10);
  const frames = delays.length;
  const DUR = loopMs / 1000;
  let scene: Scene | undefined;
  try {
    scene = createScene(input, GIF_W, GIF_H, true, opts.clear, !opts.clear);
    for (let i = 0, at = 0; i < frames; at += delays[i++]) {
      await nextFrame();
      const p = at / loopMs;
      // The swirl barely breathes and returns to where it started, so the loop is seamless and
      // most of the backdrop stays identical between frames, which is what keeps the file small.
      scene.draw(p, 40 + Math.sin(p * Math.PI * 2) * 0.15, DUR, p * sourceSpan);
      const { data } = scene.ctx.getImageData(0, 0, GIF_W, GIF_H);
      send({ type: 'frame', data: data.buffer }, [data.buffer]);
      onProgress?.(((i + 1) / frames) * GIF_DRAW_SHARE, false);
    }
    const matte = opts.clear && opts.matte !== 'auto' ? hexToRgb(opts.matte).map((c) => Math.round(c * 255)) : null;
    send({ type: 'encode', width: GIF_W, height: GIF_H, delays, clear: opts.clear, matte: matte as [number, number, number] | null, dither: !!input.edition.dither });
    const bytes = await result;
    return download(new Blob([bytes], { type: 'image/gif' }), `${fileSafe(input.name)}-${input.edition.id}.gif`);
  } finally {
    scene?.dispose();
    worker.terminate();
  }
}
