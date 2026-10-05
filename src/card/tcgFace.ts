// The trading-card layout, built the way real trading cards are (docs/tcg.md): the frame is the
// card's own coloured material, the name, type line and text sit on light plates inset in it,
// the art a step below it, and the fine print small at the foot. No real game's frame or logo.

import { rarityById } from '../editions';
import { paintLettering, type TextRun } from '../lettering';
import { messageFont, messageLines, type Rect } from '../message';
import { columnSize, layoutEffect } from './effect';
import { paintFreeMessage, LINE, OUTLINE, RADIUS, S, fitName, nameFont, paintArt, paintPips, roundRect, tcgContent, type FaceSpec } from './face';
import { tcgFrame } from './tcg';
import { holdWord } from './words';

type Frame = { fill: string | CanvasGradient; ink: string; sub: string };

/** Plates: parchment (a step lighter than the Paper frame's stock; a step dimmer on a dark frame), and the warm black ink printed on them. */
const PLATE_HI = '#fdf8ea';
const PLATE_DIM = '#e9dfc4';
const PLATE_EDGE = '#3b2f1f';
const PLATE_INK = '#2a2118';

/** One pixel of the card's pixel work, in face pixels (read when drawing: S comes from card/face, which imports this module). */
const px = () => 6 * S;

const grow = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });

/** A rectangle with its corners cut in pixel steps, the pixel-art way of rounding. */
function shape(ctx: CanvasRenderingContext2D, r: Rect, rad: number) {
  const p = px();
  const n = Math.max(2, Math.round(rad / p));
  ctx.beginPath();
  ctx.moveTo(r.x + n * p, r.y);
  ctx.lineTo(r.x + r.w - n * p, r.y);
  for (let i = n; i > 0; i--) {
    ctx.lineTo(r.x + r.w - (i - 1) * p, r.y + (n - i) * p);
    ctx.lineTo(r.x + r.w - (i - 1) * p, r.y + (n - i + 1) * p);
  }
  ctx.lineTo(r.x + r.w, r.y + r.h - n * p);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(r.x + r.w - i * p, r.y + r.h - (n - i - 1) * p);
    ctx.lineTo(r.x + r.w - (i + 1) * p, r.y + r.h - (n - i - 1) * p);
  }
  ctx.lineTo(r.x + n * p, r.y + r.h);
  for (let i = n; i > 0; i--) {
    ctx.lineTo(r.x + (i - 1) * p, r.y + r.h - (n - i) * p);
    ctx.lineTo(r.x + (i - 1) * p, r.y + r.h - (n - i + 1) * p);
  }
  ctx.lineTo(r.x, r.y + n * p);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(r.x + i * p, r.y + (n - i - 1) * p);
    ctx.lineTo(r.x + (i + 1) * p, r.y + (n - i - 1) * p);
  }
  ctx.closePath();
}

/** Speckles of fibre, made once: the frame's material and the plates' paper. */
let grain: CanvasPattern | null = null;
function fibre(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grain) return grain;
  const g = document.createElement('canvas');
  g.width = g.height = 96;
  const x = g.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 700; i++) {
    x.fillStyle = rnd() > 0.5 ? 'rgba(60,40,10,.08)' : 'rgba(255,255,255,.18)';
    x.fillRect(Math.floor(rnd() * 96), Math.floor(rnd() * 96), rnd() > 0.8 ? 2 : 1, 1);
  }
  grain = ctx.createPattern(g, 'repeat');
  return grain;
}

/** A plate set into the frame: a hard drop shadow, a dark keyline, parchment lit in two hard tones. */
function plate(ctx: CanvasRenderingContext2D, r: Rect, rad: number, dim = false) {
  // A shallow hard drop, down and to the right.
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  shape(ctx, { ...grow(r, 2 * S), x: r.x - S, y: r.y + S }, rad + 2 * S);
  ctx.fill();
  ctx.fillStyle = PLATE_EDGE;
  shape(ctx, grow(r, 2 * S), rad + 2 * S);
  ctx.fill();
  ctx.save();
  shape(ctx, r, rad);
  ctx.clip();
  // Two hard tones: a narrow lit top and left edge, a shaded foot and right edge, flat between.
  const b = px() / 2;
  ctx.fillStyle = dim ? PLATE_DIM : PLATE_HI;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = dim ? '#c4b48c' : '#d9c79e';
  ctx.fillRect(r.x, r.y + r.h - b, r.w, b);
  ctx.fillRect(r.x + r.w - b, r.y, b, r.h);
  ctx.fillStyle = dim ? '#f7efd9' : '#ffffff';
  ctx.fillRect(r.x, r.y, r.w - b, b);
  ctx.fillRect(r.x, r.y, b, r.h - b);
  const pat = fibre(ctx);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

/**
 * The art, a step below the frame: an ink line with stepped corners and an inverted pixel bevel,
 * lit from the same side as the plates: a lit lip under its foot and right side, the picture's
 * own top and left edges in shadow.
 */
function artWell(ctx: CanvasRenderingContext2D, spec: FaceSpec, art: Rect) {
  const rad = 12 * S;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  shape(ctx, { ...grow(art, 3 * S), x: art.x - S, y: art.y - S, w: art.w + 6 * S, h: art.h + 6 * S }, rad + 3 * S);
  ctx.fill();
  ctx.fillStyle = OUTLINE;
  shape(ctx, grow(art, 3 * S), rad + 3 * S);
  ctx.fill();
  ctx.save();
  shape(ctx, art, rad);
  ctx.clip();
  paintArt(ctx, art, spec.image, spec.crop, 0, spec.crisp);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(art.x, art.y, art.w, px());
  ctx.fillRect(art.x, art.y, px(), art.h);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.fillRect(art.x + px(), art.y + px(), art.w - px(), px());
  ctx.fillRect(art.x + px(), art.y + px(), px(), art.h - px());
  ctx.restore();
}

/** A 4×4 ordered dither of a shade, made once: printed stock seen through pixels. */
let dither: CanvasPattern | null = null;
function stock(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (dither) return dither;
  const c = document.createElement('canvas');
  const cell = Math.round(px() / 2);
  c.width = c.height = cell * 4;
  const x = c.getContext('2d')!;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let i = 0; i < 16; i++) {
    if (bayer[i] > 4) continue;
    x.fillStyle = 'rgba(0,0,0,.06)';
    x.fillRect((i % 4) * cell, Math.floor(i / 4) * cell, cell, cell);
  }
  dither = ctx.createPattern(c, 'repeat');
  return dither;
}

/** The frame's material: dithered printed stock, a band of deeper dither along the edge, and a stepped rule inside it. */
function material(ctx: CanvasRenderingContext2D, f: Frame, light: boolean) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  roundRect(ctx, LINE, LINE, W - LINE * 2, H - LINE * 2, RADIUS - LINE);
  ctx.clip();
  if (light) {
    ctx.fillStyle = 'rgba(150,105,45,.16)';
    ctx.fillRect(0, 0, W, H);
  }
  const pat = stock(ctx);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    // The edge band takes the dither twice: the stock darkens towards the card's edge.
    const band = 22 * S;
    ctx.fillRect(0, 0, W, LINE + band);
    ctx.fillRect(0, H - LINE - band, W, LINE + band);
    ctx.fillRect(0, LINE + band, LINE + band, H - (LINE + band) * 2);
    ctx.fillRect(W - LINE - band, LINE + band, LINE + band, H - (LINE + band) * 2);
  }
  ctx.strokeStyle = f.sub;
  ctx.lineWidth = 2 * S;
  const inset = LINE + 6 * S;
  shape(ctx, { x: inset, y: inset, w: W - inset * 2, h: H - inset * 2 }, 18 * S);
  ctx.stroke();
  ctx.restore();
}

/** FOIL's set emblem, 7 × 7 pixels: a four-point star with a glint. 1 ink, 2 fill, 3 glint. */
const EMBLEM = ['0001000', '0012100', '0123210', '1223221', '0122210', '0012100', '0001000'];

/** FOIL's set symbol: the emblem in pixels, filled with the rarity's colour (as card sets colour theirs). */
function setSymbol(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, color: string) {
  const p = Math.max(1, Math.round(h / 7));
  const x0 = Math.round(cx - (p * 7) / 2);
  const y0 = Math.round(cy - (p * 7) / 2);
  EMBLEM.forEach((row, y) =>
    [...row].forEach((v, x) => {
      if (v === '0') return;
      ctx.fillStyle = v === '1' ? OUTLINE : v === '2' ? color : '#ffffff';
      ctx.fillRect(x0 + x * p, y0 + y * p, p, p);
    }),
  );
}

/** Paints the trading-card layout onto a face whose frame is already down; returns its text for the lettering map. */
export function paintTcg(ctx: CanvasRenderingContext2D, spec: FaceSpec, f: Frame): TextRun[] {
  const t = tcgFrame(ctx.canvas.width, ctx.canvas.height, tcgContent(spec));
  const runs: TextRun[] = [];
  const rarity = rarityById(spec.rarity).color;
  const rad = 12 * S;
  // A dark frame (light ink) gets dimmer plates, so they sit in it instead of glaring.
  const dim = f.ink.toLowerCase() === '#f3eee2' || /243,238,226/.test(f.ink);
  material(ctx, f, !dim);

  // Name: on a plate (A, C) or printed straight on the frame (B), the rarity at its right.
  const mid = t.name.y + t.name.h / 2;
  plate(ctx, t.name, rad, dim);
  if (spec.plate) {
    const name = spec.name.trim() || ' ';
    const pipsW = 4 * (15 * S + 7 * S);
    // The name leads the card: the pixel face set bold (an engraved card's serif is bold already).
    const size = fitName(ctx, name, t.name.w - pipsW - 40 * S, Math.round(t.name.h * 0.66), (s) => nameFont(spec, s, true));
    const x = t.name.x + 18 * S;
    const stock = t.name.y + 4 * S;
    runs.push({ part: 'name', text: name, font: ctx.font, size, x, y: mid + S, stock });
    paintLettering(ctx, name, x, mid + S, PLATE_INK, 'name', stock);
    // On a parchment plate the diamonds keep the rarity's colour, whatever the frame.
    paintPips(ctx, { ...spec, frame: 'paper' }, t.name.x + t.name.w - 18 * S, mid);
  }

  // The art, a step below the frame.
  artWell(ctx, spec, t.art);

  // Type line: a smaller plate, the set symbol at its end.
  if (t.type) {
    const r = t.type;
    plate(ctx, r, rad, dim);
    const tmid = r.y + r.h / 2;
    setSymbol(ctx, r.x + r.w - 18 * S - r.h * 0.3, tmid, r.h * 0.6, rarity);
    const type = spec.cardType.trim();
    let size = Math.round(r.h * 0.5);
    const max = r.w - r.h - 34 * S;
    ctx.font = `${size}px "DotGothic16", monospace`;
    while (ctx.measureText(type).width > max && size > 12 * S) ctx.font = `${(size -= 2)}px "DotGothic16", monospace`;
    const x = r.x + 18 * S;
    runs.push({ part: 'type', text: type, font: ctx.font, size, x, y: tmid + S });
    paintLettering(ctx, type, x, tmid + S, PLATE_INK, 'type');
  }

  // Text box: a parchment plate with a fine printed rule inside its edge, the message as its text.
  if (t.effect) {
    const box = t.effect;
    plate(ctx, box, rad, dim);
    ctx.strokeStyle = 'rgba(59,47,31,.22)';
    ctx.lineWidth = 1.5 * S;
    shape(ctx, grow(box, -12 * S), rad);
    ctx.stroke();
    const font = spec.message.font;
    const measure = (text: string, size: number) => {
      ctx.font = messageFont(font, size);
      return ctx.measureText(text).width;
    };
    // In a wide card's narrower column the text gives way a little where a line would otherwise wrap.
    const lines = messageLines(spec.message.text);
    const effect = layoutEffect(lines, t.text!, measure, ctx.canvas.width > ctx.canvas.height ? columnSize(lines, box.w, measure) : Infinity);
    if (effect) {
      ctx.font = messageFont(font, effect.size);
      for (const l of effect.lines.filter((l) => l.text)) {
        runs.push({ part: 'message', text: l.text, font: ctx.font, size: effect.size, x: l.x, y: l.y });
        paintLettering(ctx, l.text, l.x, l.y, PLATE_INK, 'message');
      }
    }
  }

  // Fine print at the foot, small, in the frame's quiet ink: the set and its year, and "1/1"
  // (every FOIL card is a one-off).
  const fmid = t.foot.y + t.foot.h / 2 + 3 * S;
  const fs = Math.round(t.foot.h * 0.56);
  ctx.font = `${fs}px "DotGothic16", monospace`;
  ctx.textBaseline = 'middle';
  setSymbol(ctx, t.foot.x + 8 * S + fs * 0.4, fmid, fs * 0.8, f.ink);
  const fine = (text: string, x: number, align: 'left' | 'right') => {
    const width = ctx.measureText(text).width;
    // Under pixel art it is printed later, on the pixel grid (card/words.ts).
    if (holdWord(ctx, { text, font: ctx.font, size: fs, width, x, y: fmid, align, fill: f.ink, alpha: 0.72, edge: null })) return;
    ctx.fillStyle = f.ink;
    ctx.globalAlpha = 0.72;
    ctx.fillText(text, align === 'left' ? x : x - width, fmid);
    ctx.globalAlpha = 1;
  };
  fine(`FOIL ${new Date().getFullYear()}`, t.foot.x + 14 * S + fs, 'left');
  fine('No. 1/1', t.foot.x + t.foot.w - 8 * S, 'right');
  // A freely placed message lies over the card, last.
  runs.push(...paintFreeMessage(ctx, spec));
  return runs;
}
