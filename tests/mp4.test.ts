// The MP4 for Instagram (docs/features.md, Export): the card's own loop, played whole times to last
// at least six seconds, at 30 fps in a 4 : 5 frame. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MP4_FPS, mp4At, mp4Plan } from '../src/anim/mp4Plan.ts';
import { exportLoop, MOTION_ORDER, TUNE_DEFAULTS, type Tune } from '../src/tune/model.ts';
import '../src/tune/moves.ts';

const CARD = 1260 / 900;
const tune = (t: Partial<Tune>): Tune => ({ ...TUNE_DEFAULTS, ...t });

test('the trading card makes Instagram’s 4 : 5 portrait, 1080 × 1350 at 30 fps', () => {
  const p = mp4Plan(TUNE_DEFAULTS, CARD);
  assert.equal(p.width, 1080);
  assert.equal(p.height, 1350);
  assert.equal(MP4_FPS, 30);
  assert.equal(p.seconds, p.frames / 30);
});

test('the loop plays whole times until the video lasts at least six seconds, and no more', () => {
  for (const idle of MOTION_ORDER) {
    for (const speed of [0, 0.25, 0.5, 1, 1.5, 2, 3]) {
      for (const light of ['orbit', 'pointer'] as const) {
        const t = tune({ idle, speed, light });
        const { loopMs } = exportLoop(t);
        const p = mp4Plan(t, CARD);
        const name = `${idle}/${light}/${speed}`;
        assert.equal(p.loopMs, loopMs, name);
        assert.ok(p.loops >= 1 && Number.isInteger(p.loops), name);
        assert.ok(p.loops * loopMs >= 6000, `${name}: ${p.loops} × ${loopMs} ms is under six seconds`);
        assert.ok(p.loops === 1 || (p.loops - 1) * loopMs < 6000, `${name}: one loop too many`);
        // Instagram takes nothing under three seconds.
        assert.ok(p.seconds >= 3, name);
        assert.equal(p.frames, Math.round((p.loops * loopMs * 30) / 1000), name);
      }
    }
  }
});

test('a 2.4-second loop plays three times; a six-second one once; a slow one once, however long', () => {
  assert.deepEqual([2400, 6000, 24000].map((ms) => mp4Plan(tune({ speed: 6000 / ms }), CARD, undefined, true).loops), [3, 1, 1]);
  assert.equal(mp4Plan(tune({ speed: 0 }), CARD).seconds, 7.2);
});

test('frames are evenly spaced and the last loop closes on the first frame', () => {
  const p = mp4Plan(tune({ idle: 'sway', speed: 1.3 }), CARD);
  const steps = Array.from({ length: p.frames }, (_, i) => (mp4At(p, i + 1) - mp4At(p, i) + 1) % 1);
  for (const s of steps) assert.ok(Math.abs(s - steps[0]) < 1e-9);
  assert.equal(mp4At(p, 0), 0);
  assert.ok(Math.abs(mp4At(p, p.frames) % 1) < 1e-9);
  // One frame is a thirtieth of a second of the motion, give or take a hair.
  assert.ok(Math.abs((steps[0] * p.loopMs) / 1000 - 1 / 30) < (1 / 30) * 0.01);
});

test('an animated picture keeps its own time span per loop', () => {
  const p = mp4Plan(TUNE_DEFAULTS, CARD, 700);
  assert.equal(p.sourceSpan, exportLoop(TUNE_DEFAULTS, 700).sourceSpan);
});

test('other shapes turn and resize the frame, with even sides for the encoder', () => {
  const wide = mp4Plan(TUNE_DEFAULTS, 900 / 1260);
  assert.ok(wide.width > wide.height);
  const square = mp4Plan(TUNE_DEFAULTS, 1);
  assert.ok(Math.abs(square.width / square.height - 1) < 0.01);
  for (const p of [wide, square, mp4Plan(TUNE_DEFAULTS, 900 / 1489)]) assert.ok(p.width % 2 === 0 && p.height % 2 === 0);
});

test('the size estimate follows the length at the set bit rate', () => {
  const a = mp4Plan(tune({ speed: 0 }), CARD);
  const b = mp4Plan(tune({ speed: 0.25 }), CARD);
  assert.ok(b.bytes > a.bytes * 2);
  assert.ok(a.bytes > 1_000_000 && a.bytes < 6_000_000, `${a.bytes} bytes for ${a.seconds} s`);
});
