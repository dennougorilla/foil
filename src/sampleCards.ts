// The card samples, fetched on demand (docs/performance.md): a Joker playing card and three cards from
// an imaginary card game, drawn as pixel art in flat colors with bold outlines, so a finish has clear
// lights, darks and color fields to work on. The game cards' words are written in the page's language.
import type { Lang } from './i18n';

export const CARD_SAMPLES = 4;

// ---------- A tiny pixel canvas ----------

type Pred = (x: number, y: number) => boolean;
type Paint = number | ((x: number, y: number) => number);

class Grid {
  /** Palette index per pixel, -1 where nothing is drawn. */
  c: Int16Array;
  /** Which shape drew the pixel: a later shape gets an outline against an earlier one. */
  part: Int16Array;
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.c = new Int16Array(w * h).fill(-1);
    this.part = new Int16Array(w * h);
  }
  fill(pred: Pred, paint: Paint, part = 0) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!pred(x, y)) continue;
        const i = y * this.w + x;
        this.c[i] = typeof paint === 'number' ? paint : paint(x, y);
        this.part[i] = part;
      }
  }
  set(x: number, y: number, c: number) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.c[y * this.w + x] : -1;
  }
  /** A bitmap glyph ('1' = ink). */
  glyph(rows: string[], x: number, y: number, c: number) {
    rows.forEach((r, j) => [...r].forEach((d, i) => d === '1' && this.set(x + i, y + j, c)));
  }
  /** An outline of `ink` round the shapes, and between a shape and the ones drawn under it. */
  outline(ink: number) {
    const out = this.c.slice();
    const { w, h } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (this.c[j] < 0) continue;
          if (this.c[i] < 0 || this.part[j] > this.part[i]) out[i] = ink;
        }
      }
    this.c = out;
  }
  /** This grid laid over another at (ox, oy). */
  over(under: Grid, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.c[y * this.w + x] >= 0) under.set(x + ox, y + oy, this.c[y * this.w + x]);
  }
}

const ell = (cx: number, cy: number, rx: number, ry = rx): Pred => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const box = (x0: number, y0: number, x1: number, y1: number): Pred => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const poly = (pts: number[][]): Pred => (x, y) => {
  const px = x + 0.5;
  const py = y + 0.5;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const and = (...ps: Pred[]): Pred => (x, y) => ps.every((p) => p(x, y));
const not = (p: Pred): Pred => (x, y) => !p(x, y);
/** Which side of the line a→b a pixel is on (positive: the right, walking from a to b). */
const side = (ax: number, ay: number, bx: number, by: number) => (x: number, y: number) => (bx - ax) * (y + 0.5 - ay) - (by - ay) * (x + 0.5 - ax) < 0;
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered dithering between two colors: true where the pixel takes the second at mix `v` (0..1). */
const dith = (x: number, y: number, v: number) => v > (bayer[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
const rand = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** A ramp of palette indices read at 0..1 with dithering between steps. */
const ramp = (r: number[], v: number, x: number, y: number) => {
  const f = Math.max(0, Math.min(0.9999, v)) * (r.length - 1);
  const i = Math.floor(f);
  return r[Math.min(r.length - 1, i + (dith(x, y, f - i) ? 1 : 0))];
};

// ---------- Glyphs ----------

const BIG: Record<string, string[]> = {
  J: ['111111', '000110', '000110', '000110', '110110', '110110', '011100'],
  O: ['011110', '110011', '110011', '110011', '110011', '110011', '011110'],
  K: ['110011', '110110', '111100', '111000', '111100', '110110', '110011'],
  E: ['111111', '110000', '110000', '111110', '110000', '110000', '111111'],
  R: ['111110', '110011', '110011', '111110', '111100', '110110', '110011'],
};
const SMALL: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '5': ['111', '100', '111', '001', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '/': ['001', '001', '010', '100', '100'],
};
const STAR = ['00100', '00100', '11111', '01110', '01010'];

// ---------- The Joker (72 × 96) ----------

const JOKER_COLORS = [
  '#1e1626', '#f6f1e7', '#e2d9c6', '#f8e8bd', '#f0d185', '#d8413f', '#8f2433', '#7048b0',
  '#48307a', '#2fa59a', '#1c6d68', '#f4bb3a', '#b9761d', '#fffaf0', '#e7dccb', '#f08a92',
  '#c03a3a',
];
const J = { ink: 0, paper: 1, paperD: 2, sun: 3, sunD: 4, red: 5, redD: 6, pur: 7, purD: 8, teal: 9, tealD: 10, gold: 11, goldD: 12, face: 13, faceD: 14, pink: 15, letter: 16 };

function joker(): Grid {
  const W = 72;
  const H = 96;
  const g = new Grid(W, H);
  // The card: cream, a thin line inset, and a sunburst behind the figure.
  g.fill(() => true, J.paper);
  g.fill((x, y) => (x === 2 || x === W - 3 || y === 2 || y === H - 3) && x >= 2 && x <= W - 3 && y >= 2 && y <= H - 3 && !((x === 2 || x === W - 3) && (y === 2 || y === H - 3)), J.paperD);
  const sx = 36;
  const sy = 50;
  g.fill(ell(sx, sy, 27), (x, y) => {
    const a = Math.atan2(y + 0.5 - sy, x + 0.5 - sx);
    return Math.floor(((a + Math.PI) / (2 * Math.PI)) * 24) % 2 ? J.sun : J.sunD;
  });
  g.fill(and(ell(sx, sy, 27), not(ell(sx, sy, 26))), J.sunD);

  // The jester, on its own layer so it can be outlined.
  const f = new Grid(W, H);
  const P = { body: 1, stick: 2, mhead: 3, ruff: 4, face: 5, hat: 6, band: 7, bell: 8 };
  // Body: a harlequin doublet in purple and gold diamonds.
  f.fill(poly([[18, 96], [21, 70], [27, 64], [45, 64], [51, 70], [54, 96]]), (x, y) => {
    const a = Math.floor((x - 36 + y) / 5);
    const b = Math.floor((x - 36 - y) / 5);
    const purple = (a + b) % 2 === 0;
    const shade = x > 42;
    return purple ? (shade ? J.purD : J.pur) : shade ? J.goldD : J.gold;
  }, P.body);
  // The marotte: a stick with a little jester's head, held up on the left.
  f.fill(poly([[14, 66], [16, 66], [21, 96], [18, 96]]), J.goldD, P.stick);
  f.fill(poly([[19, 82], [26, 79], [28, 85], [21, 88]]), J.face, P.ruff);
  f.fill(ell(14, 60, 5, 5), (x) => (x > 15 ? J.faceD : J.face), P.mhead);
  f.fill(poly([[9, 58], [19, 58], [21, 50], [14, 54], [7, 50]]), (x) => (x < 14 ? J.teal : J.red), P.hat);
  // Ruff collar, scalloped, red and cream.
  f.fill(and(ell(36, 63, 19, 6), (x, y) => y < 63 || ((x - 17) % 6) - 3 + (y - 63) * 0.9 < 3), (x) => (Math.floor((x - 17) / 6) % 2 ? J.face : J.red), P.ruff);
  // Face.
  f.fill(ell(36, 47, 10.5, 11), (x) => (x > 43 ? J.faceD : J.face), P.face);
  // Hat: three prongs (red, purple, teal), each shaded on one side, over a gold band.
  const prong = (pts: number[][], tip: number[], light: number, dark: number) =>
    f.fill(poly(pts), (x, y) => (side(36, 40, tip[0], tip[1])(x, y) ? dark : light), P.hat);
  prong([[24, 38], [32, 35], [26, 25], [13, 15], [18, 28]], [13, 15], J.red, J.redD);
  prong([[30, 36], [42, 36], [40, 22], [36, 7], [32, 22]], [36, 7], J.pur, J.purD);
  prong([[40, 35], [48, 38], [54, 28], [59, 15], [46, 25]], [59, 15], J.teal, J.tealD);
  f.fill(poly([[23, 36], [49, 36], [50, 41], [22, 41]]), (x, y) => ((x + y) % 4 === 0 ? J.goldD : J.gold), P.band);
  for (const [bx, by] of [[13, 14], [36, 6], [59, 14]]) f.fill(ell(bx, by, 3), (x, y) => (x + y > bx + by + 1 ? J.goldD : J.gold), P.bell);
  f.outline(J.ink);
  // Details over the outline: bell shines, a wink, a grin, a round nose, a diamond under the open eye.
  for (const [bx, by] of [[13, 14], [36, 6], [59, 14]]) f.set(bx - 1, by - 2, J.face);
  for (const [x, y] of [[29, 45], [30, 44], [31, 44], [32, 45]]) f.set(x, y, J.ink);
  f.fill(box(39, 43, 40, 45), J.ink, P.face);
  f.set(39, 43, J.face);
  for (const [x, y] of [[40, 48], [39, 49], [41, 49], [40, 50]]) f.set(x, y, J.teal);
  f.set(40, 49, J.tealD);
  f.fill(box(28, 49, 29, 49), J.pink, P.face);
  f.fill(box(43, 50, 44, 50), J.pink, P.face);
  f.fill(and(ell(36, 51, 7, 5), (_, y) => y >= 52), (x, y) => (y === 52 || x === 29 || x === 42 ? J.ink : y === 53 && x > 31 && x < 40 ? J.face : J.redD), P.face);
  f.fill(ell(36, 49.5, 1.6), J.red, P.face);
  f.set(35, 48, J.pink);
  // The little head's face: two dots and a smile.
  f.set(13, 60, J.ink);
  f.set(16, 60, J.ink);
  f.set(14, 62, J.redD);
  f.set(15, 62, J.redD);
  // Gold pompoms down the doublet.
  for (const y of [72, 80, 88]) f.fill(ell(36, y, 1.6), (x, yy) => (x + yy > 36 + y ? J.goldD : J.face), P.body);
  f.over(g);

  // JOKER down the top-left corner, and turned round in the bottom-right.
  const mark = (rows: string[], x: number, y: number, c: number) => {
    g.glyph(rows, x, y, c);
    g.glyph(rows.map((r) => [...r].reverse().join('')).reverse(), W - x - rows[0].length, H - y - rows.length, c);
  };
  [...'JOKER'].forEach((ch, k) => mark(BIG[ch], 3, 5 + k * 8, J.letter));
  mark(STAR, 4, 46, J.gold);
  return g;
}

// ---------- The game cards (96 × 128) ----------

const GAME_COLORS = [
  '#14131d', '#262b42', '#3a4163', '#c8a95a', '#f2c14e', '#efe5c8', '#d9caa0', '#fff6dc',
  // the art's own colors start at 8
];
const G = { ink: 0, slate: 1, slateL: 2, gold: 3, star: 4, parch: 5, parchD: 6, white: 7 };

interface GameCard {
  no: string;
  stars: number;
  colors: string[];
  /** Paints the art window (84 × 66) into its own grid. */
  art: (a: Grid) => void;
}

/** A glowing blue jewel that is a whole little world, with a ring. */
const orb: GameCard = {
  no: '001/120',
  stars: 3,
  colors: ['#060b24', '#0e1a45', '#1b2f6e', '#0b2a6b', '#1552b5', '#2f86e8', '#7cc8ff', '#dff6ff', '#f2c14e', '#b9761d', '#3cc3a8', '#1d7f73'],
  art(a) {
    const C = { sp0: 8, sp1: 9, sp2: 10, b0: 11, b1: 12, b2: 13, b3: 14, b4: 15, ring: 16, ringD: 17, land: 18, landD: 19 };
    const cx = 42;
    const cy = 34;
    a.fill(() => true, (x, y) => {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 28 && dith(x, y, (28 - d) / 10)) return C.b0;
      return ramp([C.sp0, C.sp1, C.sp2], 1 - d / 46, x, y);
    });
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (rand(x, y) > 0.975 && Math.hypot(x - cx, y - cy) > 26) a.set(x, y, rand(y, x) > 0.6 ? C.ring : C.b4);
    const f = new Grid(a.w, a.h);
    const ringBack = and(ell(cx, cy + 1, 36, 8), not(ell(cx, cy + 1, 32, 6)), (_, y) => y < cy + 1);
    const ringFront = and(ell(cx, cy + 1, 36, 8), not(ell(cx, cy + 1, 32, 6)), (_, y) => y >= cy + 1);
    f.fill(ringBack, C.ringD, 1);
    // The jewel: an octagonal table in the middle and facets round it, lit from the top left.
    const R = 22;
    f.fill(ell(cx, cy, R), (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const k = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8 + 0.5) % 8;
      const ang = (k / 8) * 2 * Math.PI - Math.PI;
      const lit = -(Math.cos(ang) + Math.sin(ang)) * 0.7;
      const table = Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) * 0.75) < 9;
      // Seas and lands seen through the stone.
      const landish = Math.sin(dx * 0.35 + 1) + Math.sin(dy * 0.45 + dx * 0.15) > 1.1;
      if (table) return landish ? (dx + dy > 2 ? C.landD : C.land) : dx + dy < -6 ? C.b4 : C.b3;
      const v = 0.45 + lit * 0.45 - (d - 9) / 40;
      if (landish && d < 17) return v > 0.5 ? C.land : C.landD;
      return ramp([C.b0, C.b1, C.b2, C.b3], v, x, y);
    }, 2);
    f.fill(ringFront, (x) => (x < cx ? C.ring : C.ringD), 3);
    f.outline(G.ink);
    // A glint on the table and a sparkle on the rim.
    for (const [x, y] of [[36, 27], [37, 27], [36, 28], [35, 30]]) f.set(x, y, C.b4);
    const spark = (sx: number, sy: number, n: number, c: number) => {
      for (let i = -n; i <= n; i++) {
        f.set(sx + i, sy, c);
        f.set(sx, sy + i, c);
      }
    };
    spark(25, 18, 3, C.b4);
    spark(64, 50, 2, C.b4);
    spark(70, 12, 1, C.ring);
    f.over(a);
  },
};

/** Two travellers hand in hand, rising from a ring of light. */
const road: GameCard = {
  no: '058/120',
  stars: 2,
  colors: ['#1b1440', '#3a2370', '#6b3a8f', '#c4588a', '#f29a7a', '#ffd79a', '#2a1a3a', '#4b2f5e', '#7be0d0', '#e8fff8', '#f7c95b'],
  art(a) {
    const C = { s0: 8, s1: 9, s2: 10, s3: 11, s4: 12, s5: 13, fig: 14, figL: 15, glow: 16, glowL: 17, gold: 18 };
    a.fill(() => true, (x, y) => ramp([C.s0, C.s1, C.s2, C.s3, C.s4, C.s5], y / 66 + Math.sin(x * 0.08) * 0.04, x, y));
    // Clouds in bands.
    a.fill((x, y) => y > 38 && y < 48 && Math.sin(x * 0.21 + y) + Math.sin(x * 0.07) > 1.1, C.s4);
    for (let y = 0; y < 30; y++) for (let x = 0; x < a.w; x++) if (rand(x, y) > 0.98) a.set(x, y, C.glowL);
    // A column of light going up from the ring.
    a.fill((x, y) => Math.abs(x + 0.5 - 42) < 9 + (66 - y) * 0.12 && y < 58, (x, y) => (dith(x, y, 0.5 - Math.abs(x + 0.5 - 42) / 28) ? C.glow : a.get(x, y)));
    const f = new Grid(a.w, a.h);
    // The ring of light underfoot.
    f.fill(and(ell(42, 57, 26, 6), not(ell(42, 57, 21, 3.6))), (x) => (Math.floor(x / 3) % 2 ? C.glow : C.glowL), 1);
    // Two figures: a tall one in a pointed hat and a small one, their hands joined between them.
    const body = (cx: number, top: number, h: number, w: number) =>
      f.fill(poly([[cx - w, top + h], [cx - 1.5, top], [cx + 1.5, top], [cx + w, top + h]]), (x) => (x > cx + 1 ? C.figL : C.fig), 2);
    body(33, 30, 22, 7);
    f.fill(ell(33, 26, 4.2), C.fig, 3);
    f.fill(poly([[28, 25], [38, 25], [35, 13], [33, 10]]), (x) => (x > 34 ? C.figL : C.fig), 4);
    f.fill(box(26, 23, 40, 24), C.fig, 4);
    body(52, 38, 15, 5);
    f.fill(ell(52, 34.5, 3.6), C.fig, 3);
    f.fill(poly([[36, 37], [48, 41], [48, 43], [36, 40]]), C.fig, 5);
    f.outline(G.ink);
    // Rim light on their faces and the joined hands, and sparks going up.
    f.set(35, 26, C.figL);
    f.set(54, 34, C.figL);
    f.fill(ell(42, 40.5, 2), C.gold, 6);
    for (const [x, y, n] of [[42, 10, 2], [58, 18, 1], [24, 40, 1], [64, 8, 1], [14, 16, 1]]) {
      for (let i = -n; i <= n; i++) {
        f.set(x + i, y, C.glowL);
        f.set(x, y + i, C.glowL);
      }
    }
    f.over(a);
  },
};

/** A lighthouse on its rock, lit for the moment the sun comes up. */
const lighthouse: GameCard = {
  no: '007/120',
  stars: 1,
  colors: ['#22184a', '#4a2a6e', '#9a3f6f', '#e2685a', '#f8a95a', '#ffe3a0', '#0c1d3a', '#163a66', '#2f6aa0', '#9fd0f0', '#2a2430', '#4a3f4c', '#e44a3c', '#fff6dc', '#ffe066'],
  art(a) {
    const C = { k0: 8, k1: 9, k2: 10, k3: 11, k4: 12, k5: 13, w0: 14, w1: 15, w2: 16, w3: 17, rock: 18, rockL: 19, red: 20, white: 21, lamp: 22 };
    const sea = 46;
    a.fill(() => true, (x, y) => {
      if (y < sea) {
        const d = Math.hypot(x + 0.5 - 62, (y + 0.5 - sea) * 1.4);
        if (d < 9) return y % 3 === 0 && y > sea - 6 ? C.k4 : C.k5;
        return ramp([C.k0, C.k1, C.k2, C.k3, C.k4], y / sea + Math.max(0, 0.25 - d / 120), x, y);
      }
      const ry = y - sea;
      const wave = Math.sin(x * 0.5 + ry * 1.3) + Math.sin(x * 0.17 - ry * 0.6);
      if (Math.abs(x - 62) < 4 + ry * 0.5 && wave > 0.3) return wave > 1.2 ? C.k5 : C.k4;
      return ramp([C.w3, C.w2, C.w1, C.w0], 0.15 + ry / 22 - wave * 0.12, x, y);
    });
    // Beams out of the lamp, left and right.
    const lx = 26;
    const ly = 17;
    a.fill((x, y) => {
      const dx = x + 0.5 - lx;
      const dy = y + 0.5 - ly;
      return Math.abs(dx) > 4 && Math.abs(dy) < 1.2 + Math.abs(dx) * 0.16 && y < sea;
    }, (x, y) => (dith(x, y, 0.75 - Math.abs(x - lx) / 70) ? C.k5 : a.get(x, y)));
    const f = new Grid(a.w, a.h);
    f.fill(poly([[2, 66], [6, 50], [14, 44], [24, 42], [36, 44], [44, 52], [50, 66]]), (x, y) => (x + y * 0.5 < 30 && dith(x, y, 0.5) ? C.rockL : C.rock), 1);
    // The tower: tapered, in red and white bands.
    f.fill(poly([[19, 46], [21, 22], [31, 22], [33, 46]]), (x, y) => {
      const red = Math.floor((y - 22) / 6) % 2 === 0;
      const shade = x > 28;
      return red ? (shade ? C.k2 : C.red) : shade ? C.k5 : C.white;
    }, 2);
    f.fill(box(18, 20, 34, 22), C.rock, 3);
    f.fill(box(21, 13, 31, 19), (x) => (x % 3 === 0 ? C.rock : C.lamp), 4);
    f.fill(poly([[19, 13], [26, 6], [33, 13]]), (x) => (x > 26 ? C.rockL : C.red), 5);
    f.fill(box(22, 36, 24, 40), C.rock, 6);
    f.outline(G.ink);
    f.set(26, 4, C.lamp);
    f.over(a);
    // Gulls.
    for (const [x, y] of [[48, 14], [56, 22]]) for (const [dx, dy] of [[-2, 0], [-1, -1], [0, 0], [1, -1], [2, 0]]) a.set(x + dx, y + dy, C.rock);
  },
};

const GAME: GameCard[] = [orb, road, lighthouse];

function game(card: GameCard): Grid {
  const W = 96;
  const H = 128;
  const g = new Grid(W, H);
  g.fill(() => true, (x, y) => (dith(x, y, 0.15 + y / H * 0.2) ? G.slateL : G.slate));
  g.fill((x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1, G.ink);
  g.fill((x, y) => (x === 2 || x === W - 3 || y === 2 || y === H - 3) && x >= 2 && x <= W - 3 && y >= 2 && y <= H - 3, G.gold);
  // Collector number, top left; rarity in stars, top right.
  [...card.no].forEach((ch, k) => g.glyph(SMALL[ch], 7 + k * 4, 6, G.parch));
  for (let k = 0; k < card.stars; k++) g.glyph(STAR, 84 - k * 7, 6, G.star);
  // The art window in a gold line, the text box below it, the kind's strip at the foot.
  g.fill((x, y) => (x === 5 || x === 90 || y === 14 || y === 81) && x >= 5 && x <= 90 && y >= 14 && y <= 81, G.gold);
  const art = new Grid(84, 66);
  card.art(art);
  art.over(g, 6, 15);
  g.fill(box(6, 85, 89, 115), (x, y) => (x === 6 || x === 89 || y === 85 || y === 115 ? G.parchD : G.parch));
  g.fill(box(6, 118, 89, 124), G.slate);
  g.fill((x, y) => y === 121 && x >= 50 && x <= 88 && x % 2 === 0, G.gold);
  return g;
}

// ---------- Words ----------

const WORDS: Record<Lang, { kind: string; text: string }[]> = {
  ja: [
    { kind: 'アイテム', text: '海と空をまるごと閉じこめた宝石。のぞくと、小さな星の上で波がきらめいている。' },
    { kind: '呪文', text: '手をつないだ二人を、思い出の場所へひとっとびで運ぶ。手を離したら、そこでおしまい。' },
    { kind: '場所', text: '夜明けの一瞬だけ灯る灯台。この光を見た船は、かならず港へ帰りつく。' },
  ],
  en: [
    { kind: 'ITEM', text: 'A gem that holds a whole sea and sky. Look inside and waves glitter on a tiny world.' },
    { kind: 'SPELL', text: 'Carries two people holding hands to a place they remember. Let go, and the trip ends there.' },
    { kind: 'PLACE', text: 'Lit for one moment at dawn. Any ship that sees its light always finds its way home.' },
  ],
};

/** The words written on card `i` in a language (none on the Joker). */
export const cardText = (i: number, lang: Lang) => (i === 0 ? null : WORDS[lang][i - 1]);

const cache: { w: number; h: number; rgba: Uint8ClampedArray }[] = [];

/** Card `i`'s pixels, one per art pixel (the Joker 72 × 96, a game card 96 × 128). */
export function cardPixels(i: number) {
  if (cache[i]) return cache[i];
  const g = i === 0 ? joker() : game(GAME[i - 1]);
  const colors = (i === 0 ? JOKER_COLORS : [...GAME_COLORS, ...GAME[i - 1].colors]).map((h) => parseInt(h.slice(1), 16));
  const rgba = new Uint8ClampedArray(g.w * g.h * 4);
  g.c.forEach((c, p) => {
    const n = colors[c];
    rgba.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], p * 4);
  });
  return (cache[i] = { w: g.w, h: g.h, rgba });
}

// ---------- Painting ----------

const FONT = '"DotGothic16", monospace';

/** Lines of `text` no wider than `max`: words in English, characters in Japanese (a stop never starts a line). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lang: Lang): string[] {
  const units = lang === 'en' ? text.split(' ').map((w, k) => (k ? ` ${w}` : w)) : [...text];
  const lines: string[] = [];
  let line = '';
  for (const u of units) {
    if (line && ctx.measureText(line + u).width > max && !(lang === 'ja' && '、。」'.includes(u))) {
      lines.push(line);
      line = u.trimStart();
    } else line += u;
  }
  return [...lines, line];
}

/** Text with hard edges, so it sits on the pixel art like the rest of it. */
function crispText(ctx: CanvasRenderingContext2D, draw: (c: CanvasRenderingContext2D) => void, color: string) {
  const { width, height } = ctx.canvas;
  const t = document.createElement('canvas');
  t.width = width;
  t.height = height;
  const c = t.getContext('2d')!;
  c.fillStyle = color;
  c.textBaseline = 'top';
  draw(c);
  const img = c.getImageData(0, 0, width, height);
  for (let p = 3; p < img.data.length; p += 4) img.data[p] = img.data[p] >= 110 ? 255 : 0;
  c.putImageData(img, 0, 0);
  ctx.drawImage(t, 0, 0);
}

function paint(i: number, lang: Lang): HTMLCanvasElement {
  const { w, h, rgba } = cardPixels(i);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  small.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  // About one face pixel per canvas pixel in the classic card's art window.
  const k = i === 0 ? 11 : 8;
  const big = document.createElement('canvas');
  big.width = w * k;
  big.height = h * k;
  const ctx = big.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, big.width, big.height);
  const words = cardText(i, lang);
  if (words) {
    crispText(ctx, (c) => {
      c.font = `36px ${FONT}`;
      const lines = wrap(c, words.text, 78 * k, lang);
      const top = 85 * k + (31 * k - lines.length * 48) / 2 + 4;
      lines.forEach((l, n) => c.fillText(l, 9 * k, top + n * 48));
    }, '#14131d');
    crispText(ctx, (c) => {
      c.font = `32px ${FONT}`;
      c.fillText(words.kind, 8 * k, 117 * k + 4);
    }, '#efe5c8');
  }
  return big;
}

/** The four card samples, painted in a language once the pixel font has the characters they use. */
export async function paintCards(lang: Lang): Promise<HTMLCanvasElement[]> {
  const all = WORDS[lang].map((w) => w.kind + w.text).join('');
  await document.fonts.load(`36px ${FONT}`, all).catch(() => undefined);
  return Array.from({ length: CARD_SAMPLES }, (_, i) => paint(i, lang));
}
