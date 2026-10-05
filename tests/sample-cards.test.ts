// Run with `npm test` (Node's own test runner, which strips the types itself).
// The card samples (src/sampleCards.ts): pixel art the art window takes whole, in few flat colors, with
// the texts of both languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_SAMPLES, cardPixels, cardText } from '../src/sampleCards.ts';

test('there are four card samples: the Joker and three game cards', () => {
  assert.equal(CARD_SAMPLES, 4);
  assert.equal(cardText(0, 'en'), null);
  for (const i of [1, 2, 3]) for (const lang of ['ja', 'en'] as const) {
    const t = cardText(i, lang)!;
    assert.ok(t.text.length > 10 && t.kind.length > 0, `card ${i} (${lang}) has no text`);
  }
});

test('each card is 3 : 4 like the art window, opaque, and painted in a small palette', () => {
  for (let i = 0; i < CARD_SAMPLES; i++) {
    const { w, h, rgba } = cardPixels(i);
    assert.equal(w * 4, h * 3, `card ${i} is ${w}×${h}`);
    assert.equal(rgba.length, w * h * 4);
    const colors = new Set<number>();
    for (let p = 0; p < w * h; p++) {
      assert.equal(rgba[p * 4 + 3], 255, `card ${i} has a clear pixel`);
      colors.add((rgba[p * 4] << 16) | (rgba[p * 4 + 1] << 8) | rgba[p * 4 + 2]);
    }
    assert.ok(colors.size >= 8 && colors.size <= 32, `card ${i} uses ${colors.size} colors`);
  }
});

test('the Joker reads JOKER in its top-left corner and again upside down in the bottom-right', () => {
  const { w, h, rgba } = cardPixels(0);
  const at = (x: number, y: number) => (rgba[(y * w + x) * 4] << 16) | (rgba[(y * w + x) * 4 + 1] << 8) | rgba[(y * w + x) * 4 + 2];
  const letter = at(4, 5);
  let inked = 0;
  for (let y = 0; y < 44; y++)
    for (let x = 0; x < 10; x++) {
      if (at(x, y) !== letter) continue;
      inked++;
      assert.equal(at(w - 1 - x, h - 1 - y), letter, `the bottom-right corner misses (${x}, ${y}) turned round`);
    }
  assert.ok(inked > 60, 'no letters in the corner');
});
