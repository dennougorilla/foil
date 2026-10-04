// The trading-card layout: a name bar on top, the art, a type line, an effect box and a small
// footer, stacked down the face. Plain geometry, in face pixels, for a face of any size.

import type { Rect } from '../message';

export type CardLayout = 'classic' | 'tcg';
export const CARD_LAYOUTS: CardLayout[] = ['classic', 'tcg'];

export interface TcgFrame {
  name: Rect;
  art: Rect;
  /** Only when the card has a type line. */
  type: Rect | null;
  /** Only when the card has effect text. */
  effect: Rect | null;
  foot: Rect;
}

/** What the card holds: whether it has a type line, and how many lines of effect text (0 = none). */
export interface TcgContent {
  type: boolean;
  lines: number;
}

/**
 * Bars run the face's width inside a margin; their heights are shares of the face's height, and
 * the art takes what is left, so the stack fits a tall card, a square one or a wide one. The
 * parts follow what the card holds: no effect text, no box (the art runs down to the footer, as
 * on a full-art card); a short message, a short box; no type line, no bar.
 */
export function tcgFrame(W: number, H: number, c: TcgContent): TcgFrame {
  const S = Math.min(W, H) / 900;
  const m = 40 * S;
  const gap = 14 * S;
  const inset = 10 * S;
  const nameH = 0.072 * H;
  const typeH = 0.054 * H;
  const effectH = c.lines > 0 ? (0.1 + 0.03 * Math.min(c.lines, 4)) * H : 0;
  const footH = 0.034 * H;
  const w = W - m * 2;
  const name = { x: m, y: m, w, h: nameH };
  const foot = { x: m, y: H - 30 * S - footH, w, h: footH };
  let bottom = foot.y - gap;
  const effect = effectH ? { x: m, y: bottom - effectH, w, h: effectH } : null;
  if (effect) bottom = effect.y - gap;
  const type = c.type ? { x: m, y: bottom - typeH, w, h: typeH } : null;
  if (type) bottom = type.y - gap;
  const top = name.y + nameH + gap;
  const art = { x: m + inset, y: top, w: w - inset * 2, h: bottom - top };
  return { name, art, type, effect, foot };
}
