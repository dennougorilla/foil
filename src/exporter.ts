import { exportFrame } from './card/shape';
import { BackgroundRenderer, CardRenderer, hexToRgb, type LayerDraw, type RGB } from './gl/renderers';
import type { Edition } from './editions';
import type { GifRequest, GifResponse } from './gifWorker';
import { exportLoop, fixedLight, framePlan, lampLights, loopCycle, loopView, roomShade, TUNE_DEFAULTS, tuneGl, type Tune } from './tune/model';
// Every motion, so a file can be made with any of them.
import './tune/moves';
import { GIF_SAVE, type GifSize } from './exportSize';
import { stillPose } from './lettering';
import type { RangeSnapshot } from './gl/range';
import { AUTO_STILL, type TouchKind } from './touch/heat';
import { autoTouchFor } from './touch/busy';
import { TORCH_DRIFT, TORCH_IDLE, TORCH_STILL, torchAt } from './gl/torch';
import type { LayerMap } from './depth/layers';
import { packOf } from './packs';
import { loadPack } from './gl/finishes/registry';

/** A pack's finish draws once its pack's module has arrived (it usually has: the finish is in the hand). */
async function packLoaded(edition: Edition): Promise<void> {
  const pack = packOf(edition.id);
  if (pack) await loadPack(pack.id);
}

/** Both layers' finishes have arrived. */
export const packsLoaded = (input: ExportInput) => Promise.all([input.edition, input.layer?.edition].map((e) => e && packLoaded(e)));

export interface ExportInput {
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  back: HTMLCanvasElement;
  edition: Edition;
  /** Layer 2 (docs/layering.md): its finish, how it is drawn, and its area. */
  layer?: { edition: Edition; draw: LayerDraw; range: RangeSnapshot };
  intensity: number;
  /** Pixel art's grid across the card's short side, 0 = off (the face is already drawn on it). */
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

export const fileSafe = (s: string) => (s.trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'card');

export const nextFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));

/**
 * The swirl's time at loop position p: it barely breathes and returns to where it started, so the
 * loop is seamless and most of the backdrop stays identical between frames, which keeps the file small.
 */
export const swirlAt = (p: number) => 40 + Math.sin(p * Math.PI * 2) * 0.15;

/** Saves a made file through the browser's download; answers with its name. */
export function download(file: File): string {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return file.name;
}

/** Clear margin round the still card, so its tilted edge and glow are not cut. */
const STILL_PAD = 24;

/** The card drawn once (the binder's thumbnail) at the face texture's native resolution (plus STILL_PAD all round), with a sheen frozen mid-tilt. */
export async function renderStill(input: ExportInput): Promise<HTMLCanvasElement> {
  await packsLoaded(input);
  const pad = STILL_PAD;
  const canvas = document.createElement('canvas');
  const r = new CardRenderer(canvas, { preserve: true, settled: true });
  const tune = input.tune ?? TUNE_DEFAULTS;
  r.tune = tuneGl(tune);
  r.setFace(input.face, input.mask);
  r.setBack(input.back);
  if (input.range) r.range.set(input.range);
  if (input.layer) r.range2.set(input.layer.range);
  if (input.layers) r.setLayers(input.layers);
  r.setFlip(input.flip ?? null);
  const W = input.face.width;
  const H = input.face.height;
  r.resize(W + pad * 2, H + pad * 2, 1);
  r.begin();
  const tilt: [number, number] = [0.35, -0.25];
  // Blacklight's lamp shines on the art.
  const light: [number, number] = tune.light === 'fixed' ? fixedLight(tune.lightAngle) : input.edition.torch ? TORCH_STILL : [0.32, 0.22];
  r.drawCard(
    {
      cx: W / 2 + pad,
      cy: H / 2 + pad,
      w: W,
      h: H,
      rx: 0,
      ry: 0,
      rz: 0,
      scale: 1,
      edition: input.edition.shader,
      intensity: input.intensity,
      pixel: input.pixel,
      // A finish that reacts to touch shows a swipe made for this picture, caught while it still shows.
      heat: input.edition.touch ? autoTouch(input.face, input.edition.touch) : undefined,
      // The light follows the tune; the tilt is nudged so foil or spot UV lettering catches it,
      // except on Flip Lenticular, where a nudge could land between its two pictures.
      ...(input.edition.id === 'lenticularflip' ? { tilt, light } : stillPose(tilt, light)),
      alpha: 1,
      flash: 0,
      shadow: [0, 0],
      layer: input.layer?.draw,
    },
    1.7,
  );
  // Copied out, so the GL context can go at once.
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  r.gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
}

function autoTouch(face: HTMLCanvasElement, kind: TouchKind) {
  const a = autoTouchFor(face, kind);
  a.at(3 + AUTO_STILL[kind]);
  return a;
}

export interface Scene {
  out: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Draws loop position p∈[0,1) of the motion's loop: the card as the stage shows it left alone, on the swirl backdrop. */
  draw(p: number, bgTime: number, sourceMs?: number): void;
  dispose(): void;
}

/**
 * The shared stage for GIF, APNG and MP4: a pixel swirl upscaled nearest, with the card composited on top.
 * `W0` × `H0` is the frame for the trading card; other shapes turn and resize it (shape.ts
 * exportFrame), so `out` has the frame's real size. The swirl's pixels grow with a frame taller than the
 * GIF's, so it is as coarse next to the card in every file.
 * `transparent` leaves the swirl out so only the card (and its shadow, unless `shadow` is off) is drawn.
 */
export function createScene(input: ExportInput, W0: number, H0: number, readback = false, transparent = false, shadow = true): Scene {
  const { W, H, cw, ch } = exportFrame(input.face.height / input.face.width, W0, H0);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d', { willReadFrequently: readback })!;
  const bgCanvas = document.createElement('canvas');
  const bg = new BackgroundRenderer(bgCanvas);
  const block = Math.max(4, Math.round((4 * H0) / 600));
  bg.resize(W / block, H / block);
  const cardCanvas = document.createElement('canvas');
  const cards = new CardRenderer(cardCanvas, { settled: true });
  const tune = input.tune ?? TUNE_DEFAULTS;
  cards.tune = tuneGl(tune);
  cards.setFace(input.face, input.mask);
  cards.setBack(input.back);
  if (input.range) cards.range.set(input.range);
  if (input.layer) cards.range2.set(input.layer.range);
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
  const torch = !!input.edition.torch;

  return {
    out,
    ctx,
    draw(p, bgTime, sourceMs) {
      // The card's motion, sheen and light: the stage's, left alone, at the same moment of its loop.
      const { s: time, pose, tilt, light } = loopView(tune, p, torch);
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
          pixel: input.pixel,
          tilt,
          // Blacklight's lamp drifts round the art as on the stage (unless the tune fixes the light).
          // Blacklight's lamp drifts round the art, as dim as on the stage left alone (unless the tune fixes the light).
          light: lampLights(tune, torch) ? torchAt(time / TORCH_DRIFT) : light,
          lamp: torch ? TORCH_IDLE : undefined,
          alpha: 1,
          flash: pose.flash,
          glint: pose.glint,
          beam: pose.beam,
          spot: pose.spot,
          dim: pose.dim,
          star: pose.star,
          shadow: shadow ? [(10 + lift * 0.3 - pose.ry * 18) * u, (16 + lift * 0.5 + pose.rx * 10) * u] : null,
          // The finishes' own motion closes on the loop, as on the stage.
          loop: tune.speed > 0 ? loopCycle(tune, torch) : 0,
          heat: touch ?? undefined,
          layer: input.layer?.draw,
        },
        time,
      );
      ctx.imageSmoothingEnabled = false;
      if (transparent) ctx.clearRect(0, 0, W, H);
      else {
        ctx.drawImage(bgCanvas, 0, 0, W, H);
        // A Light motion's dim room takes the backdrop down with the card, as on the stage.
        if (pose.dim) {
          ctx.fillStyle = `rgba(6, 8, 20, ${roomShade(pose.dim)})`;
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
  /** The saved size when left out. */
  size?: GifSize;
}

/**
 * Renders the orbit frame by frame (not in real time) and encodes it in a worker.
 * One frame is drawn per animation frame, so the stage keeps moving throughout.
 */
export async function exportGif(
  input: ExportInput,
  onProgress?: (p: number, encoding: boolean) => void,
  opts: GifOptions = { clear: false, matte: 'auto' },
): Promise<File> {
  await packsLoaded(input);
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

  const size = opts.size ?? GIF_SAVE;
  const { loopMs, sourceSpan } = exportLoop(input.tune ?? TUNE_DEFAULTS, input.loopMs, !!input.edition.torch);
  const delays = framePlan(loopMs, size.delay, size.maxFrames, 10);
  const frames = delays.length;
  let scene: Scene | undefined;
  try {
    scene = createScene(input, size.w, size.h, true, opts.clear, !opts.clear);
    const { width, height } = scene.out;
    for (let i = 0, at = 0; i < frames; at += delays[i++]) {
      await nextFrame();
      const p = at / loopMs;
      scene.draw(p, swirlAt(p), p * sourceSpan);
      const { data } = scene.ctx.getImageData(0, 0, width, height);
      send({ type: 'frame', data: data.buffer }, [data.buffer]);
      onProgress?.(((i + 1) / frames) * GIF_DRAW_SHARE, false);
    }
    const matte = opts.clear && opts.matte !== 'auto' ? hexToRgb(opts.matte).map((c) => Math.round(c * 255)) : null;
    send({ type: 'encode', width, height, delays, clear: opts.clear, matte: matte as [number, number, number] | null, dither: !!(input.edition.dither || input.layer?.edition.dither) });
    const bytes = await result;
    return new File([bytes], `${fileSafe(input.name)}-${input.edition.id}.gif`, { type: 'image/gif' });
  } finally {
    scene?.dispose();
    worker.terminate();
  }
}
