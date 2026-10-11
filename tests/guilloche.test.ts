// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';

const METAL = readFileSync(join(import.meta.dirname, '..', 'src', 'gl', 'finishes', 'metal.ts'), 'utf8');
/** The function's own body, so another finish's code cannot satisfy the checks. */
const fn = METAL.match(/vec3 guilloche\([\s\S]*?\n\}/)?.[0] ?? '';

test('Guilloche is a Metal finish on shader 91, the card before the showpiece', () => {
  const ed = EDITIONS.find((e) => e.id === 'guilloche');
  assert.ok(ed, 'no Guilloche edition');
  assert.equal(ed.shader, 91);
  assert.equal(EDITIONS.filter((e) => e.shader === 91).length, 1);
  assert.ok(!OPEN_EDITIONS.includes('guilloche'));
  const metal = packOf('guilloche');
  assert.equal(metal?.id, 'metal');
  assert.equal(metal.finishes.at(-2), 'guilloche');
});

test('its smooth iridescence is dithered in a GIF, and it can be layer 2', () => {
  const ed = EDITIONS.find((e) => e.id === 'guilloche')!;
  assert.equal(ed.dither, true);
  assert.ok(layerable('guilloche'));
});

test('it moves only with the tilt and the light: no clock, so exports loop and reduced motion holds it', () => {
  assert.ok(fn.length > 0, 'no guilloche function in the Metal module');
  assert.doesNotMatch(fn, /\buTime\b/);
  assert.doesNotMatch(fn, /\buniform\b/);
});

test('the Metal pack draws it', () => {
  assert.match(METAL, /vec3 guilloche\(/);
  assert.match(METAL, /e == 91\) col = guilloche\(/);
});
