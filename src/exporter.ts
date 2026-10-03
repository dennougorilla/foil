import { FACE_H, FACE_W } from './card/face';
import { BackgroundRenderer, CardRenderer, hexToRgb, type RGB } from './gl/renderers';
import type { Edition } from './editions';

export interface ExportInput {
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  back: HTMLCanvasElement;
  edition: Edition;
  intensity: number;
  pixel: number;
  name: string;
}

const PIXEL_STEPS = [0, 96, 72, 56, 44, 34, 26];

const fileSafe = (s: string) => (s.trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'card');

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** A flat, transparent PNG at the face texture's native resolution, with a sheen frozen mid-tilt. */
export async function exportPng(input: ExportInput): Promise<void> {
  const pad = 24;
  const canvas = document.createElement('canvas');
  const r = new CardRenderer(canvas, { preserve: true });
  r.setFace(input.face, input.mask);
  r.setBack(input.back);
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
      tilt: [0.35, -0.25],
      light: [0.32, 0.22],
      alpha: 1,
      flash: 0,
      shadow: [0, 0],
    },
    1.7,
  );
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  r.gl.getExtension('WEBGL_lose_context')?.loseContext();
  if (!blob) throw new Error('png');
  download(blob, `${fileSafe(input.name)}-${input.edition.id}.png`);
}

export function videoSupported(): string | null {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Records a 4-second loop: the card orbits once on the swirl backdrop. */
export async function exportVideo(input: ExportInput, onProgress?: (p: number) => void): Promise<void> {
  const mime = videoSupported();
  if (!mime) throw new Error('video-unsupported');
  const W = 720;
  const H = 900;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  const bgCanvas = document.createElement('canvas');
  const bg = new BackgroundRenderer(bgCanvas);
  bg.resize(W / 4, H / 4);
  const cardCanvas = document.createElement('canvas');
  const cards = new CardRenderer(cardCanvas);
  cards.setFace(input.face, input.mask);
  cards.setBack(input.back);
  cards.resize(W, H, 1);
  const colors = input.edition.swirl.map(hexToRgb) as [RGB, RGB, RGB];

  const stream = out.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));

  const DUR = 4;
  const ch = 640;
  const cw = (ch * 5) / 7;
  const t0 = performance.now();
  rec.start();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const p = Math.min(t / DUR, 1);
      const a = p * Math.PI * 2;
      bg.render({ time: 40 + p * 6, colors, pointer: [0.5, 0.5] });
      cards.begin();
      const rx = Math.sin(a) * 0.22;
      const ry = Math.cos(a) * 0.3;
      cards.drawCard(
        {
          cx: W / 2,
          cy: H / 2 + Math.sin(a * 2) * 8,
          w: cw,
          h: ch,
          rx,
          ry,
          rz: Math.sin(a) * 0.03,
          scale: 1,
          edition: input.edition.shader,
          intensity: input.intensity,
          pixel: PIXEL_STEPS[input.pixel] ?? 0,
          tilt: [ry / 0.32, rx / 0.28],
          light: [0.5 - Math.cos(a) * 0.3, 0.4 - Math.sin(a) * 0.25],
          alpha: 1,
          flash: 0,
          shadow: [12 - ry * 18, 18 + rx * 10],
        },
        p * DUR,
      );
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bgCanvas, 0, 0, W, H);
      ctx.drawImage(cardCanvas, 0, 0);
      onProgress?.(p);
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  bg.gl.getExtension('WEBGL_lose_context')?.loseContext();
  cards.gl.getExtension('WEBGL_lose_context')?.loseContext();
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mime.split(';')[0] }), `${fileSafe(input.name)}-${input.edition.id}.${ext}`);
}
