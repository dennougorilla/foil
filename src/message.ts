// The card's message: up to four short lines, printed on the picture at a
// preset place (the classic card) or as the effect text in its box (the
// trading-card layout, laid out by card/effect.ts), in one of a few typefaces.
// Plain data and layout only; the face painter draws it and the lettering
// finish prints it.

export type MessagePlace = 'top' | 'middle' | 'bottom';
export type MessageFont = 'dot' | 'hand' | 'serif' | 'pop';

export interface Message {
  /** Up to four lines, separated by '\n'. Empty = no message. */
  text: string;
  place: MessagePlace;
  font: MessageFont;
}

export const MESSAGE_PLACES: MessagePlace[] = ['top', 'middle', 'bottom'];
export const MESSAGE_FONTS: MessageFont[] = ['dot', 'hand', 'serif', 'pop'];
export const MESSAGE_MAX_LINES = 4;
export const MESSAGE_MAX_CHARS = 80;

/** Ready phrases, one tap each, in the panel's language. Mostly for any occasion. */
export const MESSAGE_PHRASES: Record<'ja' | 'en', string[]> = {
  ja: ['Happy\nBirthday', 'おたんじょうび\nおめでとう', 'ありがとう', 'おめでとう!', 'これからも\nよろしく'],
  en: ['Happy\nBirthday', 'Thank you', 'Congratulations', 'With love', 'Best wishes'],
};

export const DEFAULT_MESSAGE: Message = { text: '', place: 'top', font: 'dot' };

/** Canvas / CSS font of each typeface. All but the pixel face come from Google Fonts (SIL OFL). */
export const MESSAGE_FACES: Record<MessageFont, { family: string; weight: number; fallback: string }> = {
  dot: { family: 'DotGothic16', weight: 400, fallback: 'monospace' },
  hand: { family: 'Yusei Magic', weight: 400, fallback: 'cursive' },
  serif: { family: 'Shippori Mincho', weight: 800, fallback: 'serif' },
  pop: { family: 'Mochiy Pop One', weight: 400, fallback: 'sans-serif' },
};

export const messageFont = (font: MessageFont, size: number) => {
  const f = MESSAGE_FACES[font];
  return `${f.weight} ${size}px "${f.family}", ${f.fallback}`;
};

/** Keeps at most four lines (later ones join the last) and the length limit. */
export function cleanMessageText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const kept = lines.slice(0, MESSAGE_MAX_LINES - 1);
  if (lines.length >= MESSAGE_MAX_LINES) kept.push(lines.slice(MESSAGE_MAX_LINES - 1).join(' '));
  return Array.from(kept.join('\n')).slice(0, MESSAGE_MAX_CHARS).join('');
}

/** The lines to print: trimmed, with blank lines at either end dropped (a blank line between stays as a gap). */
export function messageLines(text: string): string[] {
  const lines = cleanMessageText(text)
    .split('\n')
    .map((l) => l.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/** Accepts anything (hand-edited storage, older saves) and returns a valid message. */
export function normalizeMessage(x: unknown): Message {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Record<keyof Message, unknown>>;
  const d = DEFAULT_MESSAGE;
  const place = MESSAGE_PLACES.includes(o.place as MessagePlace) ? (o.place as MessagePlace) : d.place;
  const font = MESSAGE_FONTS.includes(o.font as MessageFont) ? (o.font as MessageFont) : d.font;
  if (typeof o.text !== 'string') return { ...d };
  return { text: cleanMessageText(o.text), place, font };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MessageLayout {
  /** Font size in face pixels. */
  size: number;
  /** Each line's left edge, vertical middle and width. */
  lines: { text: string; x: number; y: number; w: number }[];
  /** The block the lines fill. */
  box: Rect;
}

/** Biggest size per line count, as a share of the art window's short side. */
const MAX_SIZE = [0.15, 0.125, 0.105, 0.09];
const LINE_H = 1.18;
/** Margins inside the art window: room for the outline and the drop. */
const SIDE = 0.07;
const EDGE = 0.07;

/**
 * Sizes and places the lines in the art window: as large as the place allows,
 * never wider than the picture, centred across it. `measure` gives a line's
 * width at a font size (text widths scale with it).
 */
export function layoutMessage(
  lines: string[],
  art: Rect,
  place: MessagePlace,
  measure: (text: string, size: number) => number,
): MessageLayout | null {
  if (!lines.length) return null;
  const short = Math.min(art.w, art.h);
  const n = lines.length;
  const REF = 100;
  const widest = Math.max(...lines.map((l) => measure(l, REF)), 1);
  const blockFor = (s: number) => s * (1 + (n - 1) * LINE_H);
  const room = art.h * (place === 'middle' ? 0.6 : 0.4);
  let size = Math.min(short * MAX_SIZE[n - 1], ((art.w * (1 - SIDE * 2)) / widest) * REF, room / blockFor(1));
  size = Math.max(1, Math.floor(size));
  const h = blockFor(size);
  const top =
    place === 'top' ? art.y + art.h * EDGE : place === 'bottom' ? art.y + art.h * (1 - EDGE) - h : art.y + (art.h - h) / 2;
  const cx = art.x + art.w / 2;
  const out = lines.map((text, i) => {
    const w = measure(text, size);
    return { text, x: cx - w / 2, y: top + size / 2 + i * size * LINE_H, w };
  });
  const bw = Math.max(...out.map((l) => l.w));
  return { size, lines: out, box: { x: cx - bw / 2, y: top, w: bw, h } };
}
