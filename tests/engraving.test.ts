// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGRAVING_GLSL } from '../src/gl/engraving.ts';

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

test('a line never swells into a solid bar: at most about 55% of a spacing, the cross-hatch thinner', () => {
  assert.ok(constant('EN_FULL') <= 0.56);
  assert.ok(constant('EN_CROSS') < constant('EN_FULL') / 2);
  assert.ok(constant('EN_HAIR') < 0.1);
});

test('lines are spaced for the card, never closer than 5 px on screen', () => {
  assert.ok(constant('EN_LINES') >= 55 && constant('EN_LINES') <= 80);
  assert.ok(constant('EN_MINPX') >= 5);
});

test('the cross-hatch comes in only in the darkest parts, at a shallow 25-35 degrees', () => {
  assert.ok(constant('EN_XTONE') <= 0.35);
  const deg = (constant('EN_XANG') * 180) / Math.PI;
  assert.ok(deg >= 25 && deg <= 35, `${deg}`);
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
