// The card back, painted as pixel art (one pixel per 10 face px: 90 × 126 on the trading card, and
// the card's own proportions on every other shape) and blown up with hard pixels, like the packs' wrappers. Pixels flagged as foil are written with alpha 254 so the card shader can make
// them glint as the card turns (see the back branch in src/gl/shaders.ts).

import { shapeById, type ShapeId } from './shape';

/** Face px per back pixel. */
const PX = 10;

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const INK = rgb('#161c1f');
const EDGE = rgb('#0b1012');
const PAPER = rgb('#f3eee2');
const PAPER_LO = rgb('#d8d2c4');
const SLATE = rgb('#26333a');
const SLATE_LO = rgb('#1a2328');
/** The coral red of the panel's red step, in three steps. */
const RED = rgb('#d9443a');
const RED_LO = rgb('#a8302a');
const RED_HI = rgb('#ec6a58');
const RED_DEEP = rgb('#b9372f');
const FRAME = rgb('#1b2228');
const GOLD = ['#7a4f12', '#b8862b', '#f2c14e', '#ffe7a0'].map(rgb);
/** The logo's four tiles (src/style.css .tile): light top, color, and a darker foot. */
const TILES: [RGB, RGB, RGB][] = [
  ['#ffd2cc', '#ff6b5f', '#c8443a'],
  ['#ffe7b8', '#ffb341', '#c67f1c'],
  ['#c9f5e4', '#4fd3a3', '#2c9a72'],
  ['#cfe8ff', '#4ab0ff', '#2b78c0'],
].map((t) => t.map(rgb) as [RGB, RGB, RGB]);

/** 4 × 4 ordered dither threshold, 0..1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** 5 × 7 letters of the mark. */
const GLYPHS: Record<string, string[]> = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
};

class Grid {
  px: Uint8ClampedArray<ArrayBuffer>;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGB, foil = false) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px.set(c, i);
    this.px[i + 3] = foil ? 254 : 255;
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB, foil = false) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, foil);
  }
}

/** Whether (x, y) lies inside a w × h box at (x0, y0) with stepped corners of radius r. */
function inRound(x: number, y: number, x0: number, y0: number, w: number, h: number, r: number) {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
  const cx = Math.min(Math.max(x + 0.5, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y + 0.5, y0 + r), y0 + h - r);
  return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
}

function roundFill(g: Grid, x0: number, y0: number, w: number, h: number, r: number, c: (x: number, y: number) => RGB | null, foil?: (x: number, y: number) => boolean) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      if (!inRound(x, y, x0, y0, w, h, r)) continue;
      const v = c(x, y);
      if (v) g.set(x, y, v, foil?.(x, y));
    }
}

/** One letter tile of the logo, `w` × `h` with its foot, lifted by `lift` rows. */
function tile(g: Grid, x0: number, y0: number, w: number, h: number, colors: [RGB, RGB, RGB], letter: string) {
  const [hi, mid, lo] = colors;
  // Outline and a thick foot, like the logo's tiles standing on the table.
  roundFill(g, x0 - 1, y0 - 1, w + 2, h + 4, 2, () => EDGE);
  roundFill(g, x0, y0, w, h, 1.5, (x, y) => {
    const t = (y - y0) / (h - 1);
    return t < 0.45 - dither(x, y) * 0.35 ? hi : mid;
  });
  g.rect(x0 + 1, y0 + h, w - 2, 1, lo);
  // A foil glint in the tile's top corner.
  g.set(x0 + 1, y0 + 1, PAPER, true);
  g.set(x0 + 2, y0 + 1, hi, true);
  g.set(x0 + 1, y0 + 2, hi, true);
  const glyph = GLYPHS[letter];
  const lx = x0 + Math.floor((w - 5) / 2);
  const ly = y0 + Math.floor((h - 7) / 2);
  glyph.forEach((row, j) => [...row].forEach((on, i) => on === '1' && g.set(lx + i, ly + j, INK)));
}

/** A diamond pip (the rarity mark) in gold foil. */
function pip(g: Grid, cx: number, cy: number, r: number) {
  for (let y = -r - 1; y <= r + 1; y++)
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.abs(x) + Math.abs(y);
      if (d > r + 1) continue;
      if (d === r + 1) g.set(cx + x, cy + y, EDGE);
      else g.set(cx + x, cy + y, x + y < 0 ? GOLD[3] : x + y > 0 ? GOLD[1] : GOLD[2], true);
    }
}

/** Inside the paper border: a dark inset frame with a gold hairline, like the face's art window. */
const fieldOf = (g: Grid) => ({ x: 9, y: 9, w: g.w - 18, h: g.h - 18, r: 3 });

function shell(g: Grid) {
  const F = fieldOf(g);
  roundFill(g, 0, 0, g.w, g.h, 7, () => INK);
  roundFill(g, 1, 1, g.w - 2, g.h - 2, 6, (x, y) => (y > g.h - 4 || x > g.w - 4 ? PAPER_LO : PAPER));
  roundFill(g, F.x - 4, F.y - 4, F.w + 8, F.h + 8, F.r + 4, () => FRAME);
  roundFill(g, F.x - 1, F.y - 1, F.w + 2, F.h + 2, F.r + 1, (x, y) => (x + y < g.w ? GOLD[2] : GOLD[1]), () => true);
}

/** The red ground: an engraved lattice, embossed at every crossing, sunk under the frame's top and left. */
function field(g: Grid) {
  const { x: fx, y: fy, w: fw, h: fh, r } = fieldOf(g);
  roundFill(g, fx, fy, fw, fh, r, (x, y) => {
    const u = x - fx + 4;
    const v = y - fy;
    const a = (((u + v) % 8) + 8) % 8;
    const b = (((u - v) % 8) + 8) % 8;
    // Crossings fall where both diagonals meet: a 2 × 2 highlight.
    if (a < 2 && b < 2) return RED_HI;
    if (a < 2 || b < 2) return RED_LO;
    const sunk = Math.min(x - fx, y - fy);
    if (sunk < 2 || (sunk < 4 && dither(x, y) > 0.5)) return RED_DEEP;
    return RED;
  });
  for (const [px, py] of [
    [fx + 5, fy + 5],
    [fx + fw - 6, fy + 5],
    [fx + 5, fy + fh - 6],
    [fx + fw - 6, fy + fh - 6],
  ])
    pip(g, px, py, 2);
}

/** The mark: FOIL's four tiles on a dark cartouche with notched ends, ringed in gold foil and joined to two pips. */
function emblem(g: Grid) {
  const cx = Math.round(g.w / 2);
  const cy = Math.round(g.h / 2);
  const TW = 11;
  const TH = 13;
  const gap = 2;
  const rowW = TW * 4 + gap * 3;
  const hw = Math.ceil(rowW / 2) + 7;
  const hh = Math.ceil(TH / 2) + 7;
  /** Inside the cartouche, grown by `k`: a box whose ends come to a point. */
  const inside = (x: number, y: number, k: number) => {
    const dx = Math.abs(x + 0.5 - cx);
    const dy = Math.abs(y + 0.5 - cy);
    return dy <= hh + k && dx <= hw + k - Math.max(0, dy - 2);
  };
  // Stems from the cartouche to the pips above and below.
  const reach = hh + 10;
  for (let y = cy - reach; y <= cy + reach; y++) {
    g.rect(cx - 2, y, 4, 1, EDGE);
    g.set(cx - 1, y, GOLD[3], true);
    g.set(cx, y, GOLD[1], true);
  }
  for (let y = cy - hh - 4; y <= cy + hh + 4; y++)
    for (let x = cx - hw - 4; x <= cx + hw + 4; x++) {
      if (inside(x, y, 1)) g.set(x, y, SLATE_LO);
      else if (inside(x, y, 3)) {
        // Two-tone gold: light on the top and left, dark on the bottom and right.
        const lit = y < cy - hh || (x < cx && y <= cy + hh);
        g.set(x, y, GOLD[lit ? 3 : 1], true);
      } else if (inside(x, y, 4)) g.set(x, y, EDGE);
      else if (inside(x, y, 2)) g.set(x, y, EDGE);
    }
  // The plate is sunken: a dark lip along its top, a lighter one along its foot.
  for (let x = cx - hw; x <= cx + hw; x++) {
    if (inside(x, cy - hh, 0)) g.set(x, cy - hh, EDGE);
    if (inside(x, cy + hh, 0)) g.set(x, cy + hh, SLATE);
  }
  // Rivets at the two points.
  g.set(cx - hw - 1, cy, GOLD[3], true);
  g.set(cx + hw + 1, cy, GOLD[2], true);
  for (const dy of [-reach - 3, reach + 3]) pip(g, cx, cy + dy, 3);
  const tx0 = Math.round(cx - rowW / 2);
  const ty0 = Math.round(cy - TH / 2) - 1;
  const lifts = [0, -1, 0, -1];
  'FOIL'.split('').forEach((ch, i) => tile(g, tx0 + i * (TW + gap), ty0 + lifts[i], TW, TH, TILES[i], ch));
}

/** Paints the back's pixel grid for a face `w` × `h` (alpha 254 marks foil). */
function grid(w: number, h: number): HTMLCanvasElement {
  const g = new Grid(Math.round(w / PX), Math.round(h / PX));
  shell(g);
  field(g);
  emblem(g);
  const small = document.createElement('canvas');
  small.width = g.w;
  small.height = g.h;
  small.getContext('2d')!.putImageData(new ImageData(g.px, g.w, g.h), 0, 0);
  return small;
}

/** The trading card's back at its pixel size, as an image address for CSS (the deck's pile). */
export const backUrl = () => grid(900, 1260).toDataURL();

/** The card back at the face texture's size for the shape, its pixels blown up hard. */
export function drawBack(back: HTMLCanvasElement, shape: ShapeId): void {
  const { w, h } = shapeById(shape);
  const small = grid(w, h);
  back.width = w;
  back.height = h;
  const ctx = back.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(small, 0, 0, w, h);
}
