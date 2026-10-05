// Run with `npm test` (Node's own test runner, which strips the types itself).
// The illustrated samples (src/sampleArt.ts): plain pixel-art pictures like the scenes, in few colors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ART_SAMPLES, artPixels } from '../src/sampleArt.ts';
import { ARTS } from '../src/samples.ts';

test('the first load counts as many illustrations as their chunk paints', () => {
  assert.equal(ART_SAMPLES, 5);
  assert.equal(ARTS, ART_SAMPLES);
});

test('each illustration is 72 × 96 like the scenes, opaque, and painted in a small palette', () => {
  for (let i = 0; i < ART_SAMPLES; i++) {
    const { w, h, rgba } = artPixels(i);
    assert.equal(w, 72);
    assert.equal(h, 96);
    assert.equal(rgba.length, w * h * 4);
    const colors = new Set<number>();
    for (let p = 0; p < w * h; p++) {
      assert.equal(rgba[p * 4 + 3], 255, `picture ${i} has a clear pixel`);
      colors.add((rgba[p * 4] << 16) | (rgba[p * 4 + 1] << 8) | rgba[p * 4 + 2]);
    }
    assert.ok(colors.size >= 8 && colors.size <= 32, `picture ${i} uses ${colors.size} colors`);
  }
});

test('each illustration has deep darks and bright lights for a finish to work on', () => {
  for (let i = 0; i < ART_SAMPLES; i++) {
    const { rgba } = artPixels(i);
    let lo = 255;
    let hi = 0;
    for (let p = 0; p < rgba.length; p += 4) {
      const l = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2];
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    assert.ok(lo < 40 && hi > 220, `picture ${i} runs only from ${lo} to ${hi}`);
  }
});
