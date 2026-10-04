// Prints the card's message on the picture, and fetches its typefaces.

import { hexToRgb } from '../gl/gl';
import { getLettering, letterFill, type TextRun } from '../lettering';
import { MESSAGE_FACES, layoutMessage, messageFont, messageLines, type Message, type MessageFont, type Rect } from '../message';

const OUTLINE = '#161c1f';
/** The message's own ink ('auto'): card white, which an outline keeps readable on any picture. */
const PAPER = '#fbf6ea';

const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Paints the message into the art window in the lettering's flat colour, under
 * an outline and a hard drop like the rest of the app's type, and returns its
 * lines for the lettering map. A finish without ink (a blind press, clear
 * varnish) leaves only the map.
 */
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
  const fill = letterFill(getLettering(), PAPER);
  if (fill) {
    ctx.save();
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
  return lines.map((l) => ({ part: 'message', text: l.text, font, size, x: l.x, y: l.y }));
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
