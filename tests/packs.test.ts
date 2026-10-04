// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  available,
  fromSecrets,
  deckOf,
  firstSealed,
  handOf,
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
    metal: ['relief', 'gold', 'crystal'],
    light: ['galaxy', 'aurora', 'shallows'],
    nature: ['sakura', 'frost', 'magma'],
    studio: ['halftone', 'warmth', 'shadowbox'],
    supporter: ['opal', 'raden', 'kintsugi'],
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

test('the hand is the seven, plus the drawn card when its pack is opened', () => {
  const opened = { opened: ['metal' as const], supporter: false };
  assert.deepEqual(handOf(null, opened), [...OPEN_EDITIONS]);
  assert.deepEqual(handOf('relief', opened), [...OPEN_EDITIONS, 'relief']);
  assert.deepEqual(handOf('magma', opened), [...OPEN_EDITIONS]);
  assert.deepEqual(handOf('holo', opened), [...OPEN_EDITIONS]);
});

test('the deck holds every opened pack, in pack order', () => {
  assert.deepEqual(deckOf({ opened: ['studio', 'metal'], supporter: false }).map((p) => p.id), ['metal', 'studio']);
  assert.equal(deckOf({ opened: [], supporter: false }).length, 0);
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
  assert.deepEqual(metal.finishes.map((_, i) => tierOf(metal, i)), [1, 2, 3]);
});
