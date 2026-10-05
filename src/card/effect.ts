// The trading card's card text: set in its effect box, wrapped evenly and as large as it fits.
// Only the trading card's painter (tcgFace.ts) uses it, so it loads with that painter.
//
// No imports but types: the tests load this file directly with Node.

import type { MessageLayout, Rect } from '../message';

/** Characters that never start a line (they hang on the line before). */
const NO_START = /^[、。，．,.!?！？」』）)ーっゃゅょッャュョ…]/;

/** Breaks one line to a width, then narrows the width as far as the line count allows, so the lines come out even (no word left alone on the last). */
function wrapEven(line: string, max: number, width: (t: string) => number): string[] {
  const rows = wrap(line, max, width);
  if (rows.length < 2) return rows;
  let lo = max * 0.4;
  let hi = max;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(line, mid, width).length > rows.length) lo = mid;
    else hi = mid;
  }
  return wrap(line, hi, width);
}

/** Breaks one line to a width: at spaces where there are any, else between characters. */
function wrap(line: string, max: number, width: (t: string) => number): string[] {
  if (width(line) <= max) return [line];
  const out: string[] = [];
  let cur = '';
  for (const ch of Array.from(line)) {
    if (cur && width(cur + ch) > max && !NO_START.test(ch)) {
      const space = cur.lastIndexOf(' ');
      if (ch !== ' ' && space > 0) {
        out.push(cur.slice(0, space));
        cur = cur.slice(space + 1) + ch;
      } else {
        out.push(cur.trimEnd());
        cur = ch === ' ' ? '' : ch;
      }
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const EFFECT_LINE_H = 1.3;

/** The effect box's margin either side, as a share of its width. */
const EFFECT_PAD = 0.06;

/**
 * The effect text's size in a tall column `w` wide (a wide trading card's): as large as its
 * longest line allows without wrapping, between a fifteenth and a tenth of the column's width.
 */
export function columnSize(lines: string[], w: number, measure: (text: string, size: number) => number): number {
  const fit = Math.min(...lines.filter(Boolean).map((l) => (w * (1 - 2 * EFFECT_PAD) * 100) / measure(l, 100)));
  return Math.min(w / 10, Math.max(w / 15, fit));
}

/**
 * Lays the effect text into its box: as large as fits (between a fifth and a
 * fourteenth of the box's height, and no more than `cap` px when given), wrapped to
 * the box's width, every line centred, as on a card made to be given.
 */
export function layoutEffect(lines: string[], box: Rect, measure: (text: string, size: number) => number, cap = Infinity): MessageLayout | null {
  if (!lines.length) return null;
  const REF = 100;
  const widths = new Map<string, number>();
  const at = (t: string, size: number) => {
    let w = widths.get(t);
    if (w === undefined) widths.set(t, (w = measure(t, REF)));
    return (w * size) / REF;
  };
  const padX = box.w * EFFECT_PAD;
  const padY = box.h * 0.1;
  const inner = { x: box.x + padX, y: box.y + padY, w: box.w - padX * 2, h: box.h - padY * 2 };
  const max = Math.floor(Math.min(box.h * 0.19, cap));
  const min = Math.min(max, Math.max(1, Math.floor(box.h * 0.07)));
  let size = Math.max(min, max);
  let rows: string[] = [];
  for (; ; size--) {
    rows = lines.flatMap((l) => (l ? wrapEven(l, inner.w, (t) => at(t, size)) : ['']));
    if (size <= min || size * (1 + (rows.length - 1) * EFFECT_LINE_H) <= inner.h) break;
  }
  const h = size * (1 + (rows.length - 1) * EFFECT_LINE_H);
  const top = inner.y + Math.max(0, (inner.h - h) / 2);
  const out = rows.map((text, i) => {
    const w = at(text, size);
    return { text, x: inner.x + (inner.w - w) / 2, y: top + size / 2 + i * size * EFFECT_LINE_H, w };
  });
  const bw = Math.max(...out.map((l) => l.w));
  return { size, lines: out, box: { x: inner.x + (inner.w - bw) / 2, y: top, w: bw, h } };
}
