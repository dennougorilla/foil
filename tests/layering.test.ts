// Run with `npm test`. Two layers of finish, each with its own area: see docs/layering.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS, layerable, layerChoices, sanitizeLayer2 } from '../src/editions.ts';
import { openPacks, owned, PACKS, type Owned } from '../src/packs.ts';

const ALL: Owned = { ...openPacks({ owned: [], supporter: false }, PACKS.map((p) => p.id)), supporter: true };
const choices = (o: Owned, main: Parameters<typeof layerChoices>[1]) => layerChoices(owned(o), main);

test('a finish that needs the card to itself is never layer 2', () => {
  const solo = EDITIONS.filter((e) => !layerable(e.id)).map((e) => e.id);
  assert.deepEqual(solo.sort(), ['base', 'blacklight', 'glow', 'lenticular3d', 'lenticularflip', 'rain', 'shadowbox', 'snowglobe', 'warmth']);
});

test('layer 2 offers the owned finishes, in hand-then-pack order, without the card’s own', () => {
  assert.deepEqual(choices({ owned: [], supporter: false }, 'holo'), ['foil', 'poly', 'negative', 'prism', 'glitch']);
  const all = choices(ALL, 'sakura');
  assert.ok(all.includes('kintsugi') && all.includes('gold') && all.includes('confetti'));
  assert.ok(!all.includes('sakura') && !all.includes('warmth') && !all.includes('base'));
  assert.equal(all.length, EDITIONS.filter((e) => layerable(e.id)).length - 1);
});

test('a sealed pack’s finish is not offered', () => {
  assert.ok(!choices(openPacks({ owned: [], supporter: false }, ['metal']), 'holo').includes('kintsugi'));
  assert.ok(choices(openPacks({ owned: [], supporter: false }, ['metal']), 'holo').includes('gold'));
});

test('a saved layer 2 keeps what fits and drops what does not', () => {
  assert.deepEqual(sanitizeLayer2({ edition: 'kintsugi', region: 'frame', lo: 0.6, hi: 1, invert: false, blend: 'over', strength: 0.5 }), {
    edition: 'kintsugi', region: 'frame', lo: 0.6, hi: 1, invert: false, blend: 'over', strength: 0.5,
  });
  // Unknown parts fall back: the whole card, every tone, only the light added, full strength.
  assert.deepEqual(sanitizeLayer2({ edition: 'gold', region: 'moon', lo: 0.9, hi: 0.2, blend: 'mix', strength: 7 }), {
    edition: 'gold', region: 'all', lo: 0, hi: 1, invert: false, blend: 'light', strength: 1,
  });
  for (const v of [null, undefined, 'gold', { edition: 'warmth' }, { edition: 'base' }, { edition: 'nope' }]) assert.equal(sanitizeLayer2(v), null, JSON.stringify(v));
});
