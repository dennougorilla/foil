// Run with `npm test`. The provisional Lab pack (review-v015): the finishes not yet released in one
// program, so their shader numbers, uniforms and texture units must not collide with anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EDITIONS } from '../src/editions.ts';
import { packById } from '../src/packs.ts';

const SRC = join(import.meta.dirname, '..', 'src');
const LAB = readFileSync(join(SRC, 'gl', 'finishes', 'lab.ts'), 'utf8');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const uniforms = (src: string) => [...src.matchAll(/\buniform\s+\w+\s+(\w+)/g)].map((m) => m[1]);

test('every finish has a shader number of its own', () => {
  const seen = new Map<number, string>();
  for (const e of EDITIONS) {
    assert.ok(!seen.has(e.shader), `${e.id} and ${seen.get(e.shader)} share shader ${e.shader}`);
    seen.set(e.shader, e.id);
  }
});

test('the Lab module dispatches every finish of the Lab pack, and nothing else', () => {
  const lab = packById('lab').finishes.map((id) => EDITIONS.find((e) => e.id === id)!.shader);
  const dispatched = [...LAB.matchAll(/e == (\d+)\) col =/g)].map((m) => +m[1]);
  assert.deepEqual([...dispatched].sort((a, b) => a - b), [...lab].sort((a, b) => a - b));
});

test("the Lab finishes' own uniforms are declared nowhere else", () => {
  // The GLSL modules the Lab module splices in, by their import path.
  const files = [...LAB.matchAll(/from '(\.\.\/[^']+)'/g)].map((m) => join(SRC, 'gl', 'finishes', `${m[1]}.ts`));
  const shared = new Set(uniforms(readFileSync(join(SRC, 'touch', 'glsl.ts'), 'utf8')));
  const all = walk(SRC).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    if (f.endsWith(join('touch', 'glsl.ts'))) continue;
    for (const u of uniforms(readFileSync(f, 'utf8'))) {
      if (shared.has(u)) continue;
      const where = all.filter((g) => g !== f && uniforms(readFileSync(g, 'utf8')).includes(u));
      assert.deepEqual(where, [], `${u} (${f}) is declared elsewhere too`);
    }
  }
});

test('the Lab layers bind their textures to units of their own', () => {
  const units = [...LAB.matchAll(/\.bind\(p, (\d+),/g)].map((m) => +m[1]);
  assert.equal(new Set(units).size, units.length, `units ${units}`);
  // 0–4 and 7–9 are the core's (renderers.ts), 5 is Relief's.
  for (const u of units) assert.ok(![0, 1, 2, 3, 4, 5, 7, 8, 9].includes(u), `unit ${u}`);
});
