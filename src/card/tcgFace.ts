// The trading-card layout, painted in FOIL's own frame: a name bar with the rarity, the art, a
// type line with a set symbol, a paper box for the effect text and a small footer. No real
// card game's frame or logo; the bars are the frame's colour lifted a step and edged in ink.

import { rarityById } from '../editions';
import { paintLettering, type TextRun } from '../lettering';
import { layoutEffect, messageFont, messageLines, type Rect } from '../message';
import { ART_R, FACE_H, FACE_W, OUTLINE, S, fitName, paintArt, paintPips, roundRect, tcgContent, type FaceSpec } from './face';
import { tcgFrame } from './tcg';

type Frame = { fill: string | CanvasGradient; ink: string; sub: string };

/** The effect box's paper and ink. */
const PAPER = '#fbf7ec';
const PAPER_INK = '#262d31';
/** The bars' enamel (the slate of FOIL's own panels) and the ink printed on it. */
const ENAMEL = '#1f292d';
const BAR_INK = '#f3eee2';

/** A rectangle with its corners cut off at 45°, the pixel-art way of rounding. */
function chamfer(ctx: CanvasRenderingContext2D, r: Rect, c: number) {
  ctx.beginPath();
  ctx.moveTo(r.x + c, r.y);
  ctx.lineTo(r.x + r.w - c, r.y);
  ctx.lineTo(r.x + r.w, r.y + c);
  ctx.lineTo(r.x + r.w, r.y + r.h - c);
  ctx.lineTo(r.x + r.w - c, r.y + r.h);
  ctx.lineTo(r.x + c, r.y + r.h);
  ctx.lineTo(r.x, r.y + r.h - c);
  ctx.lineTo(r.x, r.y + c);
  ctx.closePath();
}

const grow = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });

/** A bar of deep enamel set into the frame: ink edge, a lit top, a keyline in the frame's own colour. */
function bar(ctx: CanvasRenderingContext2D, r: Rect, f: Frame) {
  const c = 9 * S;
  ctx.fillStyle = OUTLINE;
  chamfer(ctx, grow(r, 2.5 * S), c + 1 * S);
  ctx.fill();
  ctx.save();
  chamfer(ctx, r, c);
  ctx.clip();
  ctx.fillStyle = ENAMEL;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const lit = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  lit.addColorStop(0, 'rgba(255,255,255,.16)');
  lit.addColorStop(0.5, 'rgba(255,255,255,.04)');
  lit.addColorStop(1, 'rgba(0,0,0,.12)');
  ctx.fillStyle = lit;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(r.x, r.y, r.w, 2 * S);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = f.fill;
  ctx.lineWidth = 1.5 * S;
  chamfer(ctx, grow(r, -4.5 * S), c - 3 * S);
  ctx.stroke();
  ctx.restore();
}

/** Speckles of paper fibre, made once. */
let grain: CanvasPattern | null = null;
function paperGrain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grain) return grain;
  const g = document.createElement('canvas');
  g.width = g.height = 96;
  const x = g.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    x.fillStyle = rnd() > 0.5 ? 'rgba(90,70,40,.07)' : 'rgba(255,255,255,.5)';
    x.fillRect(Math.floor(rnd() * 96), Math.floor(rnd() * 96), rnd() > 0.8 ? 2 : 1, 1);
  }
  grain = ctx.createPattern(g, 'repeat');
  return grain;
}

/** The effect box: printed paper sunk into the frame, under an ink edge and a fine printed rule. */
function paperBox(ctx: CanvasRenderingContext2D, r: Rect) {
  const c = 10 * S;
  ctx.fillStyle = OUTLINE;
  chamfer(ctx, grow(r, 2.5 * S), c + 1 * S);
  ctx.fill();
  ctx.save();
  chamfer(ctx, r, c);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const pat = paperGrain(ctx);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  // A fine printed rule inside the edge.
  ctx.strokeStyle = 'rgba(38,45,49,.2)';
  ctx.lineWidth = 1.5 * S;
  chamfer(ctx, grow(r, -8 * S), c - 4 * S);
  ctx.stroke();
  // Sunk into the frame: a shadow under the top edge.
  const shade = ctx.createLinearGradient(0, r.y, 0, r.y + 12 * S);
  shade.addColorStop(0, 'rgba(0,0,0,.2)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(r.x, r.y, r.w, 12 * S);
  ctx.restore();
}

/**
 * FOIL's set symbol: one tile of the logo, an F on a rounded tile tilted a little, edged in ink.
 * Coloured by rarity on the type line (as card sets colour theirs), in the frame's ink in the footer.
 */
function setSymbol(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, color: string, letter = '#ffffff') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.fillStyle = OUTLINE;
  roundRect(ctx, -h / 2 - 2.5 * S, -h / 2 - 2.5 * S, h + 5 * S, h + 5 * S, h * 0.24 + 2.5 * S);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, -h / 2, -h / 2, h, h, h * 0.24);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(-h / 2, h / 2 - h * 0.16, h, h * 0.16);
  ctx.fillStyle = letter;
  ctx.font = `700 ${Math.round(h * 0.78)}px "Silkscreen", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('F', 0, -h * 0.02);
  ctx.restore();
}

/** The column the bars and boxes stand in: a shade of the frame, so the card reads as one object. */
function column(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.fillStyle = 'rgba(0,0,0,.07)';
  chamfer(ctx, r, 14 * S);
  ctx.fill();
}

/** Paints the trading-card layout onto a face whose frame is already down; returns its text for the lettering map. */
export function paintTcg(ctx: CanvasRenderingContext2D, spec: FaceSpec, f: Frame): TextRun[] {
  const t = tcgFrame(FACE_W, FACE_H, tcgContent(spec));
  const runs: TextRun[] = [];
  const rarity = rarityById(spec.rarity).color;
  const last = t.effect ?? t.type ?? t.art;

  // The column that binds the parts: from the name bar to the last of them.
  column(ctx, { x: t.name.x - 12 * S, y: t.name.y - 12 * S, w: t.name.w + 24 * S, h: last.y + last.h - t.name.y + 24 * S });

  // Name bar: the name on the left, the rarity on the right.
  bar(ctx, t.name, f);
  const mid = t.name.y + t.name.h / 2;
  if (spec.plate) {
    const name = spec.name.trim() || ' ';
    const pipsW = 4 * (15 * S + 7 * S);
    const size = fitName(ctx, name, t.name.w - pipsW - 40 * S, Math.round(t.name.h * 0.62));
    const x = t.name.x + 16 * S;
    runs.push({ part: 'name', text: name, font: ctx.font, size, x, y: mid + S, stock: t.name.y + 4 * S });
    paintLettering(ctx, name, x, mid + S, BAR_INK);
    paintPips(ctx, spec, t.name.x + t.name.w - 16 * S, mid);
  }

  // The art, framed in ink.
  const art = t.art;
  ctx.fillStyle = OUTLINE;
  roundRect(ctx, art.x - 4 * S, art.y - 4 * S, art.w + 8 * S, art.h + 8 * S, ART_R + 4 * S);
  ctx.fill();
  paintArt(ctx, art, spec.image, spec.crop);

  // Type line, with the set symbol at its end.
  if (t.type) {
    bar(ctx, t.type, f);
    const tmid = t.type.y + t.type.h / 2;
    setSymbol(ctx, t.type.x + t.type.w - 16 * S - t.type.h * 0.3, tmid, t.type.h * 0.54, rarity);
    const type = spec.cardType.trim();
    let size = Math.round(t.type.h * 0.58);
    const max = t.type.w - t.type.h - 34 * S;
    ctx.font = `${size}px "DotGothic16", monospace`;
    while (ctx.measureText(type).width > max && size > 12 * S) ctx.font = `${(size -= 2)}px "DotGothic16", monospace`;
    const x = t.type.x + 16 * S;
    runs.push({ part: 'type', text: type, font: ctx.font, size, x, y: tmid + S });
    paintLettering(ctx, type, x, tmid + S, BAR_INK, 'type');
  }

  // Effect box, with the message as its text.
  if (t.effect) {
    paperBox(ctx, t.effect);
    const font = spec.message.font;
    const measure = (text: string, size: number) => {
      ctx.font = messageFont(font, size);
      return ctx.measureText(text).width;
    };
    const effect = layoutEffect(messageLines(spec.message.text), t.effect, measure);
    if (effect) {
      ctx.font = messageFont(font, effect.size);
      for (const l of effect.lines.filter((l) => l.text)) {
        runs.push({ part: 'message', text: l.text, font: ctx.font, size: effect.size, x: l.x, y: l.y });
        paintLettering(ctx, l.text, l.x, l.y, PAPER_INK, 'message');
      }
    }
  }

  // Footer: the set symbol, the set and its year, and "1/1": every FOIL card is a one-off.
  const fmid = t.foot.y + t.foot.h / 2 + 3 * S;
  const fs = Math.round(t.foot.h * 0.7);
  setSymbol(ctx, t.foot.x + 4 * S + fs * 0.45, fmid, fs * 0.92, f.ink, typeof f.fill === 'string' ? f.fill : '#f3eee2');
  ctx.font = `700 ${fs}px "Silkscreen", monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = f.ink;
  ctx.fillText(`FOIL · ${new Date().getFullYear()}`, t.foot.x + 18 * S + fs, fmid);
  ctx.textAlign = 'right';
  ctx.fillText('1/1', t.foot.x + t.foot.w - 4 * S, fmid);
  ctx.textAlign = 'left';
  return runs;
}
