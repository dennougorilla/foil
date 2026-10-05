// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_LEVELS, QualityGovernor, startLevel } from '../src/quality.ts';

/** Feeds `ms` worth of frames, each `frame` ms long. */
function run(q: QualityGovernor, frame: number, ms: number) {
  for (let t = 0; t < ms; t += frame) q.frame(frame);
}

/** Feeds `ms` worth of frames whose length depends on the level; returns every level it was at. */
function runCost(q: QualityGovernor, cost: (level: number) => number, ms: number): Set<number> {
  const levels = new Set([q.level]);
  for (let t = 0; t < ms; ) {
    const f = cost(q.level);
    q.frame(f);
    levels.add(q.level);
    t += f;
  }
  return levels;
}

test('level 0 is full quality and every later level draws less', () => {
  assert.deepEqual(QUALITY_LEVELS[0], { res: 1, bg: 4, sparks: 1, still: false, crt: true });
  for (let i = 1; i < QUALITY_LEVELS.length; i++) {
    const [a, b] = [QUALITY_LEVELS[i - 1], QUALITY_LEVELS[i]];
    assert.ok(b.res < a.res);
    assert.ok(b.bg >= a.bg);
    assert.ok(b.sparks <= a.sparks);
    assert.ok(b.still || !a.still, 'a lower level never moves more');
    assert.ok(!b.crt || a.crt, 'a lower level never adds the CRT filter back');
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
  run(q, 60, 1400);
  assert.equal(q.level, 0);
});

test('a slow device is judged within a few seconds', () => {
  const q = new QualityGovernor();
  run(q, 40, 3000);
  assert.ok(q.level >= 1, `still at ${q.level} after 3 s of 25 fps`);
});

test('a device that keeps missing frames steps down while each step helps', () => {
  const q = new QualityGovernor();
  // Frame time follows the resolution: the device is busy drawing.
  const cost = (l: number) => 12 + 30 * QUALITY_LEVELS[l].res ** 2;
  runCost(q, cost, 30_000);
  assert.ok(q.level >= 2, `expected to step down at least twice, at ${q.level}`);
  assert.ok(cost(q.level) < 26, 'it should end up near smooth');
});

test('a device far too slow drops two levels at once', () => {
  const q = new QualityGovernor();
  const cost = [80, 60, 22, 18];
  run(q, cost[0], 2600);
  assert.equal(q.level, 2);
  runCost(q, (l) => cost[l], 10_000);
  assert.equal(q.level, 2, 'two levels down was enough');
});

test('a device that only manages a few frames a second is not mistaken for stalls', () => {
  const q = new QualityGovernor();
  runCost(q, (l) => [400, 300, 150, 100][l], 4000);
  assert.ok(q.level >= 2, `at ${q.level} after 4 s of 2.5 fps`);
});

test('a step that does not help is undone and not tried again', () => {
  // Capped at 30 fps (a battery saver): lowering the resolution changes nothing.
  const q = new QualityGovernor();
  const levels = runCost(q, () => 33.3, 60_000);
  assert.equal(q.level, 0);
  assert.deepEqual([...levels].sort(), [0, 1], 'it should try one step at most');
});

test('long frames while the page warms up (programs compiling) are not taken for slowness', () => {
  const q = new QualityGovernor();
  // A phone compiling the card's program: a second and a half of long frames, then smooth.
  run(q, 400, 1500);
  run(q, 16.7, 20_000);
  assert.equal(q.level, 0);
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

test('a pinned level never changes, whatever the start', () => {
  const q = new QualityGovernor(2);
  assert.equal(q.level, 2);
  run(q, 60, 30_000);
  assert.equal(q.level, 2);
  assert.equal(new QualityGovernor(9).level, QUALITY_LEVELS.length - 1);
  const p = new QualityGovernor(0, 2);
  run(p, 16.7, 30_000);
  assert.equal(p.level, 0);
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

test('phones and tablets with little memory start below full quality; anything else starts at full', () => {
  assert.equal(startLevel({ touch: false, memory: 2 }), 0);
  assert.equal(startLevel({ touch: true }), 0, 'a browser that does not say (Safari) starts at full quality');
  assert.equal(startLevel({ touch: true, memory: 8 }), 0);
  assert.equal(startLevel({ touch: true, memory: 4 }), 1);
  assert.equal(startLevel({ touch: true, memory: 2 }), 2);
  assert.equal(startLevel({ touch: true, memory: 1 }), 2);
});

test('a lowered start climbs back to full quality while the frames keep the display’s pace', () => {
  const q = new QualityGovernor(undefined, 2);
  assert.equal(q.level, 2);
  run(q, 16.7, 10_000);
  assert.equal(q.level, 0);
});

test('a climb that misses frames goes back down and is not tried again', () => {
  const q = new QualityGovernor(undefined, 1);
  const levels = runCost(q, (l) => (l === 0 ? 30 : 16.7), 60_000);
  assert.equal(q.level, 1);
  assert.deepEqual([...levels].sort(), [0, 1]);
  let climbs = 0;
  let was = q.level;
  runCost(q, (l) => {
    if (l < was) climbs++;
    was = l;
    return l === 0 ? 30 : 16.7;
  }, 60_000);
  assert.equal(climbs, 0, 'it climbed again');
});

test('a device that had to step down below a lowered start does not climb again', () => {
  const q = new QualityGovernor(undefined, 2);
  runCost(q, (l) => [40, 35, 30, 16.7][l], 30_000);
  assert.equal(q.level, 3);
});
