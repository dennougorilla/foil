// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS } from '../src/editions.ts';
import { OPEN_EDITIONS, pickSecret } from '../src/secrets.ts';

test('every finish draws with its own shader', () => {
  const shaders = EDITIONS.map((e) => e.shader);
  assert.equal(new Set(shaders).size, shaders.length);
});

test('Platinum starts out of the hand as a secret and can be drawn', () => {
  assert.ok(EDITIONS.some((e) => e.id === 'platinum'));
  assert.ok(!(OPEN_EDITIONS as string[]).includes('platinum'));
  const secrets = EDITIONS.map((e) => e.id).filter((id) => !OPEN_EDITIONS.includes(id));
  const others = secrets.filter((id) => id !== 'platinum');
  assert.equal(pickSecret(secrets, others, Math.random), 'platinum');
});
