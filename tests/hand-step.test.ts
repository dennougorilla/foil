// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flickDir, stepIn } from '../src/handStep.ts';

const HAND = ['base', 'foil', 'holo', 'poly', 'negative'];

test('steps through the cards the hand holds, wrapping at the ends', () => {
  assert.equal(stepIn(HAND, 'holo', 1), 'poly');
  assert.equal(stepIn(HAND, 'holo', -1), 'foil');
  assert.equal(stepIn(HAND, 'negative', 1), 'base');
  assert.equal(stepIn(HAND, 'base', -1), 'negative');
});

test('a finish the hand does not hold (another folder) steps into the hand from its ends', () => {
  assert.equal(stepIn(HAND, 'gold', 1), 'base');
  assert.equal(stepIn(HAND, 'gold', -1), 'negative');
  assert.equal(stepIn([], 'gold', 1), null);
});

test('a quick sideways flick steps: left to the next card, right to the previous', () => {
  assert.equal(flickDir(-90, 10, -200), 1);
  assert.equal(flickDir(90, -12, 200), -1);
  // Short but fast still counts.
  assert.equal(flickDir(-40, 4, -900), 1);
});

test('taps, small nudges and mostly vertical drags do not step', () => {
  assert.equal(flickDir(3, 2, 0), 0);
  assert.equal(flickDir(-40, 5, -200), 0);
  assert.equal(flickDir(-90, 100, -400), 0);
  assert.equal(flickDir(20, 160, 50), 0);
});
