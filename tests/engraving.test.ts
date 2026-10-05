// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGRAVING_GLSL } from '../src/gl/engraving.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

const constant = (name: string) => {
  const m = ENGRAVING_GLSL.match(new RegExp(`const float ${name} = ([0-9.]+);`));
  assert.ok(m, `no ${name}`);
  return Number(m[1]);
};
const vec2 = (name: string) => {
  const m = ENGRAVING_GLSL.match(new RegExp(`const vec2 ${name} = vec2\\(([-0-9.]+), ([-0-9.]+)\\);`));
  assert.ok(m, `no ${name}`);
  return [Number(m[1]), Number(m[2])];
};

test('tone spans a wide range: bare plate in the lights, near-merged swells in the shadows, never a solid bar', () => {
  assert.ok(constant('EN_FULL') >= 0.75 && constant('EN_FULL') < 0.9);
  assert.ok(constant('EN_HAIR') < 0.1);
  assert.ok(constant('EN_GAMMA') > 1);
  assert.ok(constant('EN_CROSS') < constant('EN_FULL'));
});

test('lines are spaced for the card, never closer than 5 px on screen', () => {
  assert.ok(constant('EN_LINES') >= 55 && constant('EN_LINES') <= 80);
  assert.ok(constant('EN_MINPX') >= 5);
});

test('the cross-hatch covers the darkest quarter of tones, at 45-60 degrees', () => {
  assert.ok(constant('EN_XDARK') <= 0.75 && constant('EN_XFULL') > constant('EN_XDARK'));
  const deg = (constant('EN_XANG') * 180) / Math.PI;
  assert.ok(deg >= 45 && deg <= 60, `${deg}`);
});

test('the lines are straight hatching bent only a little, so they never close into rings', () => {
  // The push is at most a few spacings across the whole card.
  assert.ok((constant('EN_BEND') + constant('EN_BEND_MID')) * constant('EN_LINES') <= 4);
});

test('the ink is a dark brown-black, not black', () => {
  const m = ENGRAVING_GLSL.match(/const vec3 EN_INK = vec3\(([0-9.]+), ([0-9.]+), ([0-9.]+)\);/);
  assert.ok(m);
  const [r, g, b] = m.slice(1).map(Number);
  assert.ok(r > 0.06 && r < 0.2 && r > g && g > b, `${r} ${g} ${b}`);
});

test('the name is set in a serif on an engraved card, in the pixel face otherwise', () => {
  assert.match(read('main.ts'), /serifName: s\.edition === 'engraving'/);
  const face = read('card/face.ts');
  assert.match(face, /spec\.serifName \? messageFont\('serif', size\)/);
  // Both name painters (the classic plate and a freely placed name) and the trading card's go through it.
  assert.equal(face.match(/nameFont\(spec, s\)/g)?.length, 2);
  assert.match(read('card/tcgFace.ts'), /nameFont\(spec, s, true\)/);
  assert.doesNotMatch(face, /fitName[^\n]*\n[^\n]*DotGothic16/);
});

test('sky and ground are cut at different base angles', () => {
  const [sx, sy] = vec2('EN_SKY');
  const [gx, gy] = vec2('EN_GROUND');
  assert.ok(Math.abs(Math.atan2(sx, sy) - Math.atan2(gx, gy)) > 0.3);
});

test('the strip light is a narrow band: its core under 4% of the card across', () => {
  assert.ok(2 * constant('EN_CORE') <= 0.04);
  assert.ok(constant('EN_HALO') < 0.05);
});

test('it never reads the clock, so it holds still with reduced motion and exports loop', () => {
  assert.doesNotMatch(ENGRAVING_GLSL, /uTime/);
});

test('every name it adds is its own', () => {
  for (const m of ENGRAVING_GLSL.matchAll(/^(?:const \w+|float|vec2|vec3) (\w+)/gm)) {
    assert.match(m[1], /^(en|EN_|engraving$)/, m[1]);
  }
});
