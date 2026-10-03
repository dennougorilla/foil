import { rarityById, type FrameId, type RarityId } from '../editions';

export const FACE_W = 900;
export const FACE_H = 1260;
/** Pixel literals below were tuned at 600px wide. */
const S = FACE_W / 600;

export interface Crop {
  zoom: number;
  /** Centre of the visible window, in 0..1 image coordinates. */
  x: number;
  y: number;
}

export interface FaceSpec {
  image: CanvasImageSource & { width: number; height: number };
  crop: Crop;
  frame: FrameId;
  rarity: RarityId;
  name: string;
}

const OUTLINE = '#161c1f';
const RADIUS = 0.075 * FACE_W;
const LINE = 0.016 * FACE_W;
const SIDE = 0.062 * FACE_W;
const TOP = 0.062 * FACE_W;
const BOTTOM = 0.17 * FACE_W;

/** Geometry of the art window within the face, in face pixels. */
export const ART = {
  x: SIDE,
  y: TOP,
  w: FACE_W - SIDE * 2,
  h: FACE_H - TOP - BOTTOM,
};
export const ART_ASPECT = ART.w / ART.h;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Visible source rectangle of the image for a crop, clamped inside the image. */
export function cropRect(imgW: number, imgH: number, crop: Crop) {
  let sw: number;
  let sh: number;
  if (imgW / imgH > ART_ASPECT) {
    sh = imgH / crop.zoom;
    sw = sh * ART_ASPECT;
  } else {
    sw = imgW / crop.zoom;
    sh = sw / ART_ASPECT;
  }
  const sx = Math.min(Math.max(crop.x * imgW - sw / 2, 0), imgW - sw);
  const sy = Math.min(Math.max(crop.y * imgH - sh / 2, 0), imgH - sh);
  return { sx, sy, sw, sh };
}

/** Pulls a crop centre back inside the range where the window still fits the image. */
export function clampCrop(imgW: number, imgH: number, crop: Crop): Crop {
  const r = cropRect(imgW, imgH, crop);
  return { zoom: crop.zoom, x: (r.sx + r.sw / 2) / imgW, y: (r.sy + r.sh / 2) / imgH };
}

function frameFill(ctx: CanvasRenderingContext2D, frame: FrameId, rarity: RarityId): { fill: string | CanvasGradient; ink: string; sub: string } {
  switch (frame) {
    case 'ink':
      return { fill: '#252c30', ink: '#f3eee2', sub: '#8a9a9c' };
    case 'gilt': {
      const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
      g.addColorStop(0, '#f7dc8b');
      g.addColorStop(0.35, '#d9a441');
      g.addColorStop(0.55, '#fbe7a6');
      g.addColorStop(0.8, '#b97f26');
      g.addColorStop(1, '#e9c46a');
      return { fill: g, ink: '#3b2408', sub: '#6e4a17' };
    }
    case 'rarity':
      return { fill: rarityById(rarity).color, ink: '#ffffff', sub: 'rgba(255,255,255,.75)' };
    default:
      return { fill: '#f3eee2', ink: '#262d31', sub: '#8d8a80' };
  }
}

function fitName(ctx: CanvasRenderingContext2D, text: string, max: number, size: number): number {
  let s = size;
  ctx.font = `${s}px "DotGothic16", monospace`;
  while (ctx.measureText(text).width > max && s > 16 * S) {
    s -= 2;
    ctx.font = `${s}px "DotGothic16", monospace`;
  }
  return s;
}

const RARITY_PIPS: Record<RarityId, number> = { common: 1, uncommon: 2, rare: 3, legendary: 4 };

export function drawFace(face: HTMLCanvasElement, mask: HTMLCanvasElement, spec: FaceSpec): void {
  face.width = FACE_W;
  face.height = FACE_H;
  mask.width = FACE_W;
  mask.height = FACE_H;
  const ctx = face.getContext('2d')!;
  ctx.clearRect(0, 0, FACE_W, FACE_H);

  // Outline silhouette
  ctx.fillStyle = OUTLINE;
  roundRect(ctx, 0, 0, FACE_W, FACE_H, RADIUS);
  ctx.fill();

  // Frame body
  const f = frameFill(ctx, spec.frame, spec.rarity);
  ctx.fillStyle = f.fill;
  roundRect(ctx, LINE, LINE, FACE_W - LINE * 2, FACE_H - LINE * 2, RADIUS - LINE);
  ctx.fill();
  // Bevel: a lighter top edge and a darker lower edge, like a printed card.
  ctx.save();
  roundRect(ctx, LINE, LINE, FACE_W - LINE * 2, FACE_H - LINE * 2, RADIUS - LINE);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(0, LINE, FACE_W, LINE * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  ctx.fillRect(0, FACE_H - LINE * 1.8, FACE_W, LINE * 0.8);
  ctx.restore();

  // Art window
  const artR = RADIUS * 0.45;
  ctx.fillStyle = OUTLINE;
  roundRect(ctx, ART.x - 4 * S, ART.y - 4 * S, ART.w + 8 * S, ART.h + 8 * S, artR + 4 * S);
  ctx.fill();
  ctx.save();
  roundRect(ctx, ART.x, ART.y, ART.w, ART.h, artR);
  ctx.clip();
  const { sx, sy, sw, sh } = cropRect(spec.image.width, spec.image.height, spec.crop);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(spec.image, sx, sy, sw, sh, ART.x, ART.y, ART.w, ART.h);
  // Inner shade so the art sits under the frame
  const shade = ctx.createLinearGradient(0, ART.y, 0, ART.y + 18 * S);
  shade.addColorStop(0, 'rgba(0,0,0,.28)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(ART.x, ART.y, ART.w, 18 * S);
  ctx.restore();

  // Nameplate
  const plateY = ART.y + ART.h + 4 * S;
  const plateH = FACE_H - LINE - plateY;
  const pipSize = 15 * S;
  const gap = 7 * S;
  const rim = 3 * S;
  const pips = RARITY_PIPS[spec.rarity];
  const pipsW = 4 * (pipSize + gap);
  const name = spec.name.trim() || ' ';
  fitName(ctx, name, ART.w - pipsW - 24 * S, 40 * S);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = f.ink;
  ctx.fillText(name, ART.x + 4 * S, plateY + plateH / 2 + S);
  // Rarity pips: diamonds in the rarity colour with a dark outline
  const rc = rarityById(spec.rarity).color;
  for (let i = 0; i < 4; i++) {
    // Four slots read left to right, filled up to the rarity, matching the tag.
    const cx = ART.x + ART.w - 6 * S - pipSize / 2 - (3 - i) * (pipSize + gap);
    const cy = plateY + plateH / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - pipSize / 2 - rim);
    ctx.lineTo(cx + pipSize / 2 + rim, cy);
    ctx.lineTo(cx, cy + pipSize / 2 + rim);
    ctx.lineTo(cx - pipSize / 2 - rim, cy);
    ctx.closePath();
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - pipSize / 2);
    ctx.lineTo(cx + pipSize / 2, cy);
    ctx.lineTo(cx, cy + pipSize / 2);
    ctx.lineTo(cx - pipSize / 2, cy);
    ctx.closePath();
    ctx.fillStyle = i < pips ? (spec.frame === 'rarity' ? '#ffffff' : rc) : f.sub;
    ctx.globalAlpha = i < pips ? 1 : 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Mask: red = art window, green = frame, blue = ink outline
  const m = mask.getContext('2d')!;
  m.clearRect(0, 0, FACE_W, FACE_H);
  m.fillStyle = '#0000ff';
  roundRect(m, 0, 0, FACE_W, FACE_H, RADIUS);
  m.fill();
  m.fillStyle = '#00ff00';
  roundRect(m, LINE, LINE, FACE_W - LINE * 2, FACE_H - LINE * 2, RADIUS - LINE);
  m.fill();
  m.fillStyle = '#ff0000';
  roundRect(m, ART.x, ART.y, ART.w, ART.h, artR);
  m.fill();
}

/** Card back: deep teal with a pixel diamond lattice and a star seal. */
export function drawBack(back: HTMLCanvasElement): void {
  back.width = FACE_W;
  back.height = FACE_H;
  const ctx = back.getContext('2d')!;
  ctx.fillStyle = OUTLINE;
  roundRect(ctx, 0, 0, FACE_W, FACE_H, RADIUS);
  ctx.fill();
  ctx.fillStyle = '#f3eee2';
  roundRect(ctx, LINE, LINE, FACE_W - LINE * 2, FACE_H - LINE * 2, RADIUS - LINE);
  ctx.fill();
  const ix = SIDE;
  const iy = SIDE;
  const iw = FACE_W - SIDE * 2;
  const ih = FACE_H - SIDE * 2;
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, RADIUS * 0.45);
  ctx.clip();
  ctx.fillStyle = '#c4382f';
  ctx.fillRect(ix, iy, iw, ih);
  const step = 36 * S;
  const dm = 12 * S;
  ctx.fillStyle = '#a82c25';
  for (let y = iy - step; y < iy + ih + step; y += step) {
    for (let x = ix - step; x < ix + iw + step; x += step) {
      const ox = ((y - iy) / step) % 2 ? step / 2 : 0;
      ctx.beginPath();
      ctx.moveTo(x + ox, y - dm);
      ctx.lineTo(x + ox + dm, y);
      ctx.lineTo(x + ox, y + dm);
      ctx.lineTo(x + ox - dm, y);
      ctx.fill();
    }
  }
  // Seal
  const cx = FACE_W / 2;
  const cy = FACE_H / 2;
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(cx, cy, 96 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f3eee2';
  ctx.beginPath();
  ctx.arc(cx, cy, 86 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c4382f';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 30 : 68) * S;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
