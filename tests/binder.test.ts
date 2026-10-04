// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BYTES, MAX_CARDS, PER_PAGE, pageCount, pocketsOn, refusal } from '../src/binder/limits.ts';

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

test('pages hold nine pockets; the pocket that keeps the stage card comes first while there is room', () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(8), 1);
  assert.equal(pageCount(9), 2);
  assert.equal(pageCount(53), 6);
  // Full: no keep pocket, so 54 cards fill exactly six pages.
  assert.equal(pageCount(54), 6);
});

test('each page shows its own nine pockets, the keep pocket taking the first place of the first page', () => {
  const ids = Array.from({ length: 11 }, (_, i) => `c${i}`);
  assert.deepEqual(pocketsOn(ids, 0), ['keep', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  assert.deepEqual(pocketsOn(ids, 1), ['c8', 'c9', 'c10', null, null, null, null, null, null]);
  assert.deepEqual(pocketsOn([], 0), ['keep', null, null, null, null, null, null, null, null]);
  const full = Array.from({ length: 54 }, (_, i) => `c${i}`);
  assert.equal(pocketsOn(full, 0)[0], 'c0');
  assert.deepEqual(pocketsOn(full, 5), full.slice(45));
  // A page past the end (cards discarded meanwhile) is just empty pockets.
  assert.deepEqual(pocketsOn(ids, 4), Array(9).fill(null));
});
