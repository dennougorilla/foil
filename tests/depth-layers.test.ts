// Run with `npm test` (Node's built-in runner; Node strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildLayers,
  cleanMask,
  colorDepth,
  edgeCuts,
  inpaint,
  guidedFilter,
  multiOtsu,
  normalizeDepth,
  type Gray,
} from '../src/depth/layers.ts';

const gray = (w: number, h: number, f: (x: number, y: number) => number): Gray => {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y);
  return { w, h, data };
};

test('normalizeDepth stretches the middle of the range to 0..1 and clips outliers', () => {
  const d = new Float32Array(1000).map((_, i) => i);
  d[0] = -5000;
  d[999] = 99999;
  normalizeDepth(d);
  assert.equal(Math.min(...d), 0);
  assert.equal(Math.max(...d), 1);
  assert.ok(Math.abs(d[500] - 0.5) < 0.02);
});

test('multiOtsu puts its cuts between the clusters', () => {
  const v = new Float32Array(900);
  for (let i = 0; i < 900; i++) v[i] = i < 300 ? 0.1 + (i % 7) * 0.005 : i < 600 ? 0.5 + (i % 5) * 0.005 : 0.9 - (i % 6) * 0.005;
  const [a, b] = multiOtsu(v, 3);
  assert.ok(a > 0.14 && a < 0.5, `first cut ${a}`);
  assert.ok(b > 0.52 && b < 0.87, `second cut ${b}`);
});

test('cleanMask drops small islands and fills small holes, keeps big shapes', () => {
  const w = 40;
  const h = 40;
  const m = new Uint8Array(w * h);
  // A big square with a one-pixel hole, plus a stray two-pixel speck.
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) m[y * w + x] = 1;
  m[20 * w + 20] = 0;
  m[2 * w + 2] = 1;
  m[2 * w + 3] = 1;
  cleanMask(m, w, h, 10);
  assert.equal(m[20 * w + 20], 1, 'hole filled');
  assert.equal(m[2 * w + 2], 0, 'speck removed');
  assert.equal(m[15 * w + 15], 1, 'square kept');
  assert.equal(m[35 * w + 35], 0, 'background kept');
});

test('guidedFilter keeps a flat field flat and snaps a soft step to the guide edge', () => {
  const w = 32;
  const h = 8;
  const guide = gray(w, h, (x) => (x < 16 ? 0 : 1));
  const flat = guidedFilter(guide, gray(w, h, () => 0.4), 3, 1e-3);
  assert.ok(flat.data.every((v) => Math.abs(v - 0.4) < 1e-4));
  // A depth step that is blurred and off by a few pixels lines up with the sharp edge in the guide.
  const soft = gray(w, h, (x) => Math.min(1, Math.max(0, (x - 12) / 8)));
  const out = guidedFilter(guide, soft, 4, 1e-4);
  assert.ok(out.data[4 * w + 14] < 0.35, `left of the edge ${out.data[4 * w + 14]}`);
  assert.ok(out.data[4 * w + 17] > 0.65, `right of the edge ${out.data[4 * w + 17]}`);
});

test('buildLayers stacks nested sheets front first and keeps the depth in alpha', () => {
  const w = 60;
  const h = 80;
  // Far wall, a mid block and a near disc inside it.
  const depth = gray(w, h, (x, y) => {
    const near = (x - 30) ** 2 + (y - 40) ** 2 < 8 ** 2;
    const mid = x > 15 && x < 45 && y > 20 && y < 70;
    return near ? 0.95 : mid ? 0.55 : 0.1;
  });
  const map = buildLayers(depth, { cuts: 2 }, new Uint8ClampedArray(w * h * 4).fill(128));
  assert.equal(map.cuts, 2);
  assert.equal(map.w, w);
  assert.equal(map.data.length, w * h * 4);
  assert.equal(map.plate.length, w * h * 4);
  const at = (x: number, y: number) => Array.from(map.data.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  const centre = at(30, 40);
  const block = at(20, 60);
  const wall = at(5, 5);
  assert.ok(centre[0] > 200 && centre[1] > 200, 'near disc stands on both cut sheets');
  assert.ok(block[0] < 50 && block[1] > 200, 'block stands on the second sheet only');
  assert.ok(wall[0] < 50 && wall[1] < 50, 'the far wall is left to the back sheet');
  assert.ok(centre[3] > block[3] && block[3] > wall[3], 'alpha carries the depth');
  // The plate keeps the depth for the back sheet's relief, painted out behind the cut sheets.
  assert.ok(Math.abs(map.plate[(5 * w + 5) * 4 + 3] - Math.round(0.1 * 255)) <= 1, 'depth kept outside the cut');
  assert.ok(map.plate[(40 * w + 30) * 4 + 3] < 0.3 * 255, 'behind the cut, the depth of what surrounds it');
  // Every pixel of the front sheet is also on the one behind it.
  for (let i = 0; i < w * h; i++) assert.ok(map.data[i * 4] <= map.data[i * 4 + 1] + 8);
});

test('colorDepth brings a subject forward from a plain background', () => {
  const w = 60;
  const h = 80;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const subject = (x - 30) ** 2 + (y - 45) ** 2 < 14 ** 2;
      rgba.set(subject ? [220, 60, 50, 255] : [30, 40, 70, 255], o);
    }
  const d = colorDepth(rgba, w, h);
  assert.ok(d.data[45 * w + 30] > d.data[8 * w + 8] + 0.4, 'subject nearer than the corner');
});

test('edgeCuts cuts along depth edges, never across a smooth slope', () => {
  const w = 120;
  const h = 160;
  // A far wall at 0.1 and a figure whose own depth runs smoothly from 0.5 to 0.9 (a face turning
  // away): one cut belongs on the figure's outline, none across it.
  const depth = gray(w, h, (x, y) => {
    const inside = (x - 60) ** 2 / 40 ** 2 + (y - 90) ** 2 / 55 ** 2 < 1;
    return inside ? 0.5 + 0.4 * (x - 20) / 80 : 0.1;
  });
  const cuts = edgeCuts(depth);
  assert.equal(cuts.length, 1, `cuts ${cuts}`);
  assert.ok(cuts[0] > 0.1 && cuts[0] < 0.5, `cut ${cuts[0]}`);
});

test('edgeCuts leaves a smooth slope uncut (it becomes relief instead)', () => {
  const ramp = gray(80, 100, (_x, y) => y / 99);
  assert.deepEqual(edgeCuts(ramp), []);
});

test('inpaint fills a hole from what surrounds it', () => {
  const w = 50;
  const h = 40;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Left half red, right half blue; a bright subject sits over the middle and gets removed.
      const inside = Math.abs(x - 25) < 8 && Math.abs(y - 20) < 8;
      rgba.set(inside ? [255, 255, 255, 255] : x < 25 ? [200, 0, 0, 255] : [0, 0, 200, 255], i * 4);
      hole[i] = inside ? 1 : 0;
    }
  const plate = inpaint(rgba, w, h, hole);
  const px = (x: number, y: number) => Array.from(plate.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
  assert.ok(px(19, 20)[0] > 150 && px(19, 20)[1] < 40, `left side of the hole leans red ${px(19, 20)}`);
  assert.ok(px(31, 20)[2] > 150 && px(31, 20)[1] < 40, `right side of the hole leans blue ${px(31, 20)}`);
  assert.deepEqual(px(5, 5), [200, 0, 0], 'outside the hole is untouched');
});

test('edgeCuts skips a faint step in the background next to a strong subject', () => {
  const w = 120;
  const h = 160;
  // A far wall at 0.1 with a slightly nearer patch in its corner (0.25), and a figure at 0.9.
  const depth = gray(w, h, (x, y) => {
    if ((x - 60) ** 2 / 30 ** 2 + (y - 100) ** 2 / 45 ** 2 < 1) return 0.9;
    if (x > 90 && y < 40) return 0.25;
    return 0.1;
  });
  const cuts = edgeCuts(depth);
  assert.equal(cuts.length, 1, `cuts ${cuts}`);
  assert.ok(cuts[0] > 0.25, `the cut is the figure's, ${cuts[0]}`);
});

test('edgeCuts keeps every strong step of a layered scene', () => {
  const w = 120;
  const h = 160;
  // Far wall 0.1, a hill at 0.5 across the lower half, a figure at 0.9 standing on it.
  const depth = gray(w, h, (x, y) => {
    if ((x - 60) ** 2 / 20 ** 2 + (y - 70) ** 2 / 30 ** 2 < 1) return 0.9;
    if (y > 90) return 0.5;
    return 0.1;
  });
  assert.equal(edgeCuts(depth).length, 2);
});
