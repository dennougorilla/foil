// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampTurn, halfExtent, MAX_TURN, normalizePlacements, snapInside } from '../src/arrange.ts';

const DEG = Math.PI / 180;
const INNER = { x: 0.03, y: 0.02, w: 0.94, h: 0.96 };
const GUIDES = { x: [0.5, 0.06, 0.94], y: [0.5, 0.04, 0.88] };

test('stored placements are kept only when they make sense, and are held in bounds', () => {
  assert.deepEqual(normalizePlacements(null), {});
  assert.deepEqual(normalizePlacements({ message: { x: 'a' }, other: { x: 0.5, y: 0.5, size: 0.1 } }), {});
  const p = normalizePlacements({ message: { x: 2, y: -1, size: 9, rot: 1 }, name: { x: 0.3, y: 0.4, size: 0.05, rot: 0 } });
  assert.deepEqual(p.message, { x: 1, y: 0, size: 0.3, rot: MAX_TURN });
  assert.deepEqual(p.name, { x: 0.3, y: 0.4, size: 0.05, rot: 0 });
});

test('a turn stays within ±15° and settles level within 3°', () => {
  assert.equal(clampTurn(2 * DEG), 0);
  assert.equal(clampTurn(-2.9 * DEG), 0);
  assert.equal(clampTurn(40 * DEG), MAX_TURN);
  assert.equal(clampTurn(-40 * DEG), -MAX_TURN);
  assert.ok(Math.abs(clampTurn(8 * DEG) - 8 * DEG) < 1e-9);
});

test('a turned piece takes a bigger box', () => {
  const flat = halfExtent(0.4, 0.1, 0);
  const turned = halfExtent(0.4, 0.1, 15 * DEG);
  assert.ok(Math.abs(flat.x - 0.2) < 1e-9 && Math.abs(flat.y - 0.05) < 1e-9);
  assert.ok(turned.y > flat.y && turned.x < flat.x + 0.05);
});

test('dragged words snap to a guide by their centre or an edge, and say which', () => {
  const half = { x: 0.2, y: 0.05 };
  const centre = snapInside(0.508, 0.3, half, GUIDES, INNER, 0.012);
  assert.equal(centre.x, 0.5);
  assert.equal(centre.gx, 0.5);
  assert.equal(centre.gy, null);
  // The left edge (x - 0.2) lands on the picture's edge at 0.06.
  const edge = snapInside(0.267, 0.3, half, GUIDES, INNER, 0.012);
  assert.ok(Math.abs(edge.x - 0.26) < 1e-9 && edge.gx === 0.06);
  // Far from every guide: left where it is.
  const free = snapInside(0.33, 0.3, half, GUIDES, INNER, 0.012);
  assert.ok(free.x === 0.33 && free.gx === null);
});

test('words stop at the frame and never leave the card', () => {
  const half = { x: 0.2, y: 0.05 };
  const out = snapInside(-0.5, 1.4, half, { x: [], y: [] }, INNER, 0.012);
  assert.ok(Math.abs(out.x - (INNER.x + half.x)) < 1e-9);
  assert.ok(Math.abs(out.y - (INNER.y + INNER.h - half.y)) < 1e-9);
});
