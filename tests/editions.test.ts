// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, EDITIONS } from '../src/editions.ts';

test('every finish draws with its own shader', () => {
  const shaders = EDITIONS.map((e) => e.shader);
  assert.equal(new Set(shaders).size, shaders.length);
});

test('two frames are made for celebration cards, after the four classic ones', () => {
  assert.deepEqual(FRAMES, ['paper', 'ink', 'gilt', 'rarity', 'rim', 'ribbon']);
});

test('Engraving draws with shader 106 in the Lab pack (provisional)', async () => {
  const { packOf } = await import('../src/packs.ts');
  assert.equal(EDITIONS.find((x) => x.id === 'engraving')?.shader, 106);
  assert.equal(packOf('engraving')?.id, 'lab');
});
