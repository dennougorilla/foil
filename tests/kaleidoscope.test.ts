// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';
import { KALEIDOSCOPE_GLSL } from '../src/gl/kaleidoscope.ts';

test('Kaleidoscope is a Light pack finish on shader 100, before the showpiece', () => {
  const ed = EDITIONS.find((e) => e.id === 'kaleidoscope');
  assert.ok(ed, 'no Kaleidoscope edition');
  assert.equal(ed.shader, 100);
  assert.equal(EDITIONS.filter((e) => e.shader === 100).length, 1);
  assert.ok(!OPEN_EDITIONS.includes('kaleidoscope'));
  const pack = packOf('kaleidoscope');
  assert.equal(pack?.id, 'light');
  assert.equal(pack.finishes.at(-1), 'shallows', 'Shallows stays the showpiece');
  // It needs nothing but the face and the tilt, so it can be laid over as layer 2.
  assert.ok(layerable('kaleidoscope'));
});

test('its shader is dispatched from the Light pack module', () => {
  const src = readFileSync(new URL('../src/gl/finishes/light.ts', import.meta.url), 'utf8');
  assert.match(src, /e == 100\) col = kaleidoscope\(/);
});

test('it has no clock of its own, so it loops in exports and holds still under reduced motion', () => {
  assert.doesNotMatch(KALEIDOSCOPE_GLSL, /uTime/);
});

test('its own uniforms, constants and helpers carry its prefix, so they never collide with another finish', () => {
  for (const [, name] of KALEIDOSCOPE_GLSL.matchAll(/uniform\s+\w+\s+(\w+)/g)) assert.match(name, /^uKs/);
  for (const [, name] of KALEIDOSCOPE_GLSL.matchAll(/^const\s+\w+\s+(\w+)/gm)) assert.match(name, /^KS_/);
  for (const [, name] of KALEIDOSCOPE_GLSL.matchAll(/^(?:float|vec2|vec3|vec4)\s+(\w+)\s*\(/gm)) assert.match(name, /^ks|^kaleidoscope$/);
});
