// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrange, firstFree, layout, MAX_BYTES, MAX_CARDS, PAGES, PER_PAGE, pocketsOn, refusal, swap } from '../src/binder/limits.ts';

const MB = 1_000_000;

test('the binder holds 54 cards (six pages of nine) and 60 MB', () => {
  assert.equal(MAX_CARDS, 54);
  assert.equal(PER_PAGE, 9);
  assert.equal(MAX_BYTES, 60 * MB);
});

test('a card goes in while both the count and the bytes have room, and the refusal says which ran out', () => {
  assert.equal(refusal({ count: 0, bytes: 0 }, 300_000), null);
  assert.equal(refusal({ count: 53, bytes: 59 * MB }, 900_000), null);
  assert.equal(refusal({ count: 54, bytes: 0 }, 1), 'count');
  assert.equal(refusal({ count: 10, bytes: 59.9 * MB }, 200_000), 'bytes');
  // When both ran out, the count is the one to name: discarding a card fixes both.
  assert.equal(refusal({ count: 54, bytes: 60 * MB }, 1), 'count');
});

test('the binder has six pages of nine pockets, like a real one, whatever is in it', () => {
  assert.equal(PAGES, 6);
  assert.equal(layout([]).length, 54);
});

test('every card keeps its own pocket; a card with no pocket (or one already taken) goes into the first free one, newest first', () => {
  const cards = [
    { id: 'a', at: 1, slot: 4 },
    { id: 'b', at: 2, slot: 4 }, // taken by an older card
    { id: 'c', at: 3 }, // none yet
    { id: 'd', at: 4, slot: 99 }, // past the last pocket
    { id: 'e', at: 5, slot: 20 },
  ];
  const placed = arrange(cards);
  const at = Object.fromEntries(placed.map((c) => [c.id, c.slot]));
  assert.deepEqual(at, { a: 4, e: 20, d: 0, c: 1, b: 2 });
  // The cards are copies; the ones given were not changed.
  assert.equal(cards[2].slot, undefined);
});

test('pockets stay where they are: empty ones in between are kept, each page shows its own nine', () => {
  const lay = layout([{ id: 'x', slot: 2 }, { id: 'y', slot: 10 }]);
  assert.deepEqual(pocketsOn(lay, 0), [null, null, 'x', null, null, null, null, null, null]);
  assert.deepEqual(pocketsOn(lay, 1), [null, 'y', null, null, null, null, null, null, null]);
  assert.deepEqual(pocketsOn(lay, 5), Array(9).fill(null));
});

test('a card moved onto another swaps with it; onto an empty pocket it just moves', () => {
  const lay = layout([{ id: 'x', slot: 0 }, { id: 'y', slot: 1 }]);
  assert.deepEqual(swap(lay, 0, 1).slice(0, 3), ['y', 'x', null]);
  assert.deepEqual(swap(lay, 0, 30)[30], 'x');
  assert.equal(swap(lay, 0, 30)[0], null);
  // The layout given is left as it was.
  assert.deepEqual(lay.slice(0, 2), ['x', 'y']);
});

test('the first free pocket, in the whole binder or from a page on', () => {
  const lay = layout([{ id: 'x', slot: 0 }, { id: 'y', slot: 2 }, { id: 'z', slot: 9 }]);
  assert.equal(firstFree(lay), 1);
  assert.equal(firstFree(lay, 9), 10);
  const full = layout(Array.from({ length: 54 }, (_, i) => ({ id: `c${i}`, slot: i })));
  assert.equal(firstFree(full), -1);
});

test('a thumbnail is cut to the card itself, whatever its shape, and fits the pocket without stretching', async () => {
  const { fitIn, opaqueBounds } = await import('../src/binder/fit.ts');
  // A 10×8 picture with a 6×3 card (landscape) in it, clear all round.
  const w = 10;
  const h = 8;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 2; y < 5; y++) for (let x = 3; x < 9; x++) data[(y * w + x) * 4 + 3] = 255;
  data[(0 * w + 0) * 4 + 3] = 10; // faint dust is not the card
  assert.deepEqual(opaqueBounds(data, w, h), { x: 3, y: 2, w: 6, h: 3 });
  assert.deepEqual(opaqueBounds(new Uint8ClampedArray(16), 2, 2), { x: 0, y: 0, w: 2, h: 2 });
  // The trading card fills the pocket; a wide card lies across it, a square one sits in the middle.
  assert.deepEqual(fitIn(900, 1260, 250, 350), { w: 250, h: 350 });
  assert.deepEqual(fitIn(1260, 900, 250, 350), { w: 250, h: 179 });
  assert.deepEqual(fitIn(1000, 1000, 250, 350), { w: 250, h: 250 });
  assert.deepEqual(fitIn(100, 140, 250, 350), { w: 100, h: 140 });
});
