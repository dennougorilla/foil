// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGRAVING_GLSL } from '../src/gl/engraving.ts';

const constant = (name: string) => {
  const m = ENGRAVING_GLSL.match(new RegExp(`const float ${name} = ([0-9.]+);`));
  assert.ok(m, `no ${name}`);
  return Number(m[1]);
};

test('a line never swells into a solid bar: at most about 55% of a spacing, the cross-hatch thinner', () => {
  assert.ok(constant('EN_FULL') <= 0.56);
  assert.ok(constant('EN_CROSS') < constant('EN_FULL'));
  assert.ok(constant('EN_HAIR') < 0.1);
});

test('the cross-hatch comes in only where the picture is darker than 0.6', () => {
  assert.match(ENGRAVING_GLSL, /EN_CROSS \* pow\(smoothstep\(0\.6, 1\.0, dark\)/);
});

test('sky and ground are cut at different base angles', () => {
  const dir = (name: string) => {
    const m = ENGRAVING_GLSL.match(new RegExp(`vec2 ${name} = normalize\\(vec2\\(([-0-9.]+), ([-0-9.]+)\\)\\)`));
    assert.ok(m, `no ${name}`);
    return Math.atan2(Number(m[1]), Number(m[2]));
  };
  assert.ok(Math.abs(dir('dS') - dir('dG')) > 0.3);
});

test('it never reads the clock, so it holds still with reduced motion and exports loop', () => {
  assert.doesNotMatch(ENGRAVING_GLSL, /uTime/);
});

test('every name it adds is its own', () => {
  for (const m of ENGRAVING_GLSL.matchAll(/^(?:const \w+|float|vec2|vec3) (\w+)/gm)) {
    assert.match(m[1], /^(en|EN_|engraving$)/, m[1]);
  }
});
