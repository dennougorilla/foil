import { rarityById, type FrameId, type RarityId } from '../editions';
import { paintLettering } from '../lettering';
import { customFrame } from '../palette';
import { artWindow, shapeById, SHORT, type ShapeId } from './shape';

/** Pixel literals below were tuned at 600px across the short side. */
const S = SHORT / 600;

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
  /** Custom frame colour ('#rrggbb'); overrides the frame preset when set. */
  frameColor?: string;
  shape: ShapeId;
}

const OUTLINE = '#161c1f';
const RADIUS = 0.075 * SHORT;
const LINE = 0.016 * SHORT;

/** A face of this shape, its size and its art window, in face pixels. */
function sized(canvas: HTMLCanvasElement, shape: ShapeId) {
  const { w, h } = shapeById(shape);
  canvas.width = w;
  canvas.height = h;
  return { W: w, H: h, art: artWindow(w, h) };
}

/** Width / height of a shape's art window: what a crop of the picture fills. */
export function artAspect(shape: ShapeId): number {
  const { w, h } = shapeById(shape);
  const a = artWindow(w, h);
  return a.w / a.h;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Visible source rectangle of the image for a crop into an art window `aspect` wide (width / height), clamped inside the image. */
export function cropRect(imgW: number, imgH: number, crop: Crop, aspect: number) {
  let sw: number;
  let sh: number;
  if (imgW / imgH > aspect) {
    sh = imgH / crop.zoom;
    sw = sh * aspect;
  } else {
    sw = imgW / crop.zoom;
    sh = sw / aspect;
  }
  const sx = Math.min(Math.max(crop.x * imgW - sw / 2, 0), imgW - sw);
  const sy = Math.min(Math.max(crop.y * imgH - sh / 2, 0), imgH - sh);
  return { sx, sy, sw, sh };
}

/** Pulls a crop centre back inside the range where the window still fits the image. */
export function clampCrop(imgW: number, imgH: number, crop: Crop, aspect: number): Crop {
  const r = cropRect(imgW, imgH, crop, aspect);
  return { zoom: crop.zoom, x: (r.sx + r.sw / 2) / imgW, y: (r.sy + r.sh / 2) / imgH };
}

/** A brass gradient across the face, for the Brass frame and the Gold rim's rules. */
function brass(ctx: CanvasRenderingContext2D, W: number, H: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f7dc8b');
  g.addColorStop(0.35, '#d9a441');
  g.addColorStop(0.55, '#fbe7a6');
  g.addColorStop(0.8, '#b97f26');
  g.addColorStop(1, '#e9c46a');
  return g;
}

function frameFill(ctx: CanvasRenderingContext2D, frame: FrameId, rarity: RarityId, W: number, H: number): { fill: string | CanvasGradient; ink: string; sub: string } {
  switch (frame) {
    case 'ink':
      return { fill: '#252c30', ink: '#f3eee2', sub: '#8a9a9c' };
    case 'gilt':
      return { fill: brass(ctx, W, H), ink: '#3b2408', sub: '#6e4a17' };
    case 'rarity':
      return { fill: rarityById(rarity).color, ink: '#ffffff', sub: 'rgba(255,255,255,.75)' };
    case 'rim':
      return { fill: '#fbf7ee', ink: '#4a3312', sub: '#9c8456' };
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

const ART_R = RADIUS * 0.45;
type Rect = { x: number; y: number; w: number; h: number };

/** The picture cropped into the art window, under the frame's inner shade. */
function paintArt(ctx: CanvasRenderingContext2D, art: Rect, image: FaceSpec['image'], crop: Crop) {
  ctx.save();
  roundRect(ctx, art.x, art.y, art.w, art.h, ART_R);
  ctx.clip();
  const { sx, sy, sw, sh } = cropRect(image.width, image.height, crop, art.w / art.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, art.x, art.y, art.w, art.h);
  // Inner shade so the art sits under the frame
  const shade = ctx.createLinearGradient(0, art.y, 0, art.y + 18 * S);
  shade.addColorStop(0, 'rgba(0,0,0,.28)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(art.x, art.y, art.w, 18 * S);
  ctx.restore();
}

/** Flip Lenticular's other picture: centred and cropped to fill the art window, the rest left clear. */
export function drawFlip(flip: HTMLCanvasElement, image: FaceSpec['image'], shape: ShapeId): void {
  const { W, H, art } = sized(flip, shape);
  const ctx = flip.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  paintArt(ctx, art, image, { zoom: 1, x: 0.5, y: 0.5 });
}

/**
 * The Ribbon frame's satin ribbon, tied across the top-left corner: a band from the top edge to
 * the left one with a bow where it crosses the art's corner. With `flat` it paints that colour
 * only (the mask's frame green), so the finish treats the ribbon as frame.
 */
function paintRibbon(ctx: CanvasRenderingContext2D, flat?: string) {
  const reach = 0.3 * SHORT;
  const band = 0.07 * SHORT;
  // The bow sits on the band, where it crosses the art window's corner.
  const bow = reach / 2;
  const B = S * 0.85;
  ctx.save();
  roundRect(ctx, LINE, LINE, SHORT, SHORT, RADIUS - LINE);
  ctx.clip();
  // The band: a strip along the diagonal x + y = reach, edged in ink.
  const strip = (grow: number) => {
    const d = (band / 2 + grow) * Math.SQRT2;
    ctx.beginPath();
    ctx.moveTo(reach - d, 0);
    ctx.lineTo(reach + d, 0);
    ctx.lineTo(0, reach + d);
    ctx.lineTo(0, reach - d);
    ctx.closePath();
  };
  strip(3 * S);
  ctx.fillStyle = flat ?? OUTLINE;
  ctx.fill();
  strip(0);
  if (flat) ctx.fillStyle = flat;
  else {
    // Satin: dark at the edges, a soft light down the middle of the band.
    const c = reach / 2;
    const o = band / 2 / Math.SQRT2;
    const g = ctx.createLinearGradient(c - o, c - o, c + o, c + o);
    g.addColorStop(0, '#8e1f2a');
    g.addColorStop(0.35, '#d23a45');
    g.addColorStop(0.5, '#f07a80');
    g.addColorStop(0.65, '#d23a45');
    g.addColorStop(1, '#8e1f2a');
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.restore();

  // The bow: two tails and two loops round a knot, each edged in ink.
  const piece = (pts: [number, number][], fill: string, edge = true) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(bow + x * B, bow + y * B) : ctx.moveTo(bow + x * B, bow + y * B)));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6 * B;
    if (edge) {
      ctx.strokeStyle = flat ?? OUTLINE;
      ctx.stroke();
    }
    ctx.fillStyle = flat ?? fill;
    ctx.fill();
  };
  piece([[4, 4], [40, 34], [48, 62], [34, 66], [22, 44], [-2, 10]], '#b52a35');
  piece([[4, 4], [34, 40], [62, 48], [66, 34], [44, 22], [10, -2]], '#b52a35');
  piece([[0, 0], [-36, -12], [-52, -34], [-38, -46], [-12, -36]], '#e2505a');
  piece([[0, 0], [-12, -36], [-34, -52], [-46, -38], [-36, -12]], '#e2505a');
  if (!flat) {
    // Light inside each loop.
    piece([[-10, -10], [-30, -18], [-38, -32], [-30, -36], [-16, -28]], '#f6a2a6', false);
    piece([[-10, -10], [-18, -30], [-32, -38], [-36, -30], [-28, -16]], '#f6a2a6', false);
  }
  piece([[-11, -2], [-2, -11], [11, 2], [2, 11]], '#c8323a');
}

const RARITY_PIPS: Record<RarityId, number> = { common: 1, uncommon: 2, rare: 3, legendary: 4 };

export function drawFace(face: HTMLCanvasElement, mask: HTMLCanvasElement, spec: FaceSpec): void {
  const { W, H, art } = sized(face, spec.shape);
  sized(mask, spec.shape);
  const ctx = face.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  // Outline silhouette
  ctx.fillStyle = OUTLINE;
  roundRect(ctx, 0, 0, W, H, RADIUS);
  ctx.fill();

  // Frame body (a custom colour is a plain frame in that colour)
  const frame = spec.frameColor ? null : spec.frame;
  const f = spec.frameColor ? customFrame(spec.frameColor) : frameFill(ctx, spec.frame, spec.rarity, W, H);
  ctx.fillStyle = f.fill;
  roundRect(ctx, LINE, LINE, W - LINE * 2, H - LINE * 2, RADIUS - LINE);
  ctx.fill();
  // Bevel: a lighter top edge and a darker lower edge, like a printed card.
  ctx.save();
  roundRect(ctx, LINE, LINE, W - LINE * 2, H - LINE * 2, RADIUS - LINE);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(0, LINE, W, LINE * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  ctx.fillRect(0, H - LINE * 1.8, W, LINE * 0.8);
  ctx.restore();

  // Gold rim: a thin gold rule inside the edge, and the art window edged in gold rather than ink.
  if (frame === 'rim') {
    const inset = LINE + 8 * S;
    ctx.strokeStyle = brass(ctx, W, H);
    ctx.lineWidth = 4 * S;
    roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, RADIUS - inset);
    ctx.stroke();
  }

  // Art window
  ctx.fillStyle = frame === 'rim' ? brass(ctx, W, H) : OUTLINE;
  roundRect(ctx, art.x - 4 * S, art.y - 4 * S, art.w + 8 * S, art.h + 8 * S, ART_R + 4 * S);
  ctx.fill();
  paintArt(ctx, art, spec.image, spec.crop);
  if (frame === 'ribbon') paintRibbon(ctx);

  // Nameplate
  const plateY = art.y + art.h + 4 * S;
  const plateH = H - LINE - plateY;
  const pipSize = 15 * S;
  const gap = 7 * S;
  const rim = 3 * S;
  const pips = RARITY_PIPS[spec.rarity];
  const pipsW = 4 * (pipSize + gap);
  const name = spec.name.trim() || ' ';
  fitName(ctx, name, art.w - pipsW - 24 * S, 40 * S);
  paintLettering(ctx, name, art.x + 4 * S, plateY + plateH / 2 + S, f.ink);
  // Rarity pips: diamonds in the rarity colour with a dark outline
  const rc = rarityById(spec.rarity).color;
  for (let i = 0; i < 4; i++) {
    // Four slots read left to right, filled up to the rarity, matching the tag.
    const cx = art.x + art.w - 6 * S - pipSize / 2 - (3 - i) * (pipSize + gap);
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
    ctx.fillStyle = i < pips ? (spec.frame === 'rarity' ? '#ffffff' : rc) : spec.frame === 'ink' ? '#3a4448' : '#e9e4d6';
    ctx.fill();
  }

  // Mask: red = art window, green = frame, blue = ink outline
  const m = mask.getContext('2d')!;
  m.clearRect(0, 0, W, H);
  m.fillStyle = '#0000ff';
  roundRect(m, 0, 0, W, H, RADIUS);
  m.fill();
  m.fillStyle = '#00ff00';
  roundRect(m, LINE, LINE, W - LINE * 2, H - LINE * 2, RADIUS - LINE);
  m.fill();
  m.fillStyle = '#ff0000';
  roundRect(m, art.x, art.y, art.w, art.h, ART_R);
  m.fill();
  if (frame === 'ribbon') paintRibbon(m, '#00ff00');
}
