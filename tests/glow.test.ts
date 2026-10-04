// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_STILL, AutoTouch, HEAT_H, HEAT_W, HeatField } from '../src/touch/heat.ts';
import { EDITIONS } from '../src/editions.ts';
import { OPEN_EDITIONS } from '../src/packs.ts';

const at = (f: { data: Float32Array }, u: number, v: number) =>
  f.data[Math.min(HEAT_H - 1, Math.floor(v * HEAT_H)) * HEAT_W + Math.min(HEAT_W - 1, Math.floor(u * HEAT_W))];
const run = (f: HeatField, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) f.step(1 / 60);
};

test('Glow is a secret touch finish on shader 70', () => {
  const glow = EDITIONS.find((e) => e.id === 'glow');
  assert.ok(glow);
  assert.equal(glow.shader, 70);
  assert.equal(glow.touch, 'glow');
  assert.ok(!OPEN_EDITIONS.includes('glow'));
  assert.equal(EDITIONS.find((e) => e.id === 'warmth')?.touch, 'warmth');
});

test('stored light lingers well after heat has gone, then goes dark', () => {
  const warm = new HeatField('warmth');
  const glow = new HeatField('glow');
  for (const f of [warm, glow]) f.touch(0.2, 0.4, 0.8, 0.4, 1 / 60, false);
  run(warm, 12);
  run(glow, 12);
  assert.ok(warm.cold, 'warmth has cooled');
  assert.ok(at(glow, 0.5, 0.4) > 0.02, `still glowing: ${at(glow, 0.5, 0.4)}`);
  run(glow, 40);
  assert.ok(glow.cold, 'dark again');
});

test('an afterglow dims fast at first, then lingers faintly', () => {
  const f = new HeatField('glow');
  f.touch(0.2, 0.4, 0.8, 0.4, 1 / 60, true);
  const q0 = at(f, 0.5, 0.4);
  run(f, 2);
  const q2 = at(f, 0.5, 0.4);
  run(f, 8);
  const q10 = at(f, 0.5, 0.4);
  assert.ok(q2 < q0 * 0.5, `the first two seconds take half: ${q0} -> ${q2}`);
  assert.ok(q10 > q2 * 0.15, `the tail holds on: ${q2} -> ${q10}`);
});

test('the lamp shines where the light is now and goes out soon after it leaves', () => {
  const f = new HeatField('glow');
  assert.equal(f.lamp[2], 0);
  for (let i = 0; i < 10; i++) {
    f.touch(0.3, 0.5, 0.4, 0.5, 1 / 60, false);
    f.step(1 / 60);
  }
  assert.deepEqual([f.lamp[0], f.lamp[1]], [0.4, 0.5]);
  assert.equal(f.lamp[2], 1);
  run(f, 0.5);
  assert.equal(f.lamp[2], 0);
  assert.ok(at(f, 0.4, 0.5) > 0.1, 'the ink glows on without it');
});

test('light stays where it was shone: a glowing line keeps its edge', () => {
  const f = new HeatField('glow');
  f.touch(0.2, 0.4, 0.8, 0.4, 1 / 60, true);
  run(f, 6);
  assert.ok(at(f, 0.5, 0.4) > 0.1);
  assert.ok(at(f, 0.5, 0.52) < at(f, 0.5, 0.4) * 0.05, 'no smear');
});

test('holding a light still charges the spot brighter and leaves no fingerprint', () => {
  const pass = new HeatField('glow');
  pass.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  const hold = new HeatField('glow');
  for (let i = 0; i < 60; i++) hold.press(0.5, 0.5, 1 / 60);
  hold.lift();
  assert.equal(hold.prints.length, 0);
  assert.ok(at(hold, 0.5, 0.5) > at(pass, 0.5, 0.5) * 1.5);
});

test('the glowing export loop is seamless and never starts quite dark', () => {
  const a = new AutoTouch('glow');
  const b = new AutoTouch('glow');
  for (const p of [0, 0.3, 0.7]) {
    a.at(3 + p);
    b.at(4 + p);
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
    assert.ok(diff < 0.01, `phase ${p}: ${diff}`);
    assert.equal(a.prints.length, 0);
  }
  a.at(3);
  const seam = Math.max(...a.data);
  a.at(3.3);
  const peak = Math.max(...a.data);
  assert.ok(seam > 0.05, `afterglow at the seam: ${seam}`);
  assert.ok(seam < peak * 0.2, `the light pass stands out: ${seam} vs ${peak}`);
});

test('a still picture catches the glow just after the light has gone', () => {
  const a = new AutoTouch('glow');
  a.at(3 + AUTO_STILL.glow);
  assert.equal(a.lamp[2], 0, 'the lamp is out');
  assert.ok(Math.max(...a.data) > 0.5, `still bright: ${Math.max(...a.data)}`);
});
