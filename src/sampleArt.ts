// The illustrated samples, fetched on demand (docs/performance.md): five pixel-art pictures drawn by code
// like the scenes in samples.ts, at the same size and scale, each in a small palette with strong lights,
// darks and color fields for a finish to work on. A gem planet, a wind spirit, a chained sword and
// shield, travellers flying over the clouds, and a jester.

export const ART_SAMPLES = 5;

const W = 72;
const H = 96;
const SCALE = 8;

// ---------- A tiny pixel canvas ----------

type Pred = (x: number, y: number) => boolean;
type Paint = number | ((x: number, y: number) => number);

class Grid {
  /** Palette index per pixel, -1 where nothing is drawn. */
  c = new Int16Array(W * H).fill(-1);
  /** Which shape drew the pixel: a later shape gets an outline against an earlier one. */
  part = new Int16Array(W * H);
  fill(pred: Pred, paint: Paint, part = 0) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!pred(x, y)) continue;
        const i = y * W + x;
        this.c[i] = typeof paint === 'number' ? paint : paint(x, y);
        this.part[i] = part;
      }
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) this.c[y * W + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H ? this.c[y * W + x] : -1;
  }
  /** An outline of `ink` round the shapes, and between a shape and the ones drawn under it. */
  outline(ink: number) {
    const out = this.c.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (this.c[j] < 0) continue;
          if (this.c[i] < 0 || this.part[j] > this.part[i]) out[i] = ink;
        }
      }
    this.c = out;
  }
  /** This grid laid over another. */
  over(under: Grid) {
    this.c.forEach((c, i) => c >= 0 && (under.c[i] = c));
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
/** Which side of the line a→b a pixel is on (true: the left, walking from a to b, with y down). */
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
/** A four-pointed twinkle. */
const twinkle = (g: Grid, x: number, y: number, n: number, c: number, core = c) => {
  for (let i = -n; i <= n; i++) {
    g.set(x + i, y, c);
    g.set(x, y + i, c);
  }
  g.set(x, y, core);
};
/** Points along a cubic Bézier, about one per pixel. */
const bezier = (p0: number[], p1: number[], p2: number[], p3: number[]) => {
  const len = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * 1.6;
  return Array.from({ length: Math.ceil(len) + 1 }, (_, k) => {
    const t = k / Math.ceil(len);
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  });
};

interface Art {
  colors: string[];
  draw: () => Grid;
}

// ---------- A gem planet in black space ----------

const planet: Art = {
  colors: [
    '#020309', '#070a1c', '#0d1434', '#1a2350', '#5a6fb0', '#eef6ff',
    '#030a2c', '#07185a', '#0c2a8c', '#1444bc', '#2368e2', '#4f98f6', '#9ed2ff', '#ffffff',
    '#1c1a33', '#4b4870', '#a8a3cf', '#ffd98a',
  ],
  draw() {
    const S = { sp0: 0, sp1: 1, neb0: 2, neb1: 3, starD: 4, star: 5, m0: 14, m1: 15, m2: 16, gold: 17 };
    const blue = [6, 7, 8, 9, 10, 11, 12, 13];
    const cx = 34;
    const cy = 52;
    const R = 24;
    const g = new Grid();
    // Space: black, a faint band of nebula across it, a glow round the planet.
    g.fill(() => true, (x, y) => {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const glow = d > R ? Math.max(0, 1 - (d - R) / 6) : 0;
      if (glow > 0) return ramp([S.sp1, blue[1], blue[2], blue[4]], glow ** 2.2, x, y);
      const band = Math.sin(x * 0.08 - y * 0.06 + 1) + Math.sin(x * 0.21 + y * 0.05) * 0.4 - Math.abs(y - 24 - x * 0.3) * 0.05;
      return ramp([S.sp0, S.sp1, S.neb0, S.neb1], 0.18 + band * 0.25, x, y);
    });
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (rand(x, y) > 0.982 && Math.hypot(x - cx, y - cy) > R + 6) g.set(x, y, rand(y, x) > 0.7 ? S.star : S.starD);
    // The planet: a marbled stone, lit from the top left, its rim glowing.
    const L = [-0.52, -0.6, 0.6];
    g.fill(ell(cx, cy, R), (x, y) => {
      const nx = (x + 0.5 - cx) / R;
      const ny = (y + 0.5 - cy) / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      // Veins that wrap the sphere: where a warped wave crosses zero.
      const m = Math.sin(nx * 5.2 + Math.sin(ny * 4.1 + nz * 2.3) * 2.1 + Math.sin(nz * 6.5 + 0.7) * 1.2 + ny * 2);
      const m2 = Math.sin(ny * 7.3 - nx * 3.1 + Math.sin(nx * 6 + nz * 3) * 1.4);
      const vein = Math.max(0, 1 - Math.abs(m) * 4) * 0.55 + Math.max(0, 1 - Math.abs(m2) * 6) * 0.3;
      const cloud = m2 > 0.55 ? -0.12 : 0;
      const rim = (1 - nz) ** 3 * 0.55;
      const v = 0.02 + lam * 0.55 + vein * (0.35 + lam * 0.45) + cloud + rim;
      return ramp(blue, v, x, y);
    });
    // The shine on the stone: a window of light top left, a softer one bottom right.
    g.fill(ell(cx - 10, cy - 11, 5.5, 4), (x, y) => (ell(cx - 11, cy - 12, 3, 2)(x, y) ? blue[7] : dith(x, y, 0.75) ? blue[7] : blue[6]));
    g.fill(and(ell(cx, cy, R - 2), not(ell(cx - 2, cy - 2, R - 2)), (x, y) => x + 0.5 > cx + 6 && y + 0.5 > cy + 6), (x, y) => (dith(x, y, 0.5) ? blue[5] : blue[4]));
    // A small grey moon behind, top right, lit the same way.
    g.fill(ell(58, 18, 5), (x, y) => {
      const nx = (x + 0.5 - 58) / 5;
      const ny = (y + 0.5 - 18) / 5;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      return ramp([S.sp0, S.m0, S.m1, S.m2], 0.15 + Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) * 0.9, x, y);
    });
    // Twinkles: on the stone's glint, and out in space.
    twinkle(g, cx - 12, cy - 13, 4, blue[7]);
    twinkle(g, 12, 20, 2, S.star);
    twinkle(g, 64, 76, 2, blue[6], S.star);
    twinkle(g, 9, 86, 1, S.gold);
    twinkle(g, 44, 10, 1, S.gold);
    return g;
  },
};

// ---------- A wind spirit blowing a gust across the night ----------

const wind: Art = {
  colors: [
    '#05071a', '#0b1236', '#142058', '#1e3077', '#2c4a92', '#3f6aa8',
    '#fff7d6', '#8aa0d8',
    '#eef9ff', '#bfe3f5', '#7fb6dc',
    '#140f22', '#fbe3d3', '#e8b2a2', '#c77a86',
    '#fff4f0', '#d7f4ec', '#9ad8cf', '#58a7a8', '#2c6a78',
    '#3b2a6e', '#5c43a0', '#f2c45a',
  ],
  draw() {
    const S = { s: [0, 1, 2, 3, 4, 5], moon: 6, star: 7, w0: 8, w1: 9, w2: 10, ink: 11, skin: 12, skinD: 13, lip: 14, glint: 15, h0: 16, h1: 17, h2: 18, h3: 19, robe: 20, robeL: 21, gold: 22 };
    const g = new Grid();
    // The night: deep at the top, lighter low on the right where the gust ends.
    g.fill(() => true, (x, y) => ramp(S.s, 0.05 + (y / H) * 0.6 + (x / W) * 0.2 - Math.hypot(x - 46, y - 34) / 140, x, y));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand(x, y) > 0.985) g.set(x, y, rand(y, x) > 0.6 ? S.moon : S.star);
    // A thin moon high on the left.
    g.fill(and(ell(13, 13, 6), not(ell(16, 11, 5.4))), S.moon);
    // The gust: from her lips it sweeps up and to the right and winds into a spiral.
    const cx = 47;
    const cy = 33;
    const turn = 2.35 * Math.PI;
    const spiral: number[][] = [];
    for (let k = 0; k <= 260; k++) {
      const th = (k / 260) * turn;
      const r = 2 + th * 2.55;
      spiral.push([cx + Math.cos(th + 1.1) * r, cy + Math.sin(th + 1.1) * r * 0.9]);
    }
    spiral.reverse();
    const e = spiral[0];
    const mouth = [30, 66];
    const path = [...bezier(mouth, [40, 64], [e[0] + 8, e[1] + 12], e), ...spiral];
    const stroke = (pts: number[][], width: (t: number) => number, offset: number, from = 0, to = 1) => {
      pts.forEach(([px, py], k) => {
        const t = k / (pts.length - 1);
        if (t < from || t > to) return;
        const [qx, qy] = pts[Math.min(pts.length - 1, k + 1)];
        const [rx, ry] = pts[Math.max(0, k - 1)];
        const len = Math.hypot(qx - rx, qy - ry) || 1;
        const ox = px - ((qy - ry) / len) * offset;
        const oy = py + ((qx - rx) / len) * offset;
        const w = width(t);
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const d = Math.hypot(dx, dy);
            if (d > w) continue;
            const x = Math.round(ox + dx);
            const y = Math.round(oy + dy);
            const cur = g.get(x, y);
            const c = d < w - 1 ? S.w0 : dith(x, y, 0.6) ? S.w1 : cur;
            if (cur !== S.w0 || c === S.w0) g.set(x, y, c);
          }
      });
    };
    // Faint streams alongside it first, then the gust itself, swelling then thinning to the eye.
    stroke(path, (t) => 0.9 + Math.sin(t * Math.PI) * 0.4, 5.5, 0.08, 0.62);
    stroke(path, () => 0.8, -5, 0.2, 0.55);
    stroke(path, () => 0.7, 9, 0.3, 0.5);
    stroke(path, (t) => (t < 0.35 ? 2 + t * 4 : 3.4 - (t - 0.35) * 4.2), 0);
    // A soft haze in the turns of the spiral.
    g.fill(ell(cx, cy, 15, 13.5), (x, y) => (g.get(x, y) !== S.w0 && dith(x, y, 0.22 - Math.hypot(x - cx, y - cy) / 90) ? S.w2 : g.get(x, y)));
    // Petals riding the wind.
    for (const [x, y] of [[44, 58], [58, 50], [62, 22], [30, 18], [40, 14], [66, 38]]) {
      g.set(x, y, S.lip);
      g.set(x + 1, y, S.skin);
    }

    // The spirit, in profile facing up and to the right, her hair streaming down behind her.
    const f = new Grid();
    const P = { hair: 1, robe: 2, neck: 3, face: 4, fringe: 5, orn: 6 };
    // Hair: a long mane flowing from the crown down to the bottom left.
    const flow = (y: number) => 12 - (y - 60) * 0.18 + Math.sin(y * 0.22) * 3;
    f.fill((x, y) => {
      if (y < 52) return false;
      const half = 6 + (y - 52) * 0.28;
      return Math.abs(x + 0.5 - flow(y)) < half || ell(19, 59, 10, 8.5)(x, y);
    }, (x, y) => {
      const strand = Math.sin((x - flow(y)) * 0.9 + y * 0.12);
      const lit = (x - flow(y)) / 12 + (60 - y) / 70;
      return ramp([S.h3, S.h2, S.h1, S.h0], 0.45 + lit * 0.5 + strand * 0.22, x, y);
    }, P.hair);
    // The robe: shoulders and a sleeve in violet.
    f.fill(poly([[16, 96], [20, 78], [27, 72], [34, 74], [44, 96]]), (x, y) => (x + y * 0.3 < 46 ? S.robeL : S.robe), P.robe);
    f.fill(poly([[24, 70], [29, 69], [31, 76], [25, 77]]), S.skinD, P.neck);
    // Her face, tipped up: brow, nose, pursed lips, chin.
    f.fill(poly([[21, 54], [27, 52], [31, 56], [33, 60], [32, 62], [34, 64], [32, 66], [33, 67], [31, 69], [27, 71], [21, 68]]), (x, y) => (x < 25 && y > 62 ? S.skinD : S.skin), P.face);
    // The fringe falling over her brow.
    f.fill(poly([[13, 52], [20, 49], [27, 50], [31, 55], [26, 55], [23, 58], [19, 57]]), (x, y) => ramp([S.h2, S.h1, S.h0], 0.4 + (x - 13) / 30 - (y - 50) / 20, x, y), P.fringe);
    f.outline(S.ink);
    // A closed eye, a blush, the lips, a glint on the hair, a gold pin.
    for (const [x, y] of [[26, 59], [27, 60], [28, 60]]) f.set(x, y, S.ink);
    f.set(29, 59, S.ink);
    f.set(27, 63, S.lip);
    f.set(28, 63, S.lip);
    f.set(31, 66, S.lip);
    f.set(31, 65, S.lip);
    for (let k = 0; k < 6; k++) f.set(8 + k, 66 + k * 2, S.glint);
    for (let k = 0; k < 5; k++) f.set(17 + k, 76 + k * 3, S.h0);
    twinkle(f, 15, 52, 1, S.gold, S.glint);
    f.over(g);
    return g;
  },
};

// ---------- A sword wrapped in chain behind a cross-marked shield ----------

const oath: Art = {
  colors: [
    '#06070c', '#0d1018', '#161c2a', '#232c40', '#33405a',
    '#0b0b10', '#4a5568', '#8c9ab0', '#cdd6e4', '#f6f9ff',
    '#6e4a1c', '#b8802a', '#f0c050', '#fff0b0',
    '#3a2418', '#6a4128',
    '#0f1f4c', '#1a3478', '#2a52a8',
    '#463c4a', '#a99cb0',
  ],
  draw() {
    const S = { bg: [0, 1, 2, 3, 4], ink: 5, st0: 6, st1: 7, st2: 8, st3: 9, g0: 10, g1: 11, g2: 12, g3: 13, grip: 14, gripL: 15, f0: 16, f1: 17, f2: 18, ch0: 19, ch1: 20 };
    const g = new Grid();
    // The dark: a glow behind the shield and faint shafts of light rising from it.
    g.fill(() => true, (x, y) => {
      const d = Math.hypot(x + 0.5 - 36, (y + 0.5 - 50) * 0.85);
      const a = Math.atan2(y + 0.5 - 50, x + 0.5 - 36);
      const shaft = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 18) % 2 ? 0.1 : 0;
      return ramp(S.bg, 0.95 - d / 46 + shaft, x, y);
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand(x, y) > 0.99) g.set(x, y, S.bg[4]);

    const f = new Grid();
    const P = { chainBack: 1, blade: 2, guard: 3, chain: 4, shield: 5, rim: 6, cross: 7 };
    // The sword, from the pommel at the top left to the tip at the bottom right.
    const ax = 9;
    const ay = 3;
    const bx = 63;
    const by = 93;
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    /** A point's place along the sword (s) and across it (v). */
    const along = (x: number, y: number) => [(x + 0.5 - ax) * ux + (y + 0.5 - ay) * uy, -(x + 0.5 - ax) * uy + (y + 0.5 - ay) * ux];
    const at = (s: number, v: number) => [ax + ux * s - uy * v, ay + uy * s + ux * v];
    const guardAt = 16;
    // The chain: links winding round the blade, behind it on one turn and in front on the next. Each link lies along the chain, face on or edge on.
    const helix: number[][] = [];
    for (let s = guardAt + 2; s < len - 9; s += 0.25) helix.push([s, Math.sin(s * 0.45) * 5, Math.cos(s * 0.45)]);
    const path = helix.map(([s, v, z]) => [...at(s, v), z]);
    let run = 0;
    let face = true;
    for (let k = 1; k < path.length - 1; k++) {
      run += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
      if (run < 2.8) continue;
      run = 0;
      face = !face;
      const [x0, y0, z] = path[k];
      const tx = path[k + 1][0] - path[k - 1][0];
      const ty = path[k + 1][1] - path[k - 1][1];
      const tl = Math.hypot(tx, ty) || 1;
      const link = (rx: number, ry: number): Pred => (x, y) => {
        const dx = x + 0.5 - x0;
        const dy = y + 0.5 - y0;
        return ((dx * tx + dy * ty) / tl / rx) ** 2 + ((-dx * ty + dy * tx) / tl / ry) ** 2 <= 1;
      };
      const shape = face ? and(link(2.8, 1.9), not(link(1.4, 0.7))) : link(2.6, 0.9);
      f.fill(shape, (x, y) => (x + y < x0 + y0 ? S.ch1 : S.ch0), z > 0 ? P.chain : P.chainBack);
    }
    const front = f.c.slice();
    const frontPart = f.part.slice();
    f.c.forEach((_, i) => frontPart[i] === P.chain && ((f.c[i] = -1), (f.part[i] = 0)));
    f.fill((x, y) => {
      const [s, v] = along(x, y);
      if (s < guardAt || s > len) return false;
      const half = s > len - 8 ? 3 * ((len - s) / 8) : 3;
      return Math.abs(v) <= half;
    }, (x, y) => {
      const [, v] = along(x, y);
      if (Math.abs(v) < 0.6) return S.st1;
      return v < 0 ? (v < -2 ? S.st2 : S.st3) : v > 2 ? S.st0 : S.st1;
    }, P.blade);
    f.fill((x, y) => {
      const [s, v] = along(x, y);
      return s >= 4 && s < guardAt - 1 && Math.abs(v) <= 1.6;
    }, (x, y) => (Math.floor(along(x, y)[0]) % 3 === 0 ? S.grip : S.gripL), P.blade);
    f.fill((x, y) => {
      const [s, v] = along(x, y);
      return (Math.abs(s - (guardAt - 1)) <= 1.5 && Math.abs(v) <= 9) || Math.hypot(s - 2, v) <= 3;
    }, (x, y) => {
      const [s, v] = along(x, y);
      return v + s * 0.2 < 0 ? S.g2 : S.g1;
    }, P.guard);
    front.forEach((c, i) => frontPart[i] === P.chain && ((f.c[i] = c), (f.part[i] = P.chain)));
    // The shield: a heater shape, a blue field, a gold rim, a silver cross.
    const sx = 33;
    const top = 30;
    const halfW = 19;
    const shoulder = 52;
    const point = 86;
    const inShield = (inset: number): Pred => (x, y) => {
      const px = Math.abs(x + 0.5 - sx);
      const py = y + 0.5;
      if (py < top + inset || py > point - inset * 1.4) return false;
      if (py <= shoulder) return px <= halfW - inset;
      const k = (py - shoulder) / (point - shoulder);
      return px <= (halfW - inset) * (1 - k ** 1.7);
    };
    f.fill(inShield(0), (x, y) => (x + y * 0.6 < sx + 32 ? S.g2 : S.g1), P.rim);
    f.fill(inShield(3), (x, y) => ramp([S.f0, S.f1, S.f2], 0.95 - ((x - (sx - halfW)) / 38) * 0.6 - ((y - top) / 56) * 0.5, x, y), P.shield);
    const crossY = 50;
    const arm = (x: number, y: number) => {
      const dx = x + 0.5 - sx;
      const dy = y + 0.5 - crossY;
      // A cross with flared ends.
      const vert = Math.abs(dx) <= 2.5 + Math.max(0, Math.abs(dy) - 10) * 0.45 && dy > -15 && dy < 24;
      const horz = Math.abs(dy) <= 2.5 + Math.max(0, Math.abs(dx) - 7) * 0.45 && Math.abs(dx) < 13;
      return vert || horz;
    };
    f.fill(arm, (x, y) => {
      const dx = x + 0.5 - sx;
      const dy = y + 0.5 - crossY;
      return dx + dy < -3 ? S.st3 : dx + dy < 4 ? S.st2 : S.st1;
    }, P.cross);
    f.outline(S.ink);
    // Rivets on the rim, a glint on the cross and on the pommel.
    for (const [x, y] of [[sx - 16, top + 1], [sx + 16, top + 1], [sx - 16, shoulder], [sx + 16, shoulder], [sx, point - 3]]) f.set(x, y, S.g3);
    twinkle(f, sx - 5, crossY - 4, 2, S.st3);
    twinkle(f, ax + 1, ay + 1, 1, S.g3);
    twinkle(f, 58, 12, 2, S.g3);
    twinkle(f, 12, 80, 1, S.st2);
    f.over(g);
    return g;
  },
};

// ---------- Travellers flying over the clouds ----------

const flight: Art = {
  colors: [
    '#163a8c', '#1f52b0', '#2f6fd0', '#4b8fe4', '#79b4f2', '#b4dcff', '#e4f4ff',
    '#ffffff', '#d7e8f8', '#a7c4e6', '#7a9cd0',
    '#fff3c4', '#ffd36a',
    '#141a33', '#2a3358',
    '#c8323a', '#f05a4a', '#e88a1e', '#ffb43a', '#1f8a80', '#3cc0a8', '#f3d2bc',
  ],
  draw() {
    const S = { sky: [0, 1, 2, 3, 4, 5, 6], c0: 7, c1: 8, c2: 9, c3: 10, sun: 11, sunD: 12, ink: 13, body: 14, red: 15, redL: 16, amb: 17, ambL: 18, teal: 19, tealL: 20, skin: 21 };
    const g = new Grid();
    // The sky: deep at the top, a sun glowing in the top right.
    g.fill(() => true, (x, y) => {
      const d = Math.hypot(x + 0.5 - 60, y + 0.5 - 10);
      if (d < 5.5) return S.sun;
      if (d < 7) return S.sunD;
      return ramp(S.sky, (y / H) * 0.85 + Math.max(0, 0.5 - d / 60), x, y);
    });
    // Clouds: a bank across the bottom and a few smaller ones, lit from above.
    const puffs = [
      [6, 84, 11], [20, 80, 10], [34, 86, 12], [50, 81, 11], [66, 84, 10], [-2, 92, 10], [72, 92, 10], [40, 96, 10],
      [10, 34, 5], [17, 31, 6], [24, 35, 4.5], [52, 58, 4], [58, 55, 5.5], [64, 58, 4],
    ];
    const cloud = (x: number, y: number) => puffs.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15) < r && (r > 7 || y < cy + 2));
    g.fill(cloud, (x, y) => {
      let top = 99;
      for (const [cx, cy, r] of puffs) {
        const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15);
        if (d < r) top = Math.min(top, (y + 0.5 - (cy - r)) / r);
      }
      return ramp([S.c0, S.c1, S.c2, S.c3], top * 0.55 - 0.1, x, y);
    });

    // The travellers: little figures flying up and to the right, capes streaming behind.
    const f = new Grid();
    const th = -0.62;
    const hx = Math.cos(th);
    const hy = Math.sin(th);
    const crew: [number, number, number, number, number][] = [
      [50, 25, 1.25, S.red, S.redL],
      [25, 40, 1.0, S.amb, S.ambL],
      [57, 52, 0.95, S.teal, S.tealL],
      [15, 63, 0.82, S.teal, S.tealL],
      [38, 69, 0.78, S.red, S.redL],
    ];
    crew.forEach(([px, py, k, cape, capeL], n) => {
      /** A pixel in the traveller's own frame: u ahead, v towards its belly, in units of its size. */
      const local = (x: number, y: number) => {
        const dx = (x + 0.5 - px) / k;
        const dy = (y + 0.5 - py) / k;
        return [dx * hx + dy * hy, -dx * hy + dy * hx];
      };
      const base = n * 6;
      // The body, tapering to the feet, and an arm reaching ahead.
      f.fill((x, y) => {
        const [u, v] = local(x, y);
        const body = u > -4 && u < 4 && Math.abs(v) < 1.9;
        const legA = u > -13 && u <= -4 && Math.abs(v - 1.1) < 0.85;
        const legB = u > -11 && u <= -4 && Math.abs(v + 0.2 - (u + 4) * 0.12) < 0.85;
        const arm = u > 2 && u < 10 && Math.abs(v - 1.6) < 0.8;
        return body || legA || legB || arm;
      }, S.body, base + 1);
      // The cape, from the shoulders out over the back, billowing, its hem rippling.
      f.fill((x, y) => {
        const [u, v] = local(x, y);
        const hem = Math.sin(u * 0.9 + n) * 0.8;
        return poly([[3.6, -1.6], [-5, -6.5], [-14, -5.2], [-12.5, -1.2], [-6, 0.8], [3.6, 0.6]])(u - 0.5, v - 0.5 + hem * ((3.6 - u) / 17));
      }, (x, y) => {
        const [u, v] = local(x, y);
        return Math.sin(u * 0.75 - v * 0.6 + n) > 0.35 ? capeL : v > -2 ? cape : capeL;
      }, base + 2);
      // The head: hair at the back, a face looking ahead.
      f.fill((x, y) => {
        const [u, v] = local(x, y);
        return Math.hypot(u - 6.4, v) < 2.5;
      }, (x, y) => {
        const [u, v] = local(x, y);
        return u > 6.3 && v > -1 ? S.skin : S.body;
      }, base + 3);
    });
    f.outline(S.ink);
    // Trails of light behind each of them.
    crew.forEach(([px, py, k]) => {
      for (let s = 15; s < 26; s++) {
        const x = px - hx * s * k;
        const y = py - hy * s * k;
        if (f.get(Math.round(x), Math.round(y)) < 0 && dith(Math.round(x), Math.round(y), 1 - (s - 15) / 12)) f.set(x, y, S.c0);
      }
    });
    f.over(g);
    twinkle(g, 60, 10, 9, S.sun, S.c0);
    for (const [x, y] of [[8, 12], [28, 18], [66, 40]]) twinkle(g, x, y, 1, S.c0);
    return g;
  },
};

// ---------- A jester ----------

const jester: Art = {
  colors: [
    '#1e1626', '#f8e8bd', '#f0d185', '#d8413f', '#8f2433', '#7048b0', '#48307a', '#2fa59a',
    '#1c6d68', '#f4bb3a', '#b9761d', '#fffaf0', '#e7dccb', '#f08a92', '#1b1834', '#2a2448',
  ],
  draw() {
    const J = { ink: 0, sun: 1, sunD: 2, red: 3, redD: 4, pur: 5, purD: 6, teal: 7, tealD: 8, gold: 9, goldD: 10, face: 11, faceD: 12, pink: 13, dark: 14, darkL: 15 };
    const g = new Grid();
    // A dark backdrop with confetti, and a sunburst behind the figure.
    g.fill(() => true, (x, y) => (dith(x, y, 0.2 + Math.hypot(x - 36, y - 50) / 160) ? J.dark : J.darkL));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) if (rand(x, y) > 0.975 && Math.hypot(x - 36, y - 50) > 31) g.set(x, y, [J.gold, J.red, J.teal, J.pink][Math.floor(rand(y, x) * 4)]);
    const sx = 36;
    const sy = 50;
    g.fill(ell(sx, sy, 30), (x, y) => {
      const a = Math.atan2(y + 0.5 - sy, x + 0.5 - sx);
      return Math.floor(((a + Math.PI) / (2 * Math.PI)) * 24) % 2 ? J.sun : J.sunD;
    });
    g.fill(and(ell(sx, sy, 30), not(ell(sx, sy, 28.6))), J.gold);

    // The jester, on its own layer so it can be outlined.
    const f = new Grid();
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
    f.set(13, 60, J.ink);
    f.set(16, 60, J.ink);
    f.set(14, 62, J.redD);
    f.set(15, 62, J.redD);
    for (const y of [72, 80, 88]) f.fill(ell(36, y, 1.6), (x, yy) => (x + yy > 36 + y ? J.goldD : J.face), P.body);
    f.over(g);
    return g;
  },
};

const ARTS = [planet, wind, oath, flight, jester];

const cache: { w: number; h: number; rgba: Uint8ClampedArray }[] = [];

/** Picture `i`'s pixels, one per art pixel, 72 × 96 like the scenes. */
export function artPixels(i: number) {
  if (cache[i]) return cache[i];
  const art = ARTS[i];
  const g = art.draw();
  const colors = art.colors.map((h) => parseInt(h.slice(1), 16));
  const rgba = new Uint8ClampedArray(W * H * 4);
  g.c.forEach((c, p) => {
    const n = colors[c];
    rgba.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], p * 4);
  });
  return (cache[i] = { w: W, h: H, rgba });
}

/** The illustrated samples, at the scenes' scale. */
export function paintArt(): HTMLCanvasElement[] {
  return ARTS.map((_, i) => {
    const small = document.createElement('canvas');
    small.width = W;
    small.height = H;
    small.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(artPixels(i).rgba), W, H), 0, 0);
    const big = document.createElement('canvas');
    big.width = W * SCALE;
    big.height = H * SCALE;
    const ctx = big.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, big.width, big.height);
    return big;
  });
}
