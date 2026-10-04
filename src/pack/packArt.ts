// The wrapper of a pack, painted as pixel art: a 128 × 192 grid (2 : 3) scaled up with hard
// pixels. A pillow-shaped foil bag with silver crimp seals, a wavy inked outline, darker sides, the
// theme's big illustration on its color and its name in an arc of outlined letters. The card shader
// then prints it in the pack's wrapper finish, and the pillow mesh (pillow.ts) lights it. The mask
// keeps the letters in plain ink (blue channel). Every drawing here is original.

import type { Pack, PackId } from '../packs';

/** The pixel grid, and the scale it is blown up by. */
export const GRID_W = 128;
export const GRID_H = 192;
const SCALE = 5;
export const PACK_W = GRID_W * SCALE;
export const PACK_H = GRID_H * SCALE;
/** Rows of each crimp seal. */
const SEAL = 15;
/** The perforation, as a fraction of the height: everything above it is the strip that tears off. */
export const TEAR_Y = (SEAL + 6) / GRID_H;

const INK = '#0b1012';
const PAPER = '#f3eee2';

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** 4 × 4 ordered dither threshold, 0..1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** A grid of pixels with a mask channel: art goes in `px`, where the finish may go in `fin`, plain-ink letters in `ink`. */
class Grid {
  px = new Uint8ClampedArray(GRID_W * GRID_H * 4);
  /** 0 outside the bag, 1 inside (the finish applies), 2 plain ink (letters). */
  kind = new Uint8Array(GRID_W * GRID_H);
  set(x: number, y: number, c: RGB, kind = 1) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
    const i = (y * GRID_W + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
    this.px[i + 3] = 255;
    this.kind[y * GRID_W + x] = Math.max(this.kind[y * GRID_W + x] === 2 ? 2 : 0, kind);
  }
  get(x: number, y: number): RGB {
    const i = (y * GRID_W + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && this.px[(y * GRID_W + x) * 4 + 3] > 0;
  }
}

/**
 * A sprite layer: shapes are filled into it, then stamped onto the grid with a 1-pixel ink contour
 * around them, like hand-placed pixel art.
 */
class Layer {
  c = new Array<RGB | null>(GRID_W * GRID_H).fill(null);
  put(x: number, y: number, c: RGB) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) this.c[y * GRID_W + x] = c;
  }
  /** Fills where `f(x, y)` returns a color. */
  fill(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => RGB | null) {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(GRID_H - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(GRID_W - 1, Math.ceil(x1)); x++) {
        const c = f(x + 0.5, y + 0.5);
        if (c) this.c[y * GRID_W + x] = c;
      }
  }
  disc(cx: number, cy: number, r: number, c: RGB | ((x: number, y: number) => RGB)) {
    this.fill(cx - r, cy - r, cx + r, cy + r, (x, y) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? (typeof c === 'function' ? c(x, y) : c) : null));
  }
  poly(pts: number[], c: RGB | ((x: number, y: number) => RGB)) {
    const xs = pts.filter((_, i) => i % 2 === 0);
    const ys = pts.filter((_, i) => i % 2 === 1);
    this.fill(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside ? (typeof c === 'function' ? c(x, y) : c) : null;
    });
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB) {
    this.fill(Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.max(x0, x1) + w, Math.max(y0, y1) + w, (x, y) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) <= w / 2 ? c : null;
    });
  }
  /** Copies onto the grid with an ink contour (`outline` pixels thick); `kind` 2 keeps it out of the finish. */
  stamp(g: Grid, outline = 1, kind = 1) {
    const ink = rgb(INK);
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !!this.c[y * GRID_W + x];
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) {
        if (on(x, y)) continue;
        let near = false;
        for (let dy = -outline; dy <= outline && !near; dy++) for (let dx = -outline; dx <= outline && !near; dx++) near = on(x + dx, y + dy);
        if (near) g.set(x, y, ink, kind);
      }
    for (let i = 0; i < this.c.length; i++) if (this.c[i]) g.set(i % GRID_W, (i / GRID_W) | 0, this.c[i]!, kind);
  }
}

/** Text in a pixel face, drawn small and snapped to the grid (any pixel at least half covered). */
function textLayer(text: string, font: string, x: number, y: number, color: (px: number, py: number) => RGB, arc = 0, wave = 0): Layer {
  const L = new Layer();
  const c = document.createElement('canvas');
  c.width = GRID_W;
  c.height = GRID_H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  // Letter by letter, so the word can bend (arc: rows raised in the middle; wave: a sine along it).
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = Math.round(x - total / 2);
  chars.forEach((ch, i) => {
    const mid = cx + widths[i] / 2;
    const t = (mid - x) / (total / 2 || 1);
    const dy = Math.round(-arc * (1 - t * t) + wave * Math.sin(i * 1.3));
    ctx.fillText(ch, Math.round(cx), Math.round(y + dy));
    cx += widths[i];
  });
  const d = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
  for (let py = 0; py < GRID_H; py++) for (let px = 0; px < GRID_W; px++) if (d[(py * GRID_W + px) * 4 + 3] > 110) L.put(px, py, color(px, py));
  return L;
}

/** The bag's left and right edges on row y: a slightly wavy outline, like a pillow pressed by hand. */
const edges = (y: number): [number, number] => {
  const w = Math.round(Math.sin(y * 0.19) * 0.7 + Math.sin(y * 0.071 + 1) * 0.8);
  const bulge = y > SEAL && y < GRID_H - SEAL ? 0 : 1;
  return [4 + bulge - w, GRID_W - 5 - bulge + Math.round(Math.sin(y * 0.17 + 2) * 0.7 + Math.sin(y * 0.063) * 0.8)];
};

interface Look {
  /** Body: dark, mid, light; accents for the illustration. */
  body: [string, string, string];
  art: (L: Layer, accent: RGB[]) => void;
  accent: string[];
}

const gem = (L: Layer, a: RGB[]) => {
  // A gold coin behind a cut gem, sparkles around.
  const [gold, goldHi, goldLo, ice, iceHi, iceLo, white] = a;
  L.disc(76, 92, 25, (x, y) => (Math.hypot(x - 76, y - 92) > 21 ? goldLo : (x - 70) * 0.6 + (y - 86) < -6 ? goldHi : gold));
  L.poly([76, 76, 82, 88, 94, 90, 84, 97, 87, 109, 76, 102, 65, 109, 68, 97, 58, 90, 70, 88], goldLo);
  L.poly([24, 70, 36, 56, 64, 56, 76, 70, 50, 108], (x, y) => (y < 70 ? (x < 40 ? iceHi : x < 56 ? ice : iceLo) : x < 44 ? ice : x < 52 ? iceHi : iceLo));
  L.poly([36, 70, 44, 58, 56, 58, 64, 70, 50, 100], (_x, y) => (y < 70 ? white : iceHi));
  for (const [sx, sy, r] of [[22, 46, 4], [100, 60, 3], [104, 116, 4], [30, 118, 3]]) {
    L.line(sx - r, sy, sx + r, sy, 1, white);
    L.line(sx, sy - r, sx, sy + r, 1, white);
  }
};

const star = (L: Layer, a: RGB[]) => {
  const [sun, sunHi, ray, rayLo, white, planet] = a;
  const pts: number[] = [];
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 18 : i % 4 === 0 ? 46 : 34;
    pts.push(64 + Math.cos(ang) * r, 86 + Math.sin(ang) * r);
  }
  L.poly(pts, (x, y) => ((x - 64) * 0.7 + (y - 86) < 0 ? ray : rayLo));
  L.disc(64, 86, 17, (x, y) => ((x - 58) ** 2 + (y - 80) ** 2 < 70 ? sunHi : sun));
  L.disc(64, 86, 6, white);
  L.disc(103, 52, 7, planet);
  L.line(94, 55, 112, 49, 1.5, white);
  for (const [sx, sy, r] of [[20, 50, 4], [24, 120, 3], [104, 118, 4], [96, 82, 2]]) {
    L.line(sx - r, sy, sx + r, sy, 1, white);
    L.line(sx, sy - r, sx, sy + r, 1, white);
  }
};

const blossom = (L: Layer, a: RGB[]) => {
  const [bark, petal, petalHi, petalLo, heart, leaf, leafHi] = a;
  L.line(10, 128, 50, 92, 6, bark);
  L.line(50, 92, 92, 70, 5, bark);
  L.line(66, 84, 70, 58, 3, bark);
  L.poly([84, 74, 98, 62, 104, 70, 92, 80], (x) => (x < 94 ? leafHi : leaf));
  L.poly([30, 112, 22, 98, 32, 96, 38, 106], (x) => (x < 30 ? leafHi : leaf));
  const flower = (cx: number, cy: number, r: number) => {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      L.disc(cx + Math.cos(ang) * r * 0.8, cy + Math.sin(ang) * r * 0.8, r * 0.62, (x, y) => (y < cy - r * 0.3 ? petalHi : x > cx + r * 0.3 ? petalLo : petal));
    }
    L.disc(cx, cy, r * 0.32, heart);
  };
  flower(48, 90, 15);
  flower(76, 62, 12);
  flower(98, 92, 11);
  for (const [px, py] of [[24, 54], [108, 120], [34, 140], [88, 128]]) L.poly([px, py, px + 4, py - 2, px + 6, py + 2, px + 2, py + 4], petal);
};

const palette = (L: Layer, a: RGB[]) => {
  const [wood, woodHi, woodLo, cyan, magenta, yellow, white, red] = a;
  L.poly([18, 92, 30, 66, 60, 58, 92, 64, 108, 86, 100, 110, 70, 118, 58, 108, 40, 116, 22, 110], (x, y) => ((x - 50) * 0.4 + (y - 80) < -10 ? woodHi : y > 104 ? woodLo : wood));
  L.disc(44, 102, 6, woodLo);
  for (const [cx, cy, c] of [[38, 76, cyan], [58, 70, magenta], [80, 74, yellow], [94, 92, red], [76, 100, white]] as [number, number, RGB][]) L.disc(cx, cy, 6, c);
  L.line(40, 132, 104, 40, 5, woodLo);
  L.line(42, 130, 98, 50, 3, woodHi);
  L.poly([96, 48, 104, 36, 112, 34, 108, 46], red);
};

const heart = (L: Layer, a: RGB[]) => {
  const [hRed, hHi, hLo, gold, goldHi, white] = a;
  const d = 10;
  L.poly([64, 124 + d, 26, 90 + d, 22, 74 + d, 30, 62 + d, 44, 58 + d, 58, 64 + d, 64, 72 + d, 70, 64 + d, 84, 58 + d, 98, 62 + d, 106, 74 + d, 102, 90 + d], (x, y) => ((x - 46) ** 2 + (y - 72 - d) ** 2 < 110 ? hHi : x > 86 || y > 104 + d ? hLo : hRed));
  L.disc(42, 72 + d, 4, white);
  L.poly([42, 58 + d, 42, 40 + d, 53, 48 + d, 64, 34 + d, 75, 48 + d, 86, 40 + d, 86, 58 + d], (_x, y) => (y < 48 + d ? goldHi : gold));
  for (const [cx, cy] of [[42, 40], [64, 34], [86, 40]]) L.disc(cx, cy + d, 3, goldHi);
};

const LOOKS: Record<PackId, Look> = {
  metal: { body: ['#4a2c0c', '#b07a20', '#e8b24a'], art: gem, accent: ['#f2c14e', '#fff0b0', '#a8701c', '#5fd6ff', '#c8f4ff', '#2a80c8', '#ffffff'] },
  light: { body: ['#0e1440', '#2a3c9a', '#5a78e0'], art: star, accent: ['#ffd84a', '#fff6c8', '#ffb84a', '#e07a2a', '#ffffff', '#ff7ab0'] },
  nature: { body: ['#0f3a24', '#2f7a46', '#5aae66'], art: blossom, accent: ['#5a3420', '#ffa8c8', '#ffe0ec', '#e0628f', '#ffe14a', '#3c9a4a', '#8ad87a'] },
  studio: { body: ['#5a140c', '#c8442a', '#f07a4a'], art: palette, accent: ['#c8904a', '#f0c88a', '#7a4a20', '#20b8e8', '#ff3a8a', '#ffe24a', '#ffffff', '#e8262a'] },
  supporter: { body: ['#8a8fa6', '#cfd4e2', '#f6f8ff'], art: heart, accent: ['#e8304a', '#ff8aa0', '#9a1830', '#f2c14e', '#fff0b0', '#ffffff'] },
};

export interface PackWords {
  /** The theme's name in big Latin capitals (pixel faces read best that way). */
  big: string;
  /** A short second line ("金属パック" / "PACK"). */
  line: string;
  /** The top tier's wavy word above the art (the Supporter pack). */
  top?: string;
}

/** Paints the wrapper into `face`, and where its finish goes into `mask` (r: finish, b: plain ink). */
export function paintPack(face: HTMLCanvasElement, mask: HTMLCanvasElement, pack: Pack, words: PackWords): void {
  const g = new Grid();
  const look = LOOKS[pack.id];
  const [dk, md, lt] = look.body.map(rgb);
  const ink = rgb(INK);
  const silver = ['#5c6270', '#8e95a5', '#c3c9d6', '#eef2fa', '#ffffff'].map(rgb);
  const top = !!pack.supporter;

  for (let y = 0; y < GRID_H; y++) {
    const [l, r] = edges(y);
    const seal = y < SEAL || y >= GRID_H - SEAL;
    // Teeth along the outer edge of each seal.
    if ((y < 3 || y >= GRID_H - 3) && seal) {
      const edgeRow = y < 3 ? y : GRID_H - 1 - y;
      for (let x = l; x <= r; x++) if ((x % 6) / 6 < edgeRow / 3 + 0.34 || edgeRow === 2) seal && g.set(x, y, silver[edgeRow + 1]);
      continue;
    }
    for (let x = l; x <= r; x++) {
      const u = (x - l) / (r - l);
      if (seal) {
        // Silver seal: pressed ridges across, pinched every few pixels, a highlight that runs along.
        const sy = y < SEAL ? y : GRID_H - 1 - y;
        let k = [3, 2, 1, 2, 3, 2, 1, 0][sy % 8] ?? 1;
        if (x % 7 === 0) k = Math.max(0, k - 1);
        if (sy === SEAL - 1) k = 0;
        if (Math.abs(u - 0.3) < 0.06 && sy % 8 < 3) k = 4;
        g.set(x, y, silver[k]);
        continue;
      }
      // Body: its color, lit from the upper left, darker toward the sides like a filled pillow, dithered.
      const side = Math.min(u, 1 - u);
      let shade = 0.55 - (y - SEAL) / (GRID_H - 2 * SEAL) * 0.35 + (side < 0.12 ? (side - 0.12) * 4 : 0);
      // A broad diagonal gloss band.
      const band = Math.abs((x * 0.8 + y) - 70) < 10 ? 0.18 : 0;
      shade += band;
      let c: RGB;
      if (top) {
        // The top tier: silver-white with a pastel rainbow drifting across in steps.
        const hue = ((x + y * 0.6) / 40) % 1;
        const rain: RGB = [190 + 60 * Math.sin(hue * 6.28), 190 + 60 * Math.sin(hue * 6.28 + 2.1), 200 + 55 * Math.sin(hue * 6.28 + 4.2)];
        c = mix(mix(md, lt, shade > dither(x, y) ? 1 : 0.4), rain, 0.35);
        if (side < 0.1) c = mix(c, dk, (0.1 - side) * 6);
      } else {
        // Flat bands of the three tones; only a narrow seam between two bands is dithered.
        const t = shade * 2;
        const seam = (v: number) => (Math.abs(v - 0.5) < 0.12 ? (v > dither(x, y) ? 1 : 0) : v > 0.5 ? 1 : 0);
        c = t > 1 ? mix(md, lt, seam(Math.min(1, t - 1))) : mix(dk, md, seam(Math.max(0, t)));
      }
      g.set(x, y, c);
    }
  }
  // The perforation: a dotted line just under the top seal.
  const ty = Math.round(TEAR_Y * GRID_H);
  // The perforation, plain to see: white dashes on an ink line, the line to trace.
  for (let x = 6; x < GRID_W - 6; x++) {
    g.set(x, ty - 1, ink);
    g.set(x, ty + 1, ink);
    g.set(x, ty, x % 5 < 3 ? rgb('#ffffff') : ink);
  }

  // The illustration, inked.
  const art = new Layer();
  look.art(art, look.accent.map(rgb));
  art.stamp(g, 1);

  // A small FOIL plate under the seal.
  const tiles: [string, string][] = top ? [['F', '#d9a441'], ['O', '#d9a441'], ['I', '#d9a441'], ['L', '#d9a441']] : [['F', '#ff6b5f'], ['O', '#ffb341'], ['I', '#4fd3a3'], ['L', '#4ab0ff']];
  if (!top) tiles.forEach(([ch, col], i) => {
    const x0 = 44 + i * 10;
    const y0 = 24 + (i % 2);
    const tl = new Layer();
    tl.fill(x0, y0, x0 + 8, y0 + 10, () => rgb(col));
    tl.stamp(g, 1);
    const letter = textLayer(ch, '700 8px Silkscreen', x0 + 4.5, y0 + 5.5, () => rgb('#262d31'));
    letter.stamp(g, 0, 2);
  });

  // The top tier's wavy word above the art.
  if (words.top) {
    const w = textLayer(words.top, words.top.length > 7 ? '8px Silkscreen' : '16px Silkscreen', 64, 33, (x, y) => mix(rgb('#fff0b0'), rgb('#f2c14e'), ((x + y) % 7) / 7), 0, 2);
    w.stamp(g, 1, 2);
  }

  // The name in an arc of big outlined letters, on a speech-bubble plate in the body's dark tone.
  const bubble = new Layer();
  bubble.poly([12, 132, 22, 120, 64, 116, 106, 120, 116, 132, 112, 166, 64, 171, 16, 166], (_x, y) => (y < 128 ? md : dk));
  bubble.stamp(g, 1);
  // Silkscreen is drawn on an 8-pixel grid: sizes in steps of 8 keep every stroke (M is not H).
  const size = words.big.length > 5 ? 16 : 24;
  const title = textLayer(words.big, `${size}px Silkscreen`, 64, 138, (_x, y) => (y < 136 ? rgb('#ffffff') : rgb(top ? '#ffe9a8' : PAPER)), 5);
  title.stamp(g, 2, 2);
  const line = textLayer(words.line, /[^\x00-\x7f]/.test(words.line) ? '16px DotGothic16' : '8px Silkscreen', 64, 160, () => rgb(top ? '#ffe9a8' : PAPER), 0);
  line.stamp(g, 1, 2);

  // The bag's own outline, two pixels of ink.
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      if (g.inside(x, y)) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) near = Math.abs(dx) + Math.abs(dy) <= 3 && g.inside(x + dx, y + dy) && g.kind[(y + dy) * GRID_W + x + dx] !== 0;
      if (near) g.set(x, y, ink, 1);
    }

  // Blow it up with hard pixels; the mask follows the same grid.
  const small = document.createElement('canvas');
  small.width = GRID_W;
  small.height = GRID_H;
  small.getContext('2d')!.putImageData(new ImageData(g.px, GRID_W, GRID_H), 0, 0);
  const m = new Uint8ClampedArray(GRID_W * GRID_H * 4);
  for (let i = 0; i < g.kind.length; i++) {
    m[i * 4] = g.kind[i] === 1 ? 255 : 0;
    m[i * 4 + 2] = g.kind[i] === 2 ? 255 : 0;
    m[i * 4 + 3] = g.kind[i] ? 255 : 0;
  }
  const smallMask = document.createElement('canvas');
  smallMask.width = GRID_W;
  smallMask.height = GRID_H;
  smallMask.getContext('2d')!.putImageData(new ImageData(m, GRID_W, GRID_H), 0, 0);
  for (const [dst, src] of [[face, small], [mask, smallMask]] as const) {
    dst.width = PACK_W;
    dst.height = PACK_H;
    const ctx = dst.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, PACK_W, PACK_H);
  }
}

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
