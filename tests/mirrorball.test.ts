// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';
import { MIRRORBALL_SHADER, MIRRORBALL_GLSL, ROOM_FS, roomLap } from '../src/gl/mirrorball.ts';

test('Mirror Ball is a Light pack finish on shader 104', () => {
  const ed = EDITIONS.find((e) => e.id === 'mirrorball');
  assert.ok(ed, 'no Mirror Ball edition');
  assert.equal(ed.shader, 104);
  assert.equal(MIRRORBALL_SHADER, 104);
  assert.equal(EDITIONS.filter((e) => e.shader === 104).length, 1);
  assert.ok(!OPEN_EDITIONS.includes('mirrorball'), 'Mirror Ball must not be in the hand from the start');
  assert.equal(packOf('mirrorball')?.id, 'light');
  // Its spots fall on the stage, not over the art, so it can be a layer like any plain finish.
  assert.ok(layerable('mirrorball'));
});

test('an exported loop hands the turning spots back to the ones it began with, so it closes', () => {
  // Live the ball just turns on.
  assert.deepEqual(roomLap(7.3, 0), [7.3, 0]);
  for (const loop of [3, 6, 2.4]) {
    // The loop starts on its own spots alone, and ends on the spots one loop back, which are the same.
    assert.deepEqual(roomLap(0, loop), [0, 0]);
    const [t, end] = roomLap(loop - 1e-6, loop);
    assert.ok(Math.abs(t - loop) < 1e-5 && end > 0.999, `loop ${loop}`);
    // Most of the loop shows the spots as they turn on the stage.
    assert.equal(roomLap(loop * 0.5, loop)[1], 0);
    // The same moment of any lap is the same frame.
    const [a, fa] = roomLap(loop * 2.85, loop);
    const [b, fb] = roomLap(loop * 0.85, loop);
    assert.ok(Math.abs(a - b) < 1e-9 && Math.abs(fa - fb) < 1e-9 && fa > 0, `loop ${loop}`);
  }
});

test('its uniforms carry their own prefix, so they never clash with another program', () => {
  // The card shader's part declares no uniforms of its own; the room's are all uMb….
  assert.ok(!/\buniform\b/.test(MIRRORBALL_GLSL));
  const names = [...ROOM_FS.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
  assert.ok(names.length > 0);
  for (const n of names) assert.match(n, /^uMb[A-Z]/);
});

test('its frame is chrome in full, and its mirrors read the picture once each', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../src/gl/shaders.ts', import.meta.url), 'utf8');
  const full = card.split('\n').find((l) => l.includes('cover the frame in full')) ?? '';
  assert.match(full, /e == 104\b/);
  // One tone per mirror: the picture is read at the mirror's middle, not under every pixel.
  assert.equal(MIRRORBALL_GLSL.match(/\bface\(/g)?.length, 1);
  assert.match(MIRRORBALL_GLSL, /face\(g0 \+ atUv - uv/);
});
