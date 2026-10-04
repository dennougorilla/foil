// Run with `npm test`. The second finish outside the Finish area: see docs/layering.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITIONS, layerable, outsideChoices, sanitizeOutside } from '../src/editions.ts';
import { owned, type Opened } from '../src/packs.ts';

const ALL: Opened = { opened: ['metal', 'light', 'nature', 'studio', 'supporter'], supporter: true };
const choices = (o: Opened, main: Parameters<typeof outsideChoices>[1]) => outsideChoices(owned(o), main);

test('a finish that needs the card to itself is never the outside finish', () => {
  const solo = EDITIONS.filter((e) => !layerable(e.id)).map((e) => e.id);
  assert.deepEqual(solo.sort(), ['base', 'blacklight', 'glow', 'lenticular3d', 'lenticularflip', 'shadowbox', 'snowglobe', 'warmth']);
});

test('the choices are the owned finishes, in hand-then-pack order, without the card’s own', () => {
  assert.deepEqual(choices({ opened: [], supporter: false }, 'holo'), ['foil', 'poly', 'negative', 'prism', 'glitch']);
  const all = choices(ALL, 'sakura');
  assert.ok(all.includes('kintsugi') && all.includes('gold') && all.includes('confetti'));
  assert.ok(!all.includes('sakura') && !all.includes('warmth') && !all.includes('base'));
  assert.equal(all.length, EDITIONS.filter((e) => layerable(e.id)).length - 1);
});

test('a sealed pack’s finish is not offered', () => {
  assert.ok(!choices({ opened: ['metal'], supporter: false }, 'holo').includes('kintsugi'));
  assert.ok(choices({ opened: ['metal'], supporter: false }, 'holo').includes('gold'));
});

test('a saved outside finish that no longer fits is dropped', () => {
  assert.equal(sanitizeOutside('kintsugi'), 'kintsugi');
  for (const v of [null, undefined, 'nope', 'warmth', 'base', 3, {}]) assert.equal(sanitizeOutside(v), null, String(v));
});
