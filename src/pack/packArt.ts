// The wrapper of a pack, painted once per opening: a crimped foil bag with the FOIL tiles, a fan of
// cards with the theme's emblem, the theme's name and a perforated tear line. The card shader then
// prints it in the pack's wrapper finish; the mask keeps the words in plain ink (blue channel).

import type { Pack, PackId } from '../packs';

export const PACK_W = 640;
export const PACK_H = 1000;
/** The perforation, as a fraction of the height: everything above it is the strip that tears off. */
export const TEAR_Y = 0.118;
/** Height of the crimped seal at each end. */
const CRIMP = 64;

const INK = '#0b1012';
const PAPER = '#f3eee2';

/** The bag's outline: a crimped zig-zag along the top and bottom, straight sides with soft corners. */
function bag(ctx: CanvasRenderingContext2D, inset = 0) {
  const tooth = 20;
  const depth = 9;
  const l = inset;
  const r = PACK_W - inset;
  const t = inset;
  const b = PACK_H - inset;
  ctx.beginPath();
  ctx.moveTo(l, t + depth);
  for (let x = l; x < r; x += tooth) {
    ctx.lineTo(Math.min(r, x + tooth / 2), t);
    ctx.lineTo(Math.min(r, x + tooth), t + depth);
  }
  ctx.lineTo(r, b - depth);
  for (let x = r; x > l; x -= tooth) {
    ctx.lineTo(Math.max(l, x - tooth / 2), b);
    ctx.lineTo(Math.max(l, x - tooth), b - depth);
  }
  ctx.closePath();
}

/** The theme's mark, drawn in `ink` inside a box of `s` around (cx, cy). Simple chunky shapes, like the UI's pixel icons. */
function emblem(ctx: CanvasRenderingContext2D, id: PackId, cx: number, cy: number, s: number, ink: string, hi: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineJoin = 'miter';
  const k = s / 100;
  const poly = (pts: number[]) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i] * k, pts[i + 1] * k);
    ctx.closePath();
    ctx.fill();
  };
  if (id === 'metal') {
    // A cut gem over a coin rim.
    ctx.lineWidth = 9 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 46 * k, 0, Math.PI * 2);
    ctx.stroke();
    poly([-30, -12, -16, -30, 16, -30, 30, -12, 0, 32]);
    ctx.fillStyle = hi;
    poly([-16, -12, 0, -30, 16, -12, 0, 22]);
  } else if (id === 'light') {
    // A four-point star with a small one beside it.
    poly([0, -48, 10, -10, 48, 0, 10, 10, 0, 48, -10, 10, -48, 0, -10, -10]);
    poly([30, -40, 34, -30, 44, -26, 34, -22, 30, -12, 26, -22, 16, -26, 26, -30]);
    ctx.fillStyle = hi;
    poly([0, -18, 5, -5, 18, 0, 5, 5, 0, 18, -5, 5, -18, 0, -5, -5]);
  } else if (id === 'nature') {
    // A five-petal blossom.
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      ctx.beginPath();
      ctx.ellipse(0, -26 * k, 15 * k, 24 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(0, 0, 11 * k, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'studio') {
    // A halftone wedge: dots growing toward one corner, and a brush tip.
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        const r = (3 + (x + y + 4) * 2.2) * k;
        ctx.beginPath();
        ctx.arc(x * 20 * k, y * 20 * k, r, 0, Math.PI * 2);
        ctx.fill();
      }
  } else {
    // Supporter: a heart under a small crown.
    poly([0, 44, -44, 0, -44, -18, -30, -32, -14, -32, 0, -18, 14, -32, 30, -32, 44, -18, 44, 0]);
    ctx.fillStyle = hi;
    poly([-24, -40, -24, -58, -12, -48, 0, -62, 12, -48, 24, -58, 24, -40]);
  }
  ctx.restore();
}

/** One tile of the FOIL logo, like the header's. */
function tile(ctx: CanvasRenderingContext2D, x: number, y: number, ch: string, a: string, b: string, rot: number) {
  const w = 46;
  const h = 60;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 12, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 8);
  ctx.fill();
  ctx.fillStyle = '#262d31';
  ctx.font = '700 34px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 0, 2);
  ctx.restore();
}

export interface PackWords {
  /** The theme's name as printed big (Latin, upper case reads best in the pixel face). */
  big: string;
  /** "3 finishes" / "3枚入り". */
  count: string;
  /** Only on the Supporter pack. */
  ribbon?: string;
}

/** Paints the wrapper into `face` and where its finish goes into `mask` (r: finish, b: plain ink). */
export function paintPack(face: HTMLCanvasElement, mask: HTMLCanvasElement, pack: Pack, words: PackWords): void {
  for (const c of [face, mask]) {
    c.width = PACK_W;
    c.height = PACK_H;
  }
  const ctx = face.getContext('2d')!;
  const m = mask.getContext('2d')!;
  const [dark, mid, light] = pack.colors;
  const supporter = !!pack.supporter;

  // Body: the bag in its colors, with diagonal pixel stripes like printed foil film.
  ctx.save();
  bag(ctx);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, PACK_H);
  g.addColorStop(0, supporter ? '#1b1510' : mid);
  g.addColorStop(0.55, supporter ? '#0d0a07' : dark);
  g.addColorStop(1, supporter ? '#000' : dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PACK_W, PACK_H);
  ctx.globalAlpha = supporter ? 0.18 : 0.12;
  ctx.fillStyle = light;
  for (let d = -PACK_H; d < PACK_W + PACK_H; d += 56) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + 24, 0);
    ctx.lineTo(d + 24 - PACK_H * 0.6, PACK_H);
    ctx.lineTo(d - PACK_H * 0.6, PACK_H);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Crimped seals: fine ridges across both ends.
  for (const y0 of [0, PACK_H - CRIMP]) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y0, PACK_W, CRIMP);
    for (let y = y0 + 4; y < y0 + CRIMP; y += 8) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, y, PACK_W, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y + 2, PACK_W, 2);
    }
  }
  // Perforation: the line to trace.
  const ty = Math.round(TEAR_Y * PACK_H);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let x = 18; x < PACK_W - 18; x += 22) ctx.fillRect(x, ty - 2, 12, 4);
  // A gold edge band on the Supporter pack.
  if (supporter) {
    ctx.strokeStyle = light;
    ctx.lineWidth = 10;
    ctx.strokeRect(22, CRIMP + 24, PACK_W - 44, PACK_H - CRIMP * 2 - 48);
  }

  // A fan of three cards in the middle, the front one carrying the theme's emblem.
  const cx = PACK_W / 2;
  const cy = 470;
  const cw = 210;
  const ch = 294;
  for (const [rot, dx, tint] of [
    [-0.2, -70, mid],
    [0.2, 70, light],
    [0, 0, PAPER],
  ] as const) {
    ctx.save();
    ctx.translate(cx + dx, cy + Math.abs(dx) * 0.25);
    ctx.rotate(rot);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(-cw / 2 - 8, -ch / 2 - 8, cw + 16, ch + 22, 18);
    ctx.fill();
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 14);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = supporter ? '#120e0a' : dark;
  ctx.beginPath();
  ctx.roundRect(cx - cw / 2 + 18, cy - ch / 2 + 18, cw - 36, ch - 92, 8);
  ctx.fill();
  emblem(ctx, pack.id, cx, cy - 34, 120, light, PAPER);

  // FOIL tiles under the seal.
  const tiles: [string, string, string][] = supporter
    ? ['F', 'O', 'I', 'L'].map((c) => [c, '#fff1c9', '#d9a441'] as [string, string, string])
    : [
        ['F', '#ffd2cc', '#ff6b5f'],
        ['O', '#ffe7b8', '#ffb341'],
        ['I', '#c9f5e4', '#4fd3a3'],
        ['L', '#cfe8ff', '#4ab0ff'],
      ];
  tiles.forEach(([chr, a, b], i) => tile(ctx, cx + (i - 1.5) * 62, 196 + (i % 2 ? -4 : 2), chr, a, b, [-0.12, 0.05, -0.03, 0.1][i]));
  ctx.restore();

  // Words, in plain ink (kept out of the finish by the mask).
  const words2: [string, number, string, string][] = [
    [words.big, 760, '700 80px Silkscreen, monospace', PAPER],
    [words.count, 836, '34px DotGothic16, sans-serif', light],
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  m.fillStyle = '#ff0000';
  bag(m);
  m.fill();
  m.textAlign = 'center';
  m.textBaseline = 'middle';
  for (const [text, y, font, color] of words2) {
    ctx.font = font;
    m.font = font;
    // A dark outline so the words read on any finish.
    ctx.lineWidth = 10;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, cx, y, PACK_W - 80);
    ctx.fillStyle = color;
    ctx.fillText(text, cx, y, PACK_W - 80);
    m.lineWidth = 14;
    m.strokeStyle = '#0000ff';
    m.lineJoin = 'round';
    m.strokeText(text, cx, y, PACK_W - 80);
    m.fillStyle = '#0000ff';
    m.fillText(text, cx, y, PACK_W - 80);
  }
  if (words.ribbon) {
    // A gold ribbon across the top corner.
    ctx.save();
    ctx.translate(PACK_W - 130, CRIMP + 92);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = INK;
    ctx.fillRect(-190, -30, 380, 60);
    ctx.fillStyle = light;
    ctx.fillRect(-190, -24, 380, 48);
    ctx.fillStyle = INK;
    ctx.font = '700 26px Silkscreen, monospace';
    ctx.fillText(words.ribbon, 0, 2, 220);
    ctx.restore();
  }
}

/**
 * The back the showpiece arrives on: the card's own back with its middle printed in the pack's
 * colors, stripes and emblem, so the one face-down card already looks like something.
 */
export function paintShowpieceBack(back: HTMLCanvasElement, base: HTMLCanvasElement, pack: Pack): void {
  back.width = base.width;
  back.height = base.height;
  const ctx = back.getContext('2d')!;
  const W = back.width;
  const H = back.height;
  const [dark, mid, light] = pack.colors;
  ctx.drawImage(base, 0, 0);
  // The inner panel, inset like the printed back's.
  const inset = W * 0.062;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, W * 0.034);
  ctx.clip();
  const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.05, W / 2, H / 2, H * 0.62);
  g.addColorStop(0, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = light;
  for (let d = -H; d < W + H; d += 64) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + 26, 0);
    ctx.lineTo(d + 26 - H * 0.6, H);
    ctx.lineTo(d - H * 0.6, H);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = light;
  ctx.lineWidth = 8;
  ctx.strokeRect(inset + 26, inset + 26, W - (inset + 26) * 2, H - (inset + 26) * 2);
  ctx.restore();
  // A seal with the theme's mark in the middle.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, W * 0.155, 0, Math.PI * 2);
  ctx.fill();
  emblem(ctx, pack.id, W / 2, H / 2, W * 0.2, light, PAPER);
}
