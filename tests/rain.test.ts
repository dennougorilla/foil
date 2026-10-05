// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_STILL, AutoTouch, HeatField } from '../src/touch/heat.ts';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';
import { RAIN_GLSL, RAIN_SHADER } from '../src/gl/rain.ts';

const at = (f: { data: Float32Array; w: number; h: number }, u: number, v: number) =>
  f.data[Math.min(f.h - 1, Math.floor(v * f.h)) * f.w + Math.min(f.w - 1, Math.floor(u * f.w))];
const run = (f: HeatField, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) f.step(1 / 60);
};

test('Rainy Window is a touch finish of the Lab pack on shader 94', () => {
  const rain = EDITIONS.find((e) => e.id === 'rain');
  assert.ok(rain);
  assert.equal(rain.shader, 94);
  assert.equal(RAIN_SHADER, 94);
  assert.equal(rain.touch, 'rain');
  assert.ok(!OPEN_EDITIONS.includes('rain'));
  assert.equal(packOf('rain')?.id, 'lab');
  assert.ok(!layerable('rain'), 'a touch finish needs the card to itself');
});

test('a wipe clears the fog along its path and nowhere else', () => {
  const f = new HeatField('rain');
  f.touch(0.2, 0.4, 0.8, 0.4, 1 / 60, true);
  assert.ok(at(f, 0.5, 0.4) > 0.5, `wiped: ${at(f, 0.5, 0.4)}`);
  assert.equal(at(f, 0.5, 0.8), 0);
});

test('the wiped glass stays clear for a few seconds, then fogs over again', () => {
  const f = new HeatField('rain');
  // A finger drawn across in under half a second.
  for (let i = 0; i < 24; i++) {
    f.touch(0.2 + i * 0.025, 0.4, 0.225 + i * 0.025, 0.4, 1 / 60, true);
    f.step(1 / 60);
  }
  run(f, 2);
  assert.ok(at(f, 0.5, 0.4) > 0.3, `still clear after 2 s: ${at(f, 0.5, 0.4)}`);
  run(f, 8);
  assert.ok(at(f, 0.5, 0.4) < 0.12, `fogged after 10 s: ${at(f, 0.5, 0.4)}`);
  run(f, 20);
  assert.ok(f.cold, 'all fogged');
});

test('a press leaves a fingerprint in the fog', () => {
  const f = new HeatField('rain');
  f.press(0.5, 0.5, 0.5);
  assert.equal(f.prints.length, 1);
});

test('the unseen finger wipes once per loop and the fog is back when the loop closes', () => {
  const a = new AutoTouch('rain');
  const b = new AutoTouch('rain');
  for (const p of [0, 0.3, 0.7]) {
    a.at(3 + p);
    b.at(4 + p);
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
    assert.ok(diff < 0.01, `phase ${p}: ${diff}`);
  }
  a.at(3);
  assert.ok(Math.max(...a.data) < 0.12, `fogged at the seam: ${Math.max(...a.data)}`);
  a.at(3 + AUTO_STILL.rain);
  assert.ok(Math.max(...a.data) > 0.6, 'a still picture shows the wipe clear');
});

test("the shader's uniforms carry its own prefix", () => {
  const uniforms = [...RAIN_GLSL.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
  for (const u of uniforms) assert.match(u, /^uRn[A-Z]/);
  const nature = readFileSync(join(import.meta.dirname, '..', 'src', 'gl', 'finishes', 'lab.ts'), 'utf8');
  assert.match(nature, /e == 94\) col = rain\(/);
});
