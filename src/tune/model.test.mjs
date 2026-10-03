import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedKeys, sanitizeTune, TUNE_DEFAULTS, tuneGl } from './model.ts';

test('Relief is gold unless silver is chosen', () => {
  assert.equal(TUNE_DEFAULTS.metal, 'gold');
  assert.equal(sanitizeTune({ metal: 'silver' }).metal, 'silver');
  assert.equal(sanitizeTune({ metal: 'brass' }).metal, 'gold');
  assert.equal(sanitizeTune({}).metal, 'gold');
});

test('silver counts as a change and reaches the shader', () => {
  const t = { ...TUNE_DEFAULTS, metal: 'silver' };
  assert.deepEqual(changedKeys(t), ['metal']);
  assert.equal(tuneGl(t).metal, 1);
  assert.equal(tuneGl(TUNE_DEFAULTS).metal, 0);
});
