// Run with `npm test` (Node's own test runner, which strips the types itself).
// Pixel art (docs/features.md, Picture): the choices, and the conversion on raw RGBA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOT_PRESETS, gridOf, presetOf, sanitizeDot, type Dot } from '../src/dot/model.ts';
import { dotFrames, FOIL_PALETTE } from '../src/dot/convert.ts';

const W = 32;
const H = 24;

/** A picture painted pixel by pixel. */
function paint(f: (x: number, y: number) => [number, number, number, number?]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b, a = 255] = f(x, y);
      d.set([r, g, b, a], (y * W + x) * 4);
    }
  return d;
}

/** A busy photo-like picture: smooth hues and shading. */
const photo = () =>
  paint((x, y) => [
    128 + 120 * Math.sin(x / 5),
    128 + 120 * Math.sin(y / 4 + 1),
    128 + 120 * Math.sin((x + y) / 7 + 2),
  ]);

const colors = (d: Uint8ClampedArray) => {
  const set = new Set<number>();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return set;
};

const plain: Dot = { size: 72, colors: 8, outline: false, dither: false };

test('the presets are what they say, a mix of my own is no preset, and off is null', () => {
  assert.equal(presetOf(null), 'off');
  for (const p of ['chunky', 'retro', 'fine'] as const) assert.equal(presetOf(DOT_PRESETS[p]), p);
  assert.equal(presetOf({ ...DOT_PRESETS.chunky, size: 128 }), null);
  // Chunky is the bold one: big pixels and a dark outline.
  assert.ok(DOT_PRESETS.chunky.outline && DOT_PRESETS.chunky.size <= 72);
});

test('a saved setting that does not fit turns pixel art off', () => {
  assert.equal(sanitizeDot(undefined), null);
  assert.equal(sanitizeDot({ size: 50, colors: 8 }), null);
  assert.equal(sanitizeDot({ size: 64, colors: 12 }), null);
  assert.deepEqual(sanitizeDot({ size: 96, colors: 'foil', outline: true }), { size: 96, colors: 'foil', outline: true, dither: false });
  assert.equal(sanitizeDot({ size: 64, colors: 8 }), null);
});

test('the grid counts its size across the short side, with square cells on any shape', () => {
  assert.deepEqual(gridOf(900, 1260, 72), { w: 72, h: 101 });
  assert.deepEqual(gridOf(1260, 900, 72), { w: 101, h: 72 });
  assert.deepEqual(gridOf(900, 900, 56), { w: 56, h: 56 });
});

test('the colours are cut down to the palette size picked from the picture', () => {
  for (const k of [8, 16, 32] as const) {
    const d = photo();
    dotFrames([d], W, H, { ...plain, colors: k });
    const n = colors(d).size;
    assert.ok(n <= k && n >= Math.min(k, 6), `${n} colours for ${k}`);
  }
});

test("FOIL's palette uses only its own colours", () => {
  const d = photo();
  dotFrames([d], W, H, { ...plain, colors: 'foil' });
  const own = new Set(FOIL_PALETTE.map(([r, g, b]) => (r << 16) | (g << 8) | b));
  for (const c of colors(d)) assert.ok(own.has(c), c.toString(16));
});

test('alpha is hard: a pixel is either there or not', () => {
  const d = paint((x) => [200, 100, 50, x * 8]);
  dotFrames([d], W, H, plain);
  for (let i = 3; i < d.length; i += 4) assert.ok(d[i] === 0 || d[i] === 255);
});

test('a palette can be kept, so a moving picture does not flicker between frames', () => {
  const a = photo();
  const b = photo();
  const pal = dotFrames([a], W, H, { ...plain, colors: 16 });
  // The next frame, a little brighter, is matched to the same colours.
  for (let i = 0; i < b.length; i += 4) b[i] = Math.min(255, b[i] + 6);
  assert.equal(dotFrames([b], W, H, { ...plain, colors: 16 }, pal), pal);
  const own = new Set(pal.map(([r, g, bb]) => (r << 16) | (g << 8) | bb));
  for (const c of colors(b)) assert.ok(own.has(c));
});

test('the outline darkens the darker side of a strong edge and the rim of a cut-out', () => {
  // Left: light paper; right: red. A transparent hole in the paper.
  const src = () => paint((x, y) => (x >= 4 && x < 8 && y >= 4 && y < 8 ? [0, 0, 0, 0] : x < 16 ? [240, 236, 220] : [200, 40, 40]));
  const off = src();
  const on = src();
  dotFrames([off], W, H, plain);
  dotFrames([on], W, H, { ...plain, outline: true });
  const lum = (d: Uint8ClampedArray, x: number, y: number) => {
    const i = (y * W + x) * 4;
    return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  };
  // The red column on the edge is darker with the outline; the red inside is not.
  assert.ok(lum(on, 16, 12) < lum(off, 16, 12) * 0.6);
  assert.equal(lum(on, 24, 12), lum(off, 24, 12));
  // The paper does not get a line on the edge (it is the lighter side) …
  assert.equal(lum(on, 15, 12), lum(off, 15, 12));
  // … but it does around the hole.
  assert.ok(lum(on, 3, 5) < lum(off, 3, 5) * 0.6);
  assert.equal(lum(on, 1, 1), lum(off, 1, 1));
});

test('the dither breaks a smooth ramp into more steps than flat bands', () => {
  const ramp = () => paint((x) => [x * 8, x * 8, x * 8]);
  const changes = (d: Uint8ClampedArray) => {
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) if (d[(y * W + x) * 4] !== d[(y * W + x - 1) * 4]) n++;
    return n;
  };
  const flat = ramp();
  const dith = ramp();
  dotFrames([flat], W, H, { ...plain, colors: 8 });
  dotFrames([dith], W, H, { ...plain, colors: 8, dither: true });
  assert.ok(changes(dith) > changes(flat) * 1.5, `${changes(dith)} vs ${changes(flat)}`);
});
