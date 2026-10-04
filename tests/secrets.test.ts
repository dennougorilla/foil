// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BETA_EDITIONS, mergeUnlocked, OPEN_EDITIONS, parseUnlocked, pickSecret, secretEditions } from '../src/secrets.ts';
import { EDITIONS } from '../src/editions.ts';

const SECRETS = ['gold', 'relief', 'kintsugi'] as const;
// The same list the app builds in src/sponsor.ts.
const SECRET_EDITIONS = secretEditions(EDITIONS.map((e) => e.id));

test('the hand opens with the five editions of the original game plus Prism and Glitch', () => {
  assert.deepEqual(OPEN_EDITIONS, ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch']);
});

test('open finishes come first in the hand, so unlocked secrets follow them', () => {
  assert.deepEqual(EDITIONS.slice(0, OPEN_EDITIONS.length).map((e) => e.id), [...OPEN_EDITIONS]);
});

test('Prism and Glitch are no longer drawn, and a saved unlock of them does no harm', () => {
  const secrets = SECRET_EDITIONS;
  assert.ok(!(secrets as string[]).includes('prism') && !(secrets as string[]).includes('glitch'));
  assert.deepEqual(parseUnlocked('["prism","glitch","opal"]', secrets), ['opal']);
  for (let i = 0; i < 200; i++) assert.ok(!['prism', 'glitch'].includes(pickSecret(secrets, [], Math.random) as string));
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
  const secrets = SECRET_EDITIONS;
  assert.ok(!(secrets as string[]).includes('eclipse'));
  assert.deepEqual(parseUnlocked('["eclipse","opal"]', secrets), ['opal']);
  for (let i = 0; i < 200; i++) assert.notEqual(pickSecret(secrets, [], Math.random), 'eclipse');
});

test('a beta finish (Lenticular) is neither open nor a secret, so no unlock can draw it', () => {
  assert.deepEqual(BETA_EDITIONS, ['lenticular']);
  assert.ok(EDITIONS.some((e) => e.id === 'lenticular'));
  assert.ok(!OPEN_EDITIONS.includes('lenticular'));
  assert.ok(!SECRET_EDITIONS.includes('lenticular'));
  assert.deepEqual(parseUnlocked('["lenticular","opal"]', SECRET_EDITIONS), ['opal']);
  for (let i = 0; i < 200; i++) assert.notEqual(pickSecret(SECRET_EDITIONS, [], Math.random), 'lenticular');
});

test('every finish past the open ones that is not beta is a secret, in hand order', () => {
  assert.deepEqual(secretEditions(['base', 'gold', 'lenticular', 'relief']), ['gold', 'relief']);
});

test('Lenticular draws with shader 76, which no other finish uses', () => {
  const shaders = EDITIONS.map((e) => e.shader);
  assert.equal(EDITIONS.find((e) => e.id === 'lenticular')?.shader, 76);
  assert.equal(new Set(shaders).size, shaders.length);
});
