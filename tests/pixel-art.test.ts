// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPixelArt } from '../src/card/pixelArt.ts';

/** A w × h picture whose pixel (x, y) is `at(x, y)` ([r, g, b, a]). */
function pic(w: number, h: number, at: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(at(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
}

/** A tiny sprite of a few colours. */
const sprite = (x: number, y: number) => [[20, 20, 30, 255], [240, 200, 60, 255], [200, 40, 40, 255], [0, 0, 0, 0]][(x * 7 + y * 3 + ((x * y) >> 2)) % 4];
/** A photo-like gradient with noise: thousands of colours, no blocks. */
const photo = (x: number, y: number) => [(x * 3 + y) % 256, (y * 5 + ((x * 13) % 7)) % 256, (x * y) % 256, 255];

test('a small picture of few colours is pixel art', () => {
  assert.equal(isPixelArt(pic(71, 95, sprite)), true);
});

test('pixel art already blown up in square blocks is still pixel art', () => {
  assert.equal(isPixelArt(pic(71 * 6, 95 * 6, (x, y) => sprite(Math.floor(x / 6), Math.floor(y / 6)))), true);
  // Blocks cut at the picture's edge (an offset grid) count too.
  assert.equal(isPixelArt(pic(400, 300, (x, y) => sprite(Math.floor((x + 3) / 4), Math.floor((y + 1) / 4)))), true);
});

test('a photo, small or large, is not pixel art', () => {
  assert.equal(isPixelArt(pic(120, 160, photo)), false);
  assert.equal(isPixelArt(pic(600, 800, photo)), false);
});

test('a flat picture with no detail is not pixel art', () => {
  assert.equal(isPixelArt(pic(400, 400, () => [10, 10, 10, 255])), false);
});
