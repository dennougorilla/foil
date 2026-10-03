import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ditherToPalette } from './gifDither.ts';

const W = 256;
const H = 16;
const grays = (n) => Array.from({ length: n }, (_, i) => Array(3).fill(Math.round((i / (n - 1)) * 255)));

function ramp() {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set([x, x, x, 255], (y * W + x) * 4);
  return d;
}

/** Mean error of 8×8 block averages: how far the picture drifts once the eye blends the pixels. */
function blockError(src, index, palette) {
  let err = 0;
  let n = 0;
  for (let by = 0; by < H; by += 8)
    for (let bx = 0; bx < W; bx += 8) {
      let a = 0;
      let b = 0;
      for (let y = by; y < by + 8; y++)
        for (let x = bx; x < bx + 8; x++) {
          const p = y * W + x;
          a += src[p * 4];
          b += palette[index[p]][0];
        }
      err += Math.abs(a - b) / 64;
      n++;
    }
  return err / n;
}

test('a smooth ramp keeps its average shade instead of breaking into bands', () => {
  const palette = grays(9);
  const src = ramp();
  const plain = new Uint8Array(W * H).map((_, p) => Math.round((src[p * 4] / 255) * 8));
  const dithered = ditherToPalette(src, W, palette, 32);
  assert.ok(blockError(src, dithered, palette) < blockError(src, plain, palette) * 0.5);
});

test('a colour well clear of its neighbours stays one flat colour', () => {
  const palette = [
    [20, 30, 40],
    [200, 160, 60],
    [240, 240, 240],
  ];
  const src = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) src.set([202, 158, 63, 255], p * 4);
  const index = ditherToPalette(src, W, palette, 32);
  assert.ok(index.every((i) => i === 1));
});
