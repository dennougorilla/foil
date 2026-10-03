// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeUnlocked, OPEN_EDITIONS, parseUnlocked, pickSecret } from '../src/secrets.ts';
import { EDITIONS } from '../src/editions.ts';

const SECRETS = ['gold', 'relief', 'kintsugi'] as const;

test('the hand opens with the five editions of the original game', () => {
  assert.deepEqual(OPEN_EDITIONS, ['base', 'foil', 'holo', 'poly', 'negative']);
});

test('saved unlocks keep only known secrets, once each', () => {
  assert.deepEqual(parseUnlocked(null, SECRETS), []);
  assert.deepEqual(parseUnlocked('not json', SECRETS), []);
  assert.deepEqual(parseUnlocked('"2026-10-03T00:00:00Z"', SECRETS), []);
  assert.deepEqual(parseUnlocked('["relief","foil","nope","relief",3]', SECRETS), ['relief']);
});

test('each unlock draws one secret that is still locked, at random', () => {
  assert.equal(pickSecret(SECRETS, [], () => 0), 'gold');
  assert.equal(pickSecret(SECRETS, [], () => 0.999), 'kintsugi');
  assert.equal(pickSecret(SECRETS, ['gold', 'kintsugi'], () => 0.5), 'relief');
  for (let i = 0; i < 50; i++) assert.notEqual(pickSecret(SECRETS, ['relief'], Math.random), 'relief');
});

test('once every secret is out, nothing more is drawn', () => {
  assert.equal(pickSecret(SECRETS, ['gold', 'relief', 'kintsugi'], () => 0.5), null);
});

test('two tabs unlocking at once both keep what they drew', () => {
  assert.deepEqual(mergeUnlocked(SECRETS, ['kintsugi'], ['gold']), ['gold', 'kintsugi']);
  assert.deepEqual(mergeUnlocked(SECRETS, ['gold', 'relief'], ['relief']), ['gold', 'relief']);
});

test('a retired secret (Eclipse) saved by an earlier version is ignored and never drawn', () => {
  // The same list the app builds in src/sponsor.ts.
  const secrets = EDITIONS.map((e) => e.id).filter((id) => !OPEN_EDITIONS.includes(id));
  assert.ok(!(secrets as string[]).includes('eclipse'));
  assert.deepEqual(parseUnlocked('["eclipse","opal"]', secrets), ['opal']);
  for (let i = 0; i < 200; i++) assert.notEqual(pickSecret(secrets, [], Math.random), 'eclipse');
});
