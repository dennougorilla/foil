import { rarityById, type FrameId, type RarityId } from '../editions';
import { paintLettering, type TextRun } from '../lettering';
import { messageLines, type Message, type Rect } from '../message';
import { customFrame } from '../palette';
import { paintMessage } from './messageFace';
import { artWindow, shapeById, SHORT, type ShapeId } from './shape';
import { tcgFrame, type CardLayout } from './tcg';
import { paintTcg } from './tcgFace';

/** Pixel literals below were tuned at 600px across the short side. */
export const S = SHORT / 600;

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
  /** Printed on the picture when it has any text. */
  message: Message;
  /** Whether the nameplate carries the name and the rarity; off leaves the band plain. */
  plate: boolean;
  /** The classic FOIL card, or a trading card with a type line and an effect box. */
  layout: CardLayout;
  /** The trading card's type line (any short words). */
  cardType: string;
}

export const OUTLINE = '#161c1f';
export const RADIUS = 0.075 * SHORT;
export const LINE = 0.016 * SHORT;

/** A face of this shape, its size in face pixels. */
function sized(canvas: HTMLCanvasElement, shape: ShapeId) {
  const { w, h } = shapeById(shape);
  canvas.width = w;
  canvas.height = h;
  return { W: w, H: h };
}

/** What a trading card holds, which decides its parts. */
export const tcgContent = (s: Pick<FaceSpec, 'cardType' | 'message'>) => ({ type: !!s.cardType.trim(), lines: messageLines(s.message.text).length });

/**
 * The art window of a card, in face pixels: the shape's classic one, or the trading card's for
 * what it holds (its parts take room from the art).
 */
export function faceArt(s: Pick<FaceSpec, 'shape' | 'layout' | 'cardType' | 'message'>): Rect {
  const { w, h } = shapeById(s.shape);
  return s.layout === 'tcg' ? tcgFrame(w, h, tcgContent(s)).art : artWindow(w, h);
}

/** Width / height of a card's art window: what a crop of the picture fills. */
export function artAspect(s: Pick<FaceSpec, 'shape' | 'layout' | 'cardType' | 'message'>): number {
  const a = faceArt(s);
  return a.w / a.h;
}

/** The art window each painted face was drawn with; a face drawn elsewhere (a pack's wrapper) has its shape's classic one. */
const arts = new WeakMap<HTMLCanvasElement, Rect>();
export const artOf = (face: HTMLCanvasElement): Rect => arts.get(face) ?? artWindow(face.width, face.height);

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export function fitName(ctx: CanvasRenderingContext2D, text: string, max: number, size: number): number {
  let s = size;
  ctx.font = `${s}px "DotGothic16", monospace`;
  while (ctx.measureText(text).width > max && s > 16 * S) {
    s -= 2;
    ctx.font = `${s}px "DotGothic16", monospace`;
  }
  return s;
}

export const ART_R = RADIUS * 0.45;

/** The picture cropped into the art window, under the frame's inner shade. */
export function paintArt(ctx: CanvasRenderingContext2D, art: Rect, image: FaceSpec['image'], crop: Crop, rad = ART_R) {
  ctx.save();
  roundRect(ctx, art.x, art.y, art.w, art.h, rad);
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

/** Flip Lenticular's other picture: centred and cropped to fill the card's art window, the rest left clear. */
export function drawFlip(flip: HTMLCanvasElement, image: FaceSpec['image'], shape: ShapeId, art: Rect): void {
  const { W, H } = sized(flip, shape);
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

/** The four rarity diamonds, ending at `right` and centred on `cy`: the rarity colour with a dark outline. */
export function paintPips(ctx: CanvasRenderingContext2D, spec: FaceSpec, right: number, cy: number, pipSize = 15 * S) {
  const gap = 7 * S;
  const rim = 3 * S;
  const pips = RARITY_PIPS[spec.rarity];
  const rc = rarityById(spec.rarity).color;
  for (let i = 0; i < 4; i++) {
    // Four slots read left to right, filled up to the rarity, matching the tag.
    const cx = right - pipSize / 2 - (3 - i) * (pipSize + gap);
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
}

/** Paints the face and its mask; returns the text it printed, for the lettering map (`setTextRuns`). */
export function drawFace(face: HTMLCanvasElement, mask: HTMLCanvasElement, spec: FaceSpec): TextRun[] {
  const { W, H } = sized(face, spec.shape);
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

  const art = faceArt(spec);
  arts.set(face, art);
  const classic = spec.layout !== 'tcg';
  const runs = classic ? paintClassic(ctx, spec, f, frame, art, H) : paintTcg(ctx, spec, f);

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
  if (classic && frame === 'ribbon') paintRibbon(m, '#00ff00');
  return runs;
}

/**
 * The classic card: the art window framed in ink (in gold under the Gold rim, whose gold rule runs
 * inside the edge), the message on the picture, the Ribbon over its corner, and the nameplate under it.
 * The trading card draws its own frame stock and plates, so the rim's rule and the ribbon are the
 * classic card's alone.
 */
function paintClassic(ctx: CanvasRenderingContext2D, spec: FaceSpec, f: { ink: string }, frame: FrameId | null, art: Rect, H: number): TextRun[] {
  const W = ctx.canvas.width;
  if (frame === 'rim') {
    const inset = LINE + 8 * S;
    ctx.strokeStyle = brass(ctx, W, H);
    ctx.lineWidth = 4 * S;
    roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, RADIUS - inset);
    ctx.stroke();
  }
  ctx.fillStyle = frame === 'rim' ? brass(ctx, W, H) : OUTLINE;
  roundRect(ctx, art.x - 4 * S, art.y - 4 * S, art.w + 8 * S, art.h + 8 * S, ART_R + 4 * S);
  ctx.fill();
  paintArt(ctx, art, spec.image, spec.crop);
  const runs = paintMessage(ctx, spec.message, art);
  if (frame === 'ribbon') paintRibbon(ctx);

  // Nameplate (left plain when it is turned off)
  const plateY = art.y + art.h + 4 * S;
  const plateH = H - LINE - plateY;
  const pipsW = 4 * (15 * S + 7 * S);
  const name = spec.name.trim() || ' ';
  const size = fitName(ctx, name, art.w - pipsW - 24 * S, 40 * S);
  if (spec.plate) {
    runs.push({ part: 'name', text: name, font: ctx.font, size, x: art.x + 4 * S, y: plateY + plateH / 2 + S, stock: plateY + plateH / 2 + S - 0.0588 * SHORT });
    paintLettering(ctx, name, art.x + 4 * S, plateY + plateH / 2 + S, f.ink);
    paintPips(ctx, spec, art.x + art.w - 6 * S, plateY + plateH / 2);
  }
  return runs;
}
