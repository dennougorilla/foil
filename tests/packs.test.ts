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
  sealed,
  isOpened,
  mergePacks,
  openPacks,
  OPEN_EDITIONS,
  packOf,
  PACKS,
  parsePacks,
  shelf,
} from '../src/packs.ts';
import { placeAt, removeFromHand, tierOf } from '../src/pack/rules.ts';
import { EDITIONS } from '../src/editions.ts';

const NONE = { owned: [], supporter: false };
const METAL = ['platinum', 'gold', 'relief', 'chameleon', 'cosmoholo'];

test('the hand starts with the five editions of the original game plus Prism and Glitch', () => {
  assert.deepEqual([...OPEN_EDITIONS], ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch']);
});

test('every other finish is in exactly one pack, and no pack holds an open one', () => {
  for (const e of EDITIONS) {
    const holders = PACKS.filter((p) => p.finishes.includes(e.id));
    assert.equal(holders.length, OPEN_EDITIONS.includes(e.id) ? 0 : 1, e.id);
  }
});

test('five theme packs and the supporter pack of celebrations, showpiece last', () => {
  const packs = Object.fromEntries(PACKS.map((p) => [p.id, [...p.finishes]]));
  assert.deepEqual(packs, {
    metal: METAL,
    jewel: ['crystal', 'opal', 'raden', 'kintsugi'],
    light: ['galaxy', 'aurora', 'glow', 'blacklight', 'shallows'],
    nature: ['sakura', 'frost', 'stardust', 'rain', 'magma'],
    studio: ['halftone', 'warmth', 'stainedglass', 'lenticularflip', 'lenticular3d', 'shadowbox'],
    supporter: ['confetti', 'snowglobe', 'fireworks'],
  });
  assert.deepEqual(PACKS.filter((p) => p.supporter).map((p) => p.id), ['supporter']);
  // No theme pack is lopsided: four to six each.
  for (const p of PACKS.filter((p) => !p.supporter)) assert.ok(p.finishes.length >= 4 && p.finishes.length <= 6, p.id);
});

test("a pack's wrapper is drawn with a finish that is loaded with it", () => {
  for (const p of PACKS) assert.ok(OPEN_EDITIONS.includes(p.wrap) || p.finishes.includes(p.wrap), p.id);
});

test('packOf names the pack of a finish, none for the open ones', () => {
  assert.equal(packOf('relief')?.id, 'metal');
  assert.equal(packOf('kintsugi')?.id, 'jewel');
  assert.equal(packOf('snowglobe')?.id, 'supporter');
  assert.equal(packOf('holo'), undefined);
});

test('saved finishes keep only pack finishes, once each, in pack order; anything else counts as none', () => {
  assert.deepEqual(parsePacks(null), NONE);
  assert.deepEqual(parsePacks('not json'), NONE);
  assert.deepEqual(parsePacks('["gold"]'), NONE);
  assert.deepEqual(parsePacks('{"owned":"gold","supporter":1}'), NONE);
  assert.deepEqual(parsePacks('{"owned":["kintsugi","nope","gold","holo","gold",3],"supporter":true}'), {
    owned: ['gold', 'kintsugi'],
    supporter: true,
  });
});

test('a v0.13 save (opened pack ids) becomes every finish those packs held then, so nothing moved is lost', () => {
  // The old Supporter pack held Opal, Raden, Confetti, Fireworks and Kintsugi; the old Metal pack Crystal.
  const o = parsePacks('{"opened":["supporter","metal","nope"],"supporter":true}');
  assert.deepEqual(o, { owned: ['platinum', 'gold', 'relief', 'cosmoholo', 'crystal', 'opal', 'raden', 'kintsugi', 'confetti', 'fireworks'], supporter: true });
  // Jewel lacks nothing; Metal gained Chameleon (v0.15) and the new Supporter pack Snow Globe, so both are sealed again.
  assert.ok(isOpened(o, 'jewel'));
  assert.ok(!isOpened(o, 'metal') && !o.owned.includes('chameleon'));
  assert.ok(!isOpened(o, 'supporter') && !o.owned.includes('snowglobe'));
  // The old Nature pack held Snow Globe: with it, the new Supporter pack is whole too. Nature gained
  // Rainy Window and Marble (v0.15), so it is sealed again for them.
  const n = parsePacks('{"opened":["nature","supporter"],"supporter":true}');
  assert.ok(isOpened(n, 'supporter') && !isOpened(n, 'nature'));
  assert.ok(['sakura', 'frost', 'stardust', 'magma'].every((f) => n.owned.includes(f)));
  assert.ok(!isOpened(n, 'jewel') && !n.owned.includes('crystal'));
});

test('old support-link unlocks become the finishes of the packs that held them then', () => {
  assert.equal(fromSecrets(null), null);
  assert.equal(fromSecrets('not json'), null);
  assert.deepEqual(fromSecrets('["shallows"]'), { owned: ['galaxy', 'aurora', 'glow', 'blacklight', 'shallows'], supporter: true });
  assert.deepEqual(fromSecrets('["opal"]')?.owned, ['opal', 'raden', 'kintsugi', 'confetti', 'fireworks']);
  // A retired finish still means a support link was opened.
  assert.deepEqual(fromSecrets('["eclipse"]'), { owned: [], supporter: true });
  assert.deepEqual(fromSecrets('[]'), NONE);
});

test('two tabs opening at once both keep what they opened', () => {
  assert.deepEqual(mergePacks({ owned: ['halftone'], supporter: false }, { owned: ['gold'], supporter: true }), {
    owned: ['gold', 'halftone'],
    supporter: true,
  });
});

test('opening packs owns every finish in them; a pack is opened once all of it is owned', () => {
  const o = openPacks(NONE, ['metal', 'jewel']);
  assert.deepEqual(o.owned, [...METAL, 'crystal', 'opal', 'raden', 'kintsugi']);
  assert.ok(isOpened(o, 'metal') && !isOpened(o, 'light'));
  assert.ok(!isOpened({ owned: ['gold'], supporter: false }, 'metal'));
});

test('the shelf shows the supporter pack only after a support link was opened', () => {
  assert.deepEqual(shelf(NONE).map((p) => p.id), ['metal', 'jewel', 'light', 'nature', 'studio']);
  assert.deepEqual(shelf({ owned: [], supporter: true }).map((p) => p.id), ['metal', 'jewel', 'light', 'nature', 'studio', 'supporter']);
});

const M = { owned: [...METAL], supporter: false };

test('a saved hand keeps up to seven owned finishes, once each, with Base always in it', () => {
  assert.deepEqual(normalizeHand(null, M), [...OPEN_EDITIONS]);
  assert.deepEqual(normalizeHand(['relief', 'foil', 'magma', 'relief', 'nope'], M), ['base', 'relief', 'foil']);
  assert.deepEqual(normalizeHand(['holo', 'base', 'foil', 'poly', 'negative', 'prism', 'glitch', 'gold'], M), ['holo', 'base', 'foil', 'poly', 'negative', 'prism', 'glitch']);
  assert.deepEqual(normalizeHand([], M), ['base']);
});

test('the deck is every owned finish not in the hand; the builder lists everything owned, a pack sealed again by what is owned of it', () => {
  const hand = ['base', 'relief', 'holo', 'poly', 'negative', 'prism', 'glitch'] as const;
  assert.deepEqual(deckOf([...hand], M), ['foil', 'platinum', 'gold', 'chameleon', 'cosmoholo']);
  assert.deepEqual(deckOf([...OPEN_EDITIONS], NONE), []);
  assert.deepEqual(ownedGroups({ owned: ['gold', 'kintsugi'], supporter: false }), [
    { group: 'open', finishes: [...OPEN_EDITIONS] },
    { group: 'metal', finishes: ['gold'] },
    { group: 'jewel', finishes: ['kintsugi'] },
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
  assert.equal(sealed(M)[0]?.id, 'jewel');
  const themes = openPacks(NONE, ['metal', 'jewel', 'light', 'nature', 'studio']);
  assert.equal(sealed(themes)[0], undefined);
  assert.equal(sealed({ ...themes, supporter: true })[0]?.id, 'supporter');
});

test('open all takes the sealed packs on the shelf: the supporter pack only once it is there', () => {
  assert.deepEqual(sealed(NONE).map((p) => p.id), ['metal', 'jewel', 'light', 'nature', 'studio']);
  assert.deepEqual(sealed(openPacks(NONE, ['light', 'supporter'])).map((p) => p.id), ['metal', 'jewel', 'nature', 'studio']);
  assert.deepEqual(sealed({ ...M, supporter: true }).map((p) => p.id), ['jewel', 'light', 'nature', 'studio', 'supporter']);
  assert.deepEqual(sealed({ ...openPacks(NONE, PACKS.map((p) => p.id)), supporter: true }), []);
});

test('a finish can be used once it is open or owned', () => {
  assert.ok(available('holo', NONE));
  assert.ok(!available('relief', NONE));
  assert.ok(available('relief', M));
  assert.ok(!available('kintsugi', M));
  // Owned is owned, whether or not its pack is whole.
  assert.ok(available('kintsugi', { owned: ['kintsugi'], supporter: false }));
});

test('the showpiece gets the biggest entrance, the card before it the next', () => {
  const studio = PACKS.find((p) => p.id === 'studio')!;
  assert.deepEqual(studio.finishes.map((_, i) => tierOf(studio, i)), [1, 1, 1, 1, 2, 3]);
});
