// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GyroTilt } from '../src/tune/gyro.ts';

const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) < eps, `${a} is not near ${b}`);

test('the first reading is the rest pose', () => {
  const g = new GyroTilt();
  g.feed(40, 5, 0, 0);
  near(g.x, 0);
  near(g.y, 0);
});

test('tilting the phone right and toward you tilts the card the same way, saturating softly', () => {
  const g = new GyroTilt();
  g.feed(40, 0, 0, 0);
  g.feed(40, 10, 0, 16);
  assert.ok(g.x > 0.3 && g.x < 0.6, `x ${g.x}`);
  g.feed(52, 10, 0, 32);
  assert.ok(g.y > 0.3, `y ${g.y}`);
  g.feed(40, 80, 0, 48);
  assert.ok(g.x > 0.95 && g.x <= 1, `x ${g.x}`);
});

test('held tilted, the card drifts back level over a few seconds', () => {
  const g = new GyroTilt();
  g.feed(40, 0, 0, 0);
  g.feed(40, 12, 0, 16);
  const start = g.x;
  for (let t = 32; t < 1000; t += 16) g.feed(40, 12, 0, t);
  assert.ok(g.x > start * 0.6, 'it should not snap back within a second');
  for (let t = 1000; t < 12_000; t += 16) g.feed(40, 12, 0, t);
  near(g.x, 0, 0.05);
});

test('the screen turned to landscape maps the sensor onto the screen as held', () => {
  const g = new GyroTilt();
  g.feed(0, 0, 90, 0);
  // Turned 90°, raising beta tilts the screen's x axis.
  g.feed(10, 0, 90, 16);
  assert.ok(g.x > 0.3, `x ${g.x}`);
  near(g.y, 0);
});

test('a reading across the ±180° seam does not jerk the card', () => {
  const g = new GyroTilt();
  g.feed(178, 0, 0, 0);
  g.feed(-178, 0, 0, 16);
  assert.ok(Math.abs(g.y) < 0.2, `y ${g.y}`);
});

test('a long gap in readings starts over from the new pose', () => {
  const g = new GyroTilt();
  g.feed(40, 0, 0, 0);
  g.feed(10, 30, 0, 5000);
  near(g.x, 0);
  near(g.y, 0);
});
