// Prints the card's message on the picture, and fetches its typefaces.

import { hexToRgb } from '../gl/gl';
import { letterFill, letteringOf, turnFor, type TextField, type TextRun } from '../lettering';
import type { FreeField, Placement } from '../arrange';
import { MESSAGE_FACES, layoutMessage, messageFont, messageLines, type Message, type MessageFont, type Rect } from '../message';

const OUTLINE = '#161c1f';
/** The message's own ink ('auto'): card white, which an outline keeps readable on any picture. */
const PAPER = '#fbf6ea';

const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

type Line = { text: string; x: number; y: number };
type Turn = Pick<TextRun, 'rot' | 'cx' | 'cy'>;

/**
 * Prints lines over the picture in a piece's flat colour, under an outline and a hard drop like
 * the rest of the app's type, turned about the piece's centre when it has a turn. A finish
 * without ink (a blind press, clear varnish) leaves only the lettering map.
 */
function outlined(ctx: CanvasRenderingContext2D, lines: Line[], font: string, size: number, field: TextField, turn: Turn) {
  const fill = letterFill(letteringOf(field), PAPER);
  if (!fill) return;
  ctx.save();
  turnFor(ctx, turn);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.2);
  const drop = Math.max(3, size * 0.08);
  ctx.strokeStyle = ctx.fillStyle = OUTLINE;
  for (const l of lines) {
    ctx.strokeText(l.text, l.x, l.y + drop);
    ctx.fillText(l.text, l.x, l.y + drop);
  }
  // Dark ink gets a light edge, so it still parts from a dark picture.
  ctx.strokeStyle = luma(fill) < 0.28 ? PAPER : OUTLINE;
  for (const l of lines) ctx.strokeText(l.text, l.x, l.y);
  ctx.fillStyle = fill;
  for (const l of lines) ctx.fillText(l.text, l.x, l.y);
  ctx.restore();
}

/** Paints the message at its preset place in the art window; returns its lines for the lettering map. */
export function paintMessage(ctx: CanvasRenderingContext2D, message: Message, art: Rect): TextRun[] {
  const measure = (text: string, size: number) => {
    ctx.font = messageFont(message.font, size);
    return ctx.measureText(text).width;
  };
  const layout = layoutMessage(messageLines(message.text), art, message.place, measure);
  if (!layout) return [];
  const { size } = layout;
  const font = messageFont(message.font, size);
  const lines = layout.lines.filter((l) => l.text);
  outlined(ctx, lines, font, size, 'message', {});
  return lines.map((l) => ({ part: 'message', text: l.text, font, size, x: l.x, y: l.y }));
}

/** Where each freely placed piece was last painted, in face uv: centre, size and turn (for dragging it). */
export interface FreeBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}
const free: Partial<Record<FreeField, FreeBox>> = {};
export const freeBox = (f: FreeField): FreeBox | undefined => free[f];

/** Line height of freely placed words, in type sizes. */
const FREE_LINE_H = 1.18;

/**
 * Paints a freely placed piece (docs/arrange.md): its lines centred on its place, at its size,
 * turned by its turn, printed like the message. Returns its lines for the lettering map.
 */
export function paintFree(ctx: CanvasRenderingContext2D, field: FreeField, texts: string[], fontAt: (size: number) => string, p: Placement): TextRun[] {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const size = Math.max(1, Math.round(p.size * Math.min(W, H)));
  const font = fontAt(size);
  const cx = p.x * W;
  const cy = p.y * H;
  ctx.font = font;
  const n = texts.length;
  const lines = texts.map((text, i) => {
    const w = ctx.measureText(text).width;
    return { text, w, x: cx - w / 2, y: cy + (i - (n - 1) / 2) * size * FREE_LINE_H };
  });
  free[field] = { x: p.x, y: p.y, w: Math.max(1, ...lines.map((l) => l.w)) / W, h: (size * (1 + (n - 1) * FREE_LINE_H)) / H, rot: p.rot };
  const shown = lines.filter((l) => l.text);
  const turn = { rot: p.rot, cx, cy };
  outlined(ctx, shown, font, size, field, turn);
  return shown.map((l) => ({ part: field, text: l.text, font, size, x: l.x, y: l.y, ...turn }));
}

const SHEET =
  'https://fonts.googleapis.com/css2?family=Yusei+Magic&family=Shippori+Mincho:wght@800&family=Mochiy+Pop+One&display=swap';
let sheet: Promise<void> | null = null;

/** Adds the typefaces' stylesheet once (the pixel face is already on the page). */
export function messageFonts(): Promise<void> {
  sheet ??= new Promise((done) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SHEET;
    link.onload = link.onerror = () => done();
    document.head.append(link);
  });
  return sheet;
}

/** Resolves once the glyphs of `text` in this typeface can be drawn (or failed to load: the fallback is drawn then). */
export async function loadMessageFont(font: MessageFont, text: string): Promise<void> {
  if (font !== 'dot') await messageFonts();
  const f = MESSAGE_FACES[font];
  await document.fonts.load(`${f.weight} 100px "${f.family}"`, text || 'A').catch(() => undefined);
}
