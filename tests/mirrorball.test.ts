// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS, layerable } from '../src/editions.ts';
import { OPEN_EDITIONS, packOf } from '../src/packs.ts';
import { MIRRORBALL_SHADER, MIRRORBALL_GLSL, ROOM_FS, roomSpin, SPIN } from '../src/gl/mirrorball.ts';

test('Mirror Ball is a Lab pack finish on shader 104 (provisional)', () => {
  const ed = EDITIONS.find((e) => e.id === 'mirrorball');
  assert.ok(ed, 'no Mirror Ball edition');
  assert.equal(ed.shader, 104);
  assert.equal(MIRRORBALL_SHADER, 104);
  assert.equal(EDITIONS.filter((e) => e.shader === 104).length, 1);
  assert.ok(!OPEN_EDITIONS.includes('mirrorball'), 'Mirror Ball must not be in the hand from the start');
  assert.equal(packOf('mirrorball')?.id, 'lab');
  // Its spots fall on the stage, not over the art, so it can be a layer like any plain finish.
  assert.ok(layerable('mirrorball'));
});

test('the ball turns by whole cells of spots in an exported loop, so the loop closes', () => {
  assert.equal(roomSpin(0), SPIN);
  for (const loop of [2, 3, 6, 12, 2.4]) {
    const cells = roomSpin(loop) * loop;
    assert.ok(Math.abs(cells - Math.round(cells)) < 1e-9, `loop ${loop}`);
    assert.ok(cells >= 1, `loop ${loop} turns`);
  }
});

test('its uniforms carry their own prefix, so they never clash with another program', () => {
  // The card shader's part declares no uniforms of its own; the room's are all uMb….
  assert.ok(!/\buniform\b/.test(MIRRORBALL_GLSL));
  const names = [...ROOM_FS.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
  assert.ok(names.length > 0);
  for (const n of names) assert.match(n, /^uMb[A-Z]/);
});
