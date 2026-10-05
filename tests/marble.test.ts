// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_STILL, AutoTouch, HeatField } from '../src/touch/heat.ts';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';

/** How far the ink at (u, v) has been carried, in card uv. */
const flow = (f: { data: Float32Array; w: number; h: number }, u: number, v: number): [number, number] => {
  const i = Math.min(f.h - 1, Math.floor(v * f.h)) * f.w + Math.min(f.w - 1, Math.floor(u * f.w));
  return [f.data[i * 2], f.data[i * 2 + 1]];
};
const run = (f: HeatField, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) f.step(1 / 60);
};
/** A finger dragged from (u0, v0) to (u1, v1) over `seconds`, a frame at a time. */
const drag = (f: HeatField, u0: number, v0: number, u1: number, v1: number, seconds = 0.4) => {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const b = (i + 1) / n;
    f.touch(u0 + (u1 - u0) * a, v0 + (v1 - v0) * a, u0 + (u1 - u0) * b, v0 + (v1 - v0) * b, 1 / 60, true);
    f.step(1 / 60);
  }
};

test('Marble is a touch finish on shader 102, in a pack', () => {
  const marble = EDITIONS.find((e) => e.id === 'marble');
  assert.ok(marble);
  assert.equal(marble.shader, 102);
  assert.equal(marble.touch, 'marble');
  assert.ok(!OPEN_EDITIONS.includes('marble'));
  assert.ok(packOf('marble'), 'sits in a pack');
  assert.ok(!layerable('marble'), 'needs the card to itself, like the other touch finishes');
});

test('its field holds a direction: two numbers a cell', () => {
  const f = new HeatField('marble');
  assert.equal(f.channels, 2);
  assert.equal(f.data.length, f.w * f.h * 2);
  assert.equal(new HeatField('warmth').channels, 1);
});

test('a stroke carries the ink along with it, and leaves the far side of the card alone', () => {
  const f = new HeatField('marble');
  drag(f, 0.3, 0.5, 0.6, 0.5);
  const [du, dv] = flow(f, 0.5, 0.5);
  assert.ok(du > 0.05, `pulled along the stroke: ${du}`);
  assert.ok(Math.abs(dv) < du * 0.3, `not across it: ${dv}`);
  const far = flow(f, 0.5, 0.9);
  assert.ok(Math.hypot(...far) < 0.005, `far away stays: ${far}`);
});

test('a finger held still stirs the ink round it', () => {
  const f = new HeatField('marble');
  for (let i = 0; i < 60; i++) {
    f.press(0.5, 0.5, 1 / 60);
    f.step(1 / 60);
  }
  // Right of the finger the ink has come from below or above, left of it the other way: a turn.
  const [, right] = flow(f, 0.56, 0.5);
  const [, left] = flow(f, 0.44, 0.5);
  assert.ok(Math.abs(right) > 0.005, `turned: ${right}`);
  assert.ok(Math.sign(right) === -Math.sign(left), `opposite sides turn opposite ways: ${right}, ${left}`);
  assert.equal(f.prints.length, 0, 'no fingerprint');
});

test('the water draws the ink back slowly, then the card is still again', () => {
  const f = new HeatField('marble');
  drag(f, 0.3, 0.5, 0.6, 0.5);
  const d0 = flow(f, 0.5, 0.5)[0];
  run(f, 1);
  const d1 = flow(f, 0.5, 0.5)[0];
  assert.ok(d1 > d0 * 0.5, `still mostly there after a second: ${d0} -> ${d1}`);
  run(f, 14);
  assert.ok(f.cold, 'settled');
  assert.ok(f.data.every((x) => x === 0));
});

test('the automatic stroke loops seamlessly, and a still picture catches it fresh', () => {
  const a = new AutoTouch('marble');
  const b = new AutoTouch('marble');
  for (const p of [0, 0.3, 0.7]) {
    a.at(3 + p);
    b.at(4 + p);
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) diff = Math.max(diff, Math.abs(a.data[i] - b.data[i]));
    assert.ok(diff < 0.002, `phase ${p}: ${diff}`);
  }
  a.at(3 + AUTO_STILL.marble);
  assert.ok(Math.max(...a.data.map(Math.abs)) > 0.05, 'the stroke shows in a still');
});

test('its uniforms carry their own prefix', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'gl', 'marble.ts'), 'utf8');
  const names = [...src.matchAll(/^uniform\s+\w+\s+(\w+)/gm)].map((m) => m[1]);
  assert.ok(names.length > 0);
  for (const n of names) assert.match(n, /^uMarble/);
});
