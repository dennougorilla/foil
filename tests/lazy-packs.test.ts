// Run with `npm test` (Node's own test runner, which strips the types itself).
// The page's first load must not carry any pack's shader code: walk the static imports from
// src/main.ts and make sure none of them reaches a module a pack module takes its GLSL from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');

/** Static (not dynamic, not type-only) imports and re-exports of a source file, resolved to .ts files. */
function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(/^(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm)) {
    const base = normalize(join(dirname(file), m[1]));
    for (const f of [base, `${base}.ts`, join(base, 'index.ts')]) if (f.endsWith('.ts') && existsSync(f)) out.push(f);
  }
  return out;
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    todo.push(...imports(f));
  }
  return seen;
}

test('the binder (its view, storage and styles) is not in the first load', () => {
  const first = closure(join(SRC, 'main.ts'));
  const dir = join(SRC, 'binder');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length >= 3);
  for (const f of files) assert.ok(!first.has(join(dir, f)), `binder/${f} is loaded up front`);
});

test('no pack shader code is in the first load', () => {
  const first = closure(join(SRC, 'main.ts'));
  const dir = join(SRC, 'gl', 'finishes');
  const packs = readdirSync(dir).filter((f) => !['registry.ts', 'types.ts'].includes(f));
  assert.ok(packs.length >= 5);
  for (const p of packs) {
    const file = join(dir, p);
    assert.ok(!first.has(file), `${p} is loaded up front`);
    for (const dep of imports(file)) {
      if (!/_GLSL\b/.test(readFileSync(dep, 'utf8'))) continue;
      assert.ok(!first.has(dep), `${p} takes GLSL from ${dep.slice(SRC.length + 1)}, which the first load also imports`);
    }
  }
});
