// Run with `npm test`. Liquid Metal's ripples: a wave field over the card (src/touch/heat.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_STILL, AutoTouch, HeatField } from '../src/touch/heat.ts';
import { EDITIONS } from '../src/editions.ts';
import { packOf } from '../src/packs.ts';

const at = (f: { data: Float32Array; w: number; h: number }, u: number, v: number) =>
  f.data[Math.min(f.h - 1, Math.floor(v * f.h)) * f.w + Math.min(f.w - 1, Math.floor(u * f.w))];
const run = (f: HeatField, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) f.step(1 / 60);
};
const peak = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('Liquid Metal is a touch finish on shader 98 in the Metal pack, before Crystal', () => {
  const lm = EDITIONS.find((e) => e.id === 'liquidmetal');
  assert.ok(lm);
  assert.equal(lm.shader, 98);
  assert.equal(lm.touch, 'liquid');
  const metal = packOf('liquidmetal');
  assert.equal(metal?.id, 'metal');
  assert.equal(metal?.finishes.at(-1), 'crystal');
});

test('a touch sends a train of rings outward', () => {
  const f = new HeatField('liquid');
  for (let i = 0; i < 12; i++) f.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  assert.equal(at(f, 0.5, 0.75), 0, 'further out, still level');
  let lo = 0;
  let hi = 0;
  let turns = 0;
  let last = 0;
  for (let i = 0; i < 90; i++) {
    f.step(1 / 60);
    const v = at(f, 0.5, 0.75);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
    if (Math.abs(v) > 3e-4 && Math.sign(v) !== Math.sign(last)) {
      turns++;
      last = v;
    }
  }
  assert.ok(hi > 0.001 && lo < -0.001, `rings passed by: ${lo} .. ${hi}`);
  assert.ok(turns >= 3, `crest and trough, more than once: ${turns}`);
});

test('the ripples die away and the surface goes flat', () => {
  const f = new HeatField('liquid');
  f.touch(0.2, 0.4, 0.8, 0.4, 1 / 60, true);
  run(f, 9);
  assert.ok(f.cold, `still moving: ${peak(f.data)}`);
});

test('held still (reduced motion), a touch leaves a dent that settles without spreading', () => {
  const f = new HeatField('liquid');
  f.calm = true;
  f.touch(0.5, 0.5, 0.5, 0.5, 1 / 60, true);
  const dent = at(f, 0.5, 0.5);
  assert.ok(dent < 0, `pressed in: ${dent}`);
  f.step(1 / 60);
  assert.equal(at(f, 0.5, 0.8), 0, 'nothing travels');
  assert.ok(at(f, 0.5, 0.5) > dent && at(f, 0.5, 0.5) <= 0, 'it settles back, never overshooting');
  run(f, 8);
  assert.ok(f.cold);
});

test('the rippling export loop is seamless and still at the seam', () => {
  const a = new AutoTouch('liquid');
  const b = new AutoTouch('liquid');
  for (const p of [0, 0.3, 0.7]) {
    a.at(3 + p);
    b.at(4 + p);
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
    assert.ok(diff < 1e-3, `phase ${p}: ${diff}`);
  }
  a.at(3);
  assert.ok(peak(a.data) < 1e-3, `flat at the seam: ${peak(a.data)}`);
  a.at(3 + AUTO_STILL.liquid);
  assert.ok(peak(a.data) > 0.01, `a still picture catches the ripples: ${peak(a.data)}`);
});
