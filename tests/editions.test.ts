// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS } from '../src/editions.ts';

test('every finish draws with its own shader', () => {
  const shaders = EDITIONS.map((e) => e.shader);
  assert.equal(new Set(shaders).size, shaders.length);
});
