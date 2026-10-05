// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  available,
  fromSecrets,
  deckOf,
  addToHand,
  normalizeHand,
  ownedGroups,
  placeAt,
  removeFromHand,
  firstSealed,
  mergePacks,
  OPEN_EDITIONS,
  packOf,
  PACKS,
  parsePacks,
  shelf,
  tierOf,
} from '../src/packs.ts';
import { EDITIONS } from '../src/editions.ts';

const NONE = { opened: [], supporter: false };

test('the hand starts with the five editions of the original game plus Prism and Glitch', () => {
  assert.deepEqual([...OPEN_EDITIONS], ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch']);
});

test('every other finish is in exactly one pack, and no pack holds an open one', () => {
  for (const e of EDITIONS) {
    const holders = PACKS.filter((p) => p.finishes.includes(e.id));
    assert.equal(holders.length, OPEN_EDITIONS.includes(e.id) ? 0 : 1, e.id);
  }
});

test('the four theme packs and the supporter pack, showpiece last', () => {
  const packs = Object.fromEntries(PACKS.map((p) => [p.id, [...p.finishes]]));
  assert.deepEqual(packs, {
    metal: ['relief', 'gold', 'platinum', 'cosmoholo', 'crystal'],
    light: ['galaxy', 'aurora', 'glow', 'blacklight', 'kaleidoscope', 'shallows'],
    nature: ['sakura', 'frost', 'stardust', 'snowglobe', 'magma'],
    studio: ['halftone', 'warmth', 'stainedglass', 'lenticularflip', 'lenticular3d', 'shadowbox'],
    supporter: ['opal', 'raden', 'confetti', 'fireworks', 'kintsugi'],
  });
  assert.deepEqual(PACKS.filter((p) => p.supporter).map((p) => p.id), ['supporter']);
});

test("a pack's wrapper is drawn with a finish that is loaded with it", () => {
  for (const p of PACKS) assert.ok(OPEN_EDITIONS.includes(p.wrap) || p.finishes.includes(p.wrap), p.id);
});

test('packOf names the pack of a finish, none for the open ones', () => {
  assert.equal(packOf('relief')?.id, 'metal');
  assert.equal(packOf('kintsugi')?.id, 'supporter');
  assert.equal(packOf('holo'), undefined);
});

test('saved packs keep only known ids, once each; anything else counts as none', () => {
  assert.deepEqual(parsePacks(null), NONE);
  assert.deepEqual(parsePacks('not json'), NONE);
  assert.deepEqual(parsePacks('["metal"]'), NONE);
  assert.deepEqual(parsePacks('{"opened":"metal","supporter":1}'), NONE);
  assert.deepEqual(parsePacks('{"opened":["studio","nope","metal","studio",3],"supporter":true}'), {
    opened: ['metal', 'studio'],
    supporter: true,
  });
});

test('old support-link unlocks become opened packs, and any unlock shows the supporter pack', () => {
  assert.equal(fromSecrets(null), null);
  assert.equal(fromSecrets('not json'), null);
  assert.deepEqual(fromSecrets('["gold","shallows"]'), { opened: ['metal', 'light'], supporter: true });
  assert.deepEqual(fromSecrets('["opal"]'), { opened: ['supporter'], supporter: true });
  // A retired finish still means a support link was opened.
  assert.deepEqual(fromSecrets('["eclipse"]'), { opened: [], supporter: true });
  assert.deepEqual(fromSecrets('[]'), NONE);
});

test('two tabs opening at once both keep what they opened', () => {
  assert.deepEqual(mergePacks({ opened: ['studio'], supporter: false }, { opened: ['metal'], supporter: true }), {
    opened: ['metal', 'studio'],
    supporter: true,
  });
});

test('the shelf shows the supporter pack only after a support link was opened', () => {
  assert.deepEqual(shelf(NONE).map((p) => p.id), ['metal', 'light', 'nature', 'studio']);
  assert.deepEqual(shelf({ opened: [], supporter: true }).map((p) => p.id), ['metal', 'light', 'nature', 'studio', 'supporter']);
});

const M = { opened: ['metal' as const], supporter: false };

test('a saved hand keeps up to seven owned finishes, once each, with Base always in it', () => {
  assert.deepEqual(normalizeHand(null, M), [...OPEN_EDITIONS]);
  assert.deepEqual(normalizeHand(['relief', 'foil', 'magma', 'relief', 'nope'], M), ['base', 'relief', 'foil']);
  assert.deepEqual(normalizeHand(['holo', 'base', 'foil', 'poly', 'negative', 'prism', 'glitch', 'gold'], M), ['holo', 'base', 'foil', 'poly', 'negative', 'prism', 'glitch']);
  assert.deepEqual(normalizeHand([], M), ['base']);
});

test('the deck is every owned finish not in the hand; the builder lists everything owned', () => {
  const hand = ['base', 'relief', 'holo', 'poly', 'negative', 'prism', 'glitch'] as const;
  assert.deepEqual(deckOf([...hand], M), [
    { group: 'open', finishes: ['foil'] },
    { group: 'metal', finishes: ['gold', 'platinum', 'cosmoholo', 'crystal'] },
  ]);
  assert.deepEqual(deckOf([...OPEN_EDITIONS], { opened: [], supporter: false }), []);
  assert.deepEqual(ownedGroups(M), [
    { group: 'open', finishes: [...OPEN_EDITIONS] },
    { group: 'metal', finishes: ['relief', 'gold', 'platinum', 'cosmoholo', 'crystal'] },
  ]);
});

test('adding fills the given slot, else the end; a full hand gives up its last card that is not Base', () => {
  const six = ['base', 'foil', 'holo', 'poly', 'negative', 'prism'] as const;
  assert.deepEqual(addToHand([...six], 'gold'), [...six, 'gold']);
  assert.deepEqual(addToHand([...six], 'gold', 2), ['base', 'foil', 'gold', 'holo', 'poly', 'negative', 'prism']);
  assert.deepEqual(addToHand([...OPEN_EDITIONS], 'gold'), ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'gold']);
  assert.deepEqual(addToHand(['gold', 'foil', 'holo', 'poly', 'negative', 'prism', 'base'], 'relief'), ['gold', 'foil', 'holo', 'poly', 'negative', 'relief', 'base']);
  assert.deepEqual(addToHand([...OPEN_EDITIONS], 'holo'), [...OPEN_EDITIONS]);
});

test('placing onto a slot swaps exactly that card, never Base; taking out leaves Base', () => {
  assert.deepEqual(placeAt([...OPEN_EDITIONS], 'gold', 2), ['base', 'foil', 'gold', 'poly', 'negative', 'prism', 'glitch']);
  assert.deepEqual(placeAt([...OPEN_EDITIONS], 'gold', 0), [...OPEN_EDITIONS]);
  assert.deepEqual(placeAt(['base', 'foil'], 'gold', 5), ['base', 'foil', 'gold']);
  // A card already in the hand trades places with the one in that slot; nothing is lost.
  assert.deepEqual(placeAt(['base', 'foil', 'holo', 'poly'], 'foil', 2), ['base', 'holo', 'foil', 'poly']);
  assert.deepEqual(placeAt(['base', 'foil', 'holo', 'poly'], 'foil', 0), ['base', 'foil', 'holo', 'poly']);
  assert.deepEqual(removeFromHand([...OPEN_EDITIONS], 'holo'), ['base', 'foil', 'poly', 'negative', 'prism', 'glitch']);
  assert.deepEqual(removeFromHand(['base'], 'base'), ['base']);
});

test('the first sealed pack on the shelf is the one the shop offers first', () => {
  assert.equal(firstSealed({ opened: ['metal'], supporter: false })?.id, 'light');
  assert.equal(firstSealed({ opened: ['metal', 'light', 'nature', 'studio'], supporter: false }), undefined);
  assert.equal(firstSealed({ opened: ['metal', 'light', 'nature', 'studio'], supporter: true })?.id, 'supporter');
});

test('a finish can be used once it is open or its pack is opened', () => {
  const opened = { opened: ['metal' as const], supporter: false };
  assert.ok(available('holo', NONE));
  assert.ok(!available('relief', NONE));
  assert.ok(available('relief', opened));
  assert.ok(!available('kintsugi', opened));
});

test('the showpiece gets the biggest entrance, the card before it the next', () => {
  const metal = PACKS[0];
  assert.deepEqual(metal.finishes.map((_, i) => tierOf(metal, i)), [1, 1, 1, 2, 3]);
});
