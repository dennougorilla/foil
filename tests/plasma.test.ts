// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLASMA_STILL, plasmaFinger } from '../src/gl/torch.ts';
import { PLASMA_GLSL } from '../src/gl/plasma.ts';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';

test('Plasma is a Light pack finish on shader 96 whose light is a lamp under the pointer', () => {
  const ed = EDITIONS.find((e) => e.id === 'plasma');
  assert.ok(ed, 'no Plasma edition');
  assert.equal(ed.shader, 96);
  assert.equal(ed.torch, 'plasma');
  assert.equal(ed.dither, true);
  assert.equal(EDITIONS.filter((e) => e.shader === 96).length, 1);
  assert.ok(!OPEN_EDITIONS.includes('plasma'), 'Plasma must not be in the hand from the start');
  const pack = packOf('plasma');
  assert.equal(pack?.id, 'light');
  // Before the showpiece, which stays last.
  assert.deepEqual(pack.finishes.slice(-2), ['plasma', 'shallows']);
  assert.equal(layerable('plasma'), false);
});

test("Plasma's uniforms carry its own prefix, so no other finish's can clash with them", () => {
  const names = [...PLASMA_GLSL.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
  assert.ok(names.length > 0);
  for (const n of names) assert.ok(n.startsWith('uPlasma'), n);
});

test('the unseen finger touches once per loop and the loop closes', () => {
  for (const p of [0, 0.2, 0.5, 0.77]) {
    const a = plasmaFinger(p);
    const b = plasmaFinger(p + 1);
    assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-9), `differs across the seam at ${p}`);
  }
  assert.equal(plasmaFinger(0)[2], 0);
  let max = 0;
  let down = 0;
  let prev = plasmaFinger(0);
  for (let i = 1; i <= 600; i++) {
    const f = plasmaFinger(i / 600);
    max = Math.max(max, f[2]);
    if (f[2] > 0.99) down++;
    // No jumps: it lands and lifts smoothly, and moves smoothly while down.
    assert.ok(Math.abs(f[2] - prev[2]) < 0.05, `touch jumps at ${i / 600}`);
    if (f[2] > 0) assert.ok(Math.hypot(f[0] - prev[0], f[1] - prev[1]) < 0.01, `finger jumps at ${i / 600}`);
    prev = f;
  }
  assert.equal(max, 1);
  // Down for a good part of the loop, and up for a good part too (the streamers wander then).
  assert.ok(down / 600 > 0.3 && down / 600 < 0.6, `down ${(down / 600).toFixed(2)} of the loop`);
});

test('the finger stays over the art and slides far enough for the lightning to follow it', () => {
  let len = 0;
  let prev = plasmaFinger(0);
  for (let i = 1; i <= 400; i++) {
    const f = plasmaFinger(i / 400);
    if (f[2] > 0) {
      const [x, y] = f;
      assert.ok(x > 0.2 && x < 0.8 && y > 0.2 && y < 0.72, `finger off the art at ${i / 400}: ${x}, ${y}`);
    }
    if (f[2] > 0.99 && prev[2] > 0.99) len += Math.hypot(f[0] - prev[0], (f[1] - prev[1]) * 1.4);
    prev = f;
  }
  assert.ok(len > 0.25, `the finger barely moves (${len.toFixed(2)})`);
  assert.ok(len < 0.9, `the finger moves too far (${len.toFixed(2)})`);
  const [x, y, touch] = PLASMA_STILL;
  assert.ok(x > 0.2 && x < 0.8 && y > 0.2 && y < 0.72 && touch === 1);
});
