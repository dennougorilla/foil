// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CHAMELEON_GLSL } from '../src/gl/chameleon.ts';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';

test('Chameleon is a Metal finish on shader 90, the card before the showpiece', () => {
  const ed = EDITIONS.find((e) => e.id === 'chameleon');
  assert.ok(ed, 'no Chameleon edition');
  assert.equal(ed.shader, 90);
  assert.equal(EDITIONS.filter((e) => e.shader === 90).length, 1);
  assert.ok(!OPEN_EDITIONS.includes('chameleon'));
  const metal = packOf('chameleon');
  assert.equal(metal?.id, 'metal');
  assert.equal(metal.finishes.at(-2), 'chameleon');
});

test('its smooth paint is dithered in a GIF, and it can be layer 2', () => {
  const ed = EDITIONS.find((e) => e.id === 'chameleon')!;
  assert.equal(ed.dither, true);
  assert.ok(layerable('chameleon'));
});

test('it moves only with the tilt and the light: no clock, so exports loop and reduced motion holds it', () => {
  assert.doesNotMatch(CHAMELEON_GLSL, /\buTime\b/);
});

const SRC = join(import.meta.dirname, '..', 'src');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const uniforms = (src: string) => [...src.matchAll(/\buniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);

test('any uniform of its own carries its prefix, and no other shader declares it', () => {
  const own = uniforms(CHAMELEON_GLSL);
  for (const u of own) assert.match(u, /^uCham[A-Z]/);
  const others = walk(SRC)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('chameleon.ts'))
    .flatMap((f) => uniforms(readFileSync(f, 'utf8')));
  for (const u of own) assert.ok(!others.includes(u), `${u} is declared elsewhere too`);
});

test('the Metal pack draws it', () => {
  const metal = readFileSync(join(SRC, 'gl', 'finishes', 'metal.ts'), 'utf8');
  assert.match(metal, /CHAMELEON_GLSL/);
  assert.match(metal, /e == 90\) col = chameleon\(/);
});
