// Run with `npm test`. Each pack's finishes are compiled into one program with the core (src/gl/finishes/),
// so inside a pack module shader numbers, texture units and the finishes' own uniforms must not collide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EDITIONS } from '../src/editions.ts';
import { PACKS } from '../src/packs.ts';

const SRC = join(import.meta.dirname, '..', 'src');
const moduleOf = (id: string) => readFileSync(join(SRC, 'gl', 'finishes', `${id}.ts`), 'utf8');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const uniforms = (src: string) => [...src.matchAll(/\buniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);
/** The units the core card program binds (renderers.ts): face, mask, back, lettering, area, layers, plate back, flip picture. */
const CORE_UNITS = [0, 1, 2, 3, 4, 7, 8, 9];

test('every finish has a shader number of its own', () => {
  const seen = new Map<number, string>();
  for (const e of EDITIONS) {
    assert.ok(!seen.has(e.shader), `${e.id} and ${seen.get(e.shader)} share shader ${e.shader}`);
    seen.set(e.shader, e.id);
  }
});

test("each pack module dispatches exactly its pack's finishes", () => {
  for (const p of PACKS) {
    const want = p.finishes.map((id) => EDITIONS.find((e) => e.id === id)!.shader).sort((a, b) => a - b);
    const got = [...moduleOf(p.id).matchAll(/e == (\d+)\) \{? *(?:\w+ = [^;]+; )?col =/g)].map((m) => +m[1]).sort((a, b) => a - b);
    assert.deepEqual(got, want, p.id);
  }
});

test("a pack module's layers bind their textures to units of their own, clear of the core's", () => {
  for (const p of PACKS) {
    const units = [...moduleOf(p.id).matchAll(/\.bind\(p, (\d+),/g)].map((m) => +m[1]);
    assert.equal(new Set(units).size, units.length, `${p.id}: units ${units}`);
    for (const u of units) assert.ok(!CORE_UNITS.includes(u), `${p.id}: unit ${u} is the core's`);
  }
});

test("the new finishes' own uniforms are declared nowhere else", () => {
  const all = walk(SRC).filter((f) => f.endsWith('.ts'));
  for (const file of ['chameleon.ts', 'rain.ts', 'marble.ts'].map((n) => join(SRC, 'gl', n))) {
    for (const u of uniforms(readFileSync(file, 'utf8'))) {
      const where = all.filter((g) => g !== file && uniforms(readFileSync(g, 'utf8')).includes(u));
      assert.deepEqual(where, [], `${u} (${file}) is declared elsewhere too`);
    }
  }
});

test('Rainy Window and Marble share the Nature program, each on its own sampler', () => {
  const nature = moduleOf('nature');
  assert.match(nature, /new HeatLayer\(gl\)[\s\S]*bind\(p, 6, d\.heat\)/);
  assert.match(nature, /new HeatLayer\(gl, 'uMarbleFlow'\)/);
  assert.equal((nature.match(/\$\{TOUCH_GLSL\}/g) ?? []).length, 1);
});
