// What sits behind the card, on the stage and in every file (docs/backdrops.md). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKDROPS, backdropPhase, DEFAULT_BACKDROP, PLAIN_DEFAULT, sanitizeBackdrop, sanitizeBackdropColor, swirlTime } from '../src/backdrop.ts';
import { IDLE_MODES, loopCycle, loopView, TUNE_DEFAULTS } from '../src/tune/model.ts';
import { BACKDROP_FS } from '../src/gl/backdrops.ts';
import '../src/tune/moves.ts';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the swirl stays the default, with eight more after it', () => {
  assert.equal(DEFAULT_BACKDROP, 'swirl');
  assert.equal(BACKDROPS[0], 'swirl');
  assert.deepEqual(BACKDROPS, ['swirl', 'felt', 'studio', 'velvet', 'bokeh', 'stars', 'confetti', 'plain', 'clear']);
});

test('a saved backdrop that no longer fits starts over on the swirl, a bad color on the plain default', () => {
  assert.equal(sanitizeBackdrop('felt'), 'felt');
  assert.equal(sanitizeBackdrop('neon'), 'swirl');
  assert.equal(sanitizeBackdrop(undefined), 'swirl');
  assert.equal(sanitizeBackdropColor('#12abEF'), '#12abEF');
  for (const bad of ['red', '#fff', 7, null, undefined]) assert.equal(sanitizeBackdropColor(bad), PLAIN_DEFAULT);
  assert.match(PLAIN_DEFAULT, /^#[0-9a-f]{6}$/);
});

test('every backdrop but the swirl has its shader in the on-demand module, and the swirl is not there', () => {
  for (const id of BACKDROPS.slice(1)) assert.match(BACKDROP_FS[id as Exclude<(typeof BACKDROPS)[number], 'swirl'>], /#version 300 es/, id);
  assert.ok(!('swirl' in BACKDROP_FS));
  // Every shader reads the loop's place as a whole turn, so nothing can drift off the loop.
  for (const [id, fs] of Object.entries(BACKDROP_FS)) assert.ok(!/\buTime\b/.test(fs), `${id} reads a free-running clock`);
});

test('the stage left alone and the file show the backdrop at the same place of the loop', () => {
  for (const idle of IDLE_MODES) {
    for (const torch of [false, true]) {
      const t = { ...TUNE_DEFAULTS, idle, speed: 1.5 };
      for (const p of [0, 0.25, 0.5, 0.9]) {
        // A file draws position p; the stage's idle clock is at p of a loop, some loops in.
        const { s } = loopView(t, p, torch);
        assert.ok(close(backdropPhase(t, s, torch), p), `${idle} at ${p}`);
        assert.ok(close(backdropPhase(t, s + 3 * loopCycle(t, torch), torch), p, 1e-6), `${idle} at ${p}, three loops on`);
      }
    }
  }
});

test('nothing moves on its own at speed zero, so the backdrop holds still', () => {
  const t = { ...TUNE_DEFAULTS, speed: 0 };
  assert.equal(backdropPhase(t, 0, false), 0);
  assert.equal(backdropPhase(t, 12.3, false), 0);
});

test('the swirl breathes out and back over one loop, so the file closes without a seam', () => {
  assert.ok(close(swirlTime(0), swirlTime(1), 1e-9));
  assert.ok(close(swirlTime(0.25), swirlTime(1.25), 1e-9));
  assert.ok(swirlTime(0.25) !== swirlTime(0.75));
});
