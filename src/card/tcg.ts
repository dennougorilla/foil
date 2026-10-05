// The trading-card layout: a name bar on top, the art, a type line, an effect box and a small
// footer, stacked down the face; on a wide face the type line and the effect box stand beside the
// art instead. Plain geometry, in face pixels, for a face of any size (docs/tcg.md).

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
  /**
   * Where the effect text is set: the effect box itself, or on a wide card the top of its tall box,
   * as tall as an upright card's box for the same lines (so the text reads at the same size, under the type line).
   */
  text: Rect | null;
  foot: Rect;
}

/** What the card holds: whether it has a type line, and how many lines of effect text (0 = none). */
export interface TcgContent {
  type: boolean;
  lines: number;
}

/** Share of a wide card's inner width the column of words takes, beside the art. */
const COLUMN = 0.44;

/**
 * Bars run the face's width inside a margin and the art takes what is left. On an upright or
 * square card the bars' heights are shares of the face's height, stacked down it; a wide card
 * keeps the bars of an upright trading card (its height is the short side's 1.4) and, when it has
 * effect text, stands the type line and the effect box in a column beside the art, the box filling
 * the column. The parts follow what the card holds: no effect text, no box (the art runs down to
 * the footer, as on a full-art card); a short message, a short box; no type line, no bar.
 */
export function tcgFrame(W: number, H: number, c: TcgContent): TcgFrame {
  const S = Math.min(W, H) / 900;
  const m = 52 * S;
  const gap = 14 * S;
  const inset = 10 * S;
  const wide = W > H;
  const unit = wide ? 1.4 * Math.min(W, H) : H;
  const nameH = 0.072 * unit;
  const typeH = 0.054 * unit;
  const effectH = c.lines > 0 ? (0.1 + 0.03 * Math.min(c.lines, 4)) * unit : 0;
  const footH = 0.034 * unit;
  const w = W - m * 2;
  const name = { x: m, y: m, w, h: nameH };
  const foot = { x: m, y: H - 30 * S - footH, w, h: footH };
  const top = name.y + nameH + gap;
  if (wide && effectH) {
    // The art on the left, the words in a column on the right, both from the name down to the foot.
    const colW = w * COLUMN;
    const colX = m + w - colW;
    const bottom = foot.y - gap;
    const type = c.type ? { x: colX, y: top, w: colW, h: typeH } : null;
    const boxY = type ? type.y + typeH + gap : top;
    const effect = { x: colX, y: boxY, w: colW, h: bottom - boxY };
    const text = { ...effect, h: Math.min(effect.h, effectH) };
    const art = { x: m + inset, y: top, w: colX - gap - (m + inset), h: bottom - top };
    return { name, art, type, effect, text, foot };
  }
  let bottom = foot.y - gap;
  const effect = effectH ? { x: m, y: bottom - effectH, w, h: effectH } : null;
  if (effect) bottom = effect.y - gap;
  const type = c.type ? { x: m, y: bottom - typeH, w, h: typeH } : null;
  if (type) bottom = type.y - gap;
  const art = { x: m + inset, y: top, w: w - inset * 2, h: bottom - top };
  return { name, art, type, effect, text: effect, foot };
}
