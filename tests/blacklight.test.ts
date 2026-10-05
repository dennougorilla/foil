// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TORCH_STILL, torchAt } from '../src/gl/torch.ts';
import { EDITIONS } from '../src/editions.ts';
import { OPEN_EDITIONS } from '../src/packs.ts';

const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;

test('Blacklight is a pack finish on shader 72 whose light is a lamp', () => {
  const ed = EDITIONS.find((e) => e.id === 'blacklight');
  assert.ok(ed, 'no Blacklight edition');
  assert.equal(ed.shader, 72);
  assert.equal(ed.torch, true);
  assert.ok(!OPEN_EDITIONS.includes('blacklight'), 'Blacklight must not be in the hand from the start');
  assert.equal(EDITIONS.filter((e) => e.shader === 72).length, 1);
});

test('the lamp sweep closes on itself, so exports loop seamlessly', () => {
  for (const p of [0, 0.3, 0.77]) assert.ok(near(torchAt(p), torchAt(p + 1)));
});

test('the lamp stays over the art window', () => {
  for (let i = 0; i < 100; i++) {
    const [x, y] = torchAt(i / 100);
    assert.ok(x > 0.2 && x < 0.8, `x ${x} leaves the art`);
    assert.ok(y > 0.2 && y < 0.72, `y ${y} leaves the art`);
  }
  const [x, y] = TORCH_STILL;
  assert.ok(x > 0.2 && x < 0.8 && y > 0.2 && y < 0.72);
});

test('the lamp moves slowly: one sweep covers less than a card width', () => {
  let len = 0;
  for (let i = 0; i < 200; i++) {
    const a = torchAt(i / 200);
    const b = torchAt((i + 1) / 200);
    len += Math.hypot(b[0] - a[0], (b[1] - a[1]) * 1.4);
  }
  assert.ok(len > 0.4, `the lamp barely moves (${len.toFixed(2)})`);
  assert.ok(len < 1.0, `the lamp sweeps too far per loop (${len.toFixed(2)})`);
});
