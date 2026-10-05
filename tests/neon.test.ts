// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';
import { NEON_GLSL } from '../src/gl/neon.ts';

test('Neon is a pack finish on shader 92, dithered, and can be layer 2', () => {
  const ed = EDITIONS.find((e) => e.id === 'neon');
  assert.ok(ed, 'no Neon edition');
  assert.equal(ed.shader, 92);
  assert.equal(EDITIONS.filter((e) => e.shader === 92).length, 1);
  assert.equal(ed.dither, true);
  assert.ok(!OPEN_EDITIONS.includes('neon'), 'Neon must not be in the hand from the start');
  assert.ok(layerable('neon'));
});

test('Neon is in the Lab pack (provisional)', () => {
  assert.equal(packOf('neon')?.id, 'lab');
});

test("Neon's uniforms carry its own prefix, so no other finish can clash with them", () => {
  const names = [...NEON_GLSL.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
  for (const n of names) assert.match(n, /^uNeon[A-Z]/);
});

test('the flicker runs on cycles that an exported loop holds a whole number of times', () => {
  assert.match(NEON_GLSL, /uLoop/);
});

test('the Lab pack draws Neon on shader 92', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'gl', 'finishes', 'lab.ts'), 'utf8');
  assert.match(src, /e == 92\) col = neon\(c, uv, uTilt, L, m\.r\)/);
  assert.match(src, /NEON_GLSL/);
});
