// Run with `npm test`. Neon's sign layout (src/gl/neonMap.ts) on synthetic faces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEON_MAX_TUBES, NEON_NO_POST, NEON_REACH, neonDesign, neonPosts, neonTubeMap, neonWallMap } from '../src/gl/neonMap.ts';

// A 900 × 1260 card face read at 4 face px per cell, with the classic art window.
const FW = 900;
const FH = 1260;
const CELL = 4;
const w = FW / CELL;
const h = Math.round(FH / CELL);
const art = { x: 56, y: 56, w: 788, h: 1051 };

function face(paint: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const [r, g, b] = paint((i + 0.5) * CELL, (j + 0.5) * CELL);
      px.set([r, g, b, 255], (j * w + i) * 4);
    }
  return px;
}

const len = (p: Float32Array) => {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
};

test('a red disc becomes one red tube round it, opened at the bottom, plus the border tube', () => {
  const d = neonDesign(face((x, y) => (Math.hypot(x - 450, y - 560) < 250 ? [230, 30, 30] : [10, 10, 20])), w, h, FW, FH, art);
  const inner = d.tubes.filter((t) => !t.border);
  assert.equal(inner.length, 1);
  assert.equal(d.tubes.filter((t) => t.border).length, 1);
  const t = inner[0];
  assert.deepEqual(t.gas, [1.0, 0.16, 0.12]);
  for (let i = 0; i < t.pts.length; i += 2) assert.ok(Math.abs(Math.hypot(t.pts[i] - 450, t.pts[i + 1] - 560) - 250) < 25);
  // Its two ends sit side by side below the centre, a short gap apart.
  const n = t.pts.length;
  const gap = Math.hypot(t.pts[0] - t.pts[n - 2], t.pts[1] - t.pts[n - 1]);
  assert.ok(gap > d.width * 2 && gap < d.width * 6, `gap ${gap}`);
  assert.ok(t.pts[1] > 700 && t.pts[n - 1] > 700);
});

test('pixel-art steps bend into smooth arcs', () => {
  // A disc drawn in 12 px blocks.
  const d = neonDesign(face((x, y) => (Math.hypot(Math.floor(x / 12) * 12 + 6 - 450, Math.floor(y / 12) * 12 + 6 - 560) < 240 ? [250, 250, 250] : [0, 0, 0])), w, h, FW, FH, art);
  const t = d.tubes.find((u) => !u.border)!;
  const p = t.pts;
  for (let i = 4; i < p.length; i += 2) {
    const a = Math.atan2(p[i - 1] - p[i - 3], p[i - 2] - p[i - 4]);
    const b = Math.atan2(p[i + 1] - p[i - 1], p[i] - p[i - 2]);
    const turn = Math.abs(((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    assert.ok(turn < 0.12, `turns ${turn.toFixed(2)} rad in 3 px`);
  }
});

test('a busy picture gives a few long tubes, never a tangle of short ones', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blobs = Array.from({ length: 60 }, () => [rnd() * 900, rnd() * 1260, 10 + rnd() * 60, rnd() * 255]);
  const d = neonDesign(face((x, y) => {
    let v = 40 + rnd() * 60;
    for (const [bx, by, r, c] of blobs) if (Math.hypot(x - bx, y - by) < r) v = c;
    return [v, v * 0.6, 255 - v];
  }), w, h, FW, FH, art);
  const inner = d.tubes.filter((t) => !t.border);
  assert.ok(inner.length <= NEON_MAX_TUBES);
  for (const t of inner) assert.ok(len(t.pts) >= 0.15 * 1260 - 1, `a tube only ${len(t.pts)} long`);
});

test('a flat picture has only the border tube', () => {
  const d = neonDesign(face(() => [90, 90, 90]), w, h, FW, FH, art);
  assert.deepEqual(d.tubes.map((t) => t.border), [true]);
});

test('the border tube runs round the art window with one break, outside the window', () => {
  const d = neonDesign(face(() => [20, 40, 200]), w, h, FW, FH, art);
  const b = d.tubes[0];
  const p = b.pts;
  for (let i = 0; i < p.length; i += 2) {
    const inside = p[i] > art.x && p[i] < art.x + art.w && p[i + 1] > art.y && p[i + 1] < art.y + art.h;
    assert.ok(!inside);
  }
  let breaks = 0;
  for (let i = 2; i < p.length; i += 2) if (Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) > 10) breaks++;
  assert.equal(breaks, 0, 'one continuous tube');
  assert.ok(Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) > d.width * 2, 'its ends leave a break');
});

test('the tube map measures distance and length along each tube; the wall map is lit behind them', () => {
  const d = neonDesign(face((x, y) => (Math.hypot(x - 450, y - 560) < 250 ? [30, 220, 240] : [5, 5, 10])), w, h, FW, FH, art);
  const tw = 300;
  const th = 420;
  const m = neonTubeMap(d, tw, th, FW, FH);
  const t = d.tubes.findIndex((u) => !u.border);
  const p = d.tubes[t].pts;
  const at = (x: number, y: number) => (Math.floor(y / 3) * tw + Math.floor(x / 3)) * 4;
  const i = at(p[40], p[41]);
  assert.ok(m[i] < 2.2);
  assert.equal(m[i + 2], t);
  assert.ok(Math.abs(m[i + 1] - len(p.slice(0, 42))) < 4);
  assert.equal(m[at(450, 560)], NEON_REACH);
  const wall = neonWallMap(d, 90, 126, FW, FH);
  const wi = (Math.floor(p[41] / 10) * 90 + Math.floor(p[40] / 10)) * 4;
  assert.ok(wall[wi + 2] > 0.6 && wall[wi + 2] < 1.6, `pool ${wall[wi + 2]}`);
  assert.ok(wall[(Math.floor(560 / 10) * 90 + 45) * 4 + 2] < 0.2, 'dark far from the tubes');
});

test('posts hold the long tubes sparingly and leave short ones alone', () => {
  const d = neonDesign(face((x, y) => (Math.hypot(x - 450, y - 560) < 250 ? [230, 30, 30] : [10, 10, 20])), w, h, FW, FH, art);
  const posts = neonPosts(d);
  const total = d.tubes.reduce((s, t) => s + t.len, 0);
  // Never closer than about every 400 face px of tube, and never more than the shader holds.
  assert.ok(posts.length / 2 >= 3 && posts.length / 2 <= total / 380, `${posts.length / 2} posts on ${total.toFixed(0)} px`);
  assert.ok(posts.length / 2 <= 40);
  const short = { tubes: [{ pts: Float32Array.from([100, 100, 100 + NEON_NO_POST - 20, 100]), len: NEON_NO_POST - 20, gas: [1, 0, 0] as [number, number, number], border: false }], width: 20 };
  assert.equal(neonPosts(short).length, 0);
});

test('a curl tighter than glass bends is cut out of a tube, and a horizon broken by it is joined again', () => {
  // A wavy horizon: a bright band below a dark sky, whose edge makes one tight hook in the middle.
  const d = neonDesign(face((x, y) => {
    const edge = 700 + 40 * Math.sin(x / 120) + (Math.hypot(x - 450, y - 690) < 26 ? 60 : 0);
    return y > edge ? [240, 120, 20] : [8, 6, 20];
  }), w, h, FW, FH, art);
  const inner = d.tubes.filter((t) => !t.border);
  assert.equal(inner.length, 1, `${inner.length} tubes`);
  assert.ok(inner[0].len > 0.6 * art.w, `one long horizon (${inner[0].len.toFixed(0)} px)`);
});

test('a stray short mark in a corner of the window is left out', () => {
  const d = neonDesign(face((x, y) => {
    if (Math.hypot(x - 450, y - 600) < 260) return [230, 30, 30];
    if (x > 90 && x < 220 && y > 90 && y < 130) return [20, 200, 230];
    return [8, 8, 16];
  }), w, h, FW, FH, art);
  for (const t of d.tubes.filter((u) => !u.border)) {
    const cx = t.pts.reduce((s, v, i) => (i % 2 ? s : s + v), 0) / (t.pts.length / 2);
    assert.ok(cx > 250, 'no tube in the top-left corner');
  }
});

test('a small strong spot inside a shape (an eye) gets a ring of its own', () => {
  const d = neonDesign(face((x, y) => {
    if (Math.hypot(x - 430, y - 520) < 24) return [10, 10, 10];
    return Math.hypot(x - 450, y - 600) < 300 ? [235, 225, 200] : [20, 60, 30];
  }), w, h, FW, FH, art);
  const ring = d.tubes.find((t) => {
    if (t.border) return false;
    for (let i = 0; i < t.pts.length; i += 2) if (Math.hypot(t.pts[i] - 430, t.pts[i + 1] - 520) > 90) return false;
    return true;
  });
  assert.ok(ring, 'a ring round the spot');
  assert.ok(ring.len > 150, `ring ${ring.len.toFixed(0)} px`);
});
