// Run with `npm test` (Node's built-in runner; Node strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breakoutPose } from '../src/depth/breakout.ts';

test('the subject stays in the picture until its cut stands up', () => {
  assert.deepEqual(breakoutPose([0.5, 0.5], 0, 1), { scale: 0, lift: 0 });
});

test('the subject stays in the picture with the finish turned off', () => {
  assert.deepEqual(breakoutPose([0.5, 0.5], 1, 0), { scale: 0, lift: 0 });
});

test('face on, the subject already breaks out', () => {
  const p = breakoutPose([0, 0], 1, 1);
  assert.ok(p.scale > 0.05 && p.lift > 0.05);
});

test('a tilt pushes the subject further out, up to a full lean', () => {
  const still = breakoutPose([0, 0], 1, 1);
  const lean = breakoutPose([0.6, 0.8], 1, 1);
  assert.ok(lean.scale > still.scale && lean.lift > still.lift);
  assert.deepEqual(breakoutPose([3, 4], 1, 1), lean);
});

test('a strength past full does not push it further', () => {
  assert.deepEqual(breakoutPose([0.2, 0], 1, 1.5), breakoutPose([0.2, 0], 1, 1));
});
