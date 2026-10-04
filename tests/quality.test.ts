// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_LEVELS, QualityGovernor } from '../src/quality.ts';

/** Feeds `ms` worth of frames, each `frame` ms long. */
function run(q: QualityGovernor, frame: number, ms: number) {
  for (let t = 0; t < ms; t += frame) q.frame(frame);
}

test('level 0 is full quality and every later level draws less', () => {
  assert.deepEqual(QUALITY_LEVELS[0], { res: 1, bg: 4, sparks: 1 });
  for (let i = 1; i < QUALITY_LEVELS.length; i++) {
    assert.ok(QUALITY_LEVELS[i].res < QUALITY_LEVELS[i - 1].res);
    assert.ok(QUALITY_LEVELS[i].bg >= QUALITY_LEVELS[i - 1].bg);
    assert.ok(QUALITY_LEVELS[i].sparks <= QUALITY_LEVELS[i - 1].sparks);
  }
});

test('a fast device never leaves full quality', () => {
  const q = new QualityGovernor();
  run(q, 16.7, 60_000);
  assert.equal(q.level, 0);
  const fast = new QualityGovernor();
  run(fast, 8.3, 60_000);
  assert.equal(fast.level, 0);
});

test('nothing is judged while the page is still warming up', () => {
  const q = new QualityGovernor();
  run(q, 60, 2500);
  assert.equal(q.level, 0);
});

test('a device that keeps missing frames steps down while each step helps', () => {
  const q = new QualityGovernor();
  // Frame time follows the resolution: the device is busy drawing.
  const cost = () => 12 + 30 * QUALITY_LEVELS[q.level].res ** 2;
  for (let t = 0; t < 30_000; ) {
    const f = cost();
    q.frame(f);
    t += f;
  }
  assert.ok(q.level >= 2, `expected to step down at least twice, at ${q.level}`);
  assert.ok(cost() < 26, 'it should end up near smooth');
});

test('a step that does not help is undone and not tried again', () => {
  // Capped at 30 fps (a battery saver): lowering the resolution changes nothing.
  const q = new QualityGovernor();
  const levels = new Set<number>();
  for (let t = 0; t < 60_000; t += 33.3) {
    q.frame(33.3);
    levels.add(q.level);
  }
  assert.equal(q.level, 0);
  assert.deepEqual([...levels].sort(), [0, 1], 'it should try one step at most');
});

test('stalls (a long task, a hidden tab) are not taken for slowness', () => {
  const q = new QualityGovernor();
  run(q, 16.7, 4000);
  for (let i = 0; i < 40; i++) {
    q.frame(400);
    run(q, 16.7, 200);
  }
  assert.equal(q.level, 0);
});

test('rest() starts measuring afresh after a pause', () => {
  const q = new QualityGovernor();
  run(q, 16.7, 4000);
  q.rest();
  run(q, 40, 900);
  assert.equal(q.level, 0);
});

test('a pinned level never changes', () => {
  const q = new QualityGovernor(2);
  assert.equal(q.level, 2);
  run(q, 60, 30_000);
  assert.equal(q.level, 2);
  assert.equal(new QualityGovernor(9).level, QUALITY_LEVELS.length - 1);
});

test('frames drawn while an export runs are not judged, and measuring starts over after it', () => {
  const q = new QualityGovernor();
  run(q, 16.7, 5000);
  q.hold(true);
  run(q, 60, 10_000);
  assert.equal(q.level, 0);
  q.hold(false);
  run(q, 16.7, 10_000);
  assert.equal(q.level, 0);
});
