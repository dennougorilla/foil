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

/**
 * What waits until it is used (docs/performance.md): Fine-tune's tabs, the print menu, free placement,
 * the motion tray, the motions other than Sway, the backdrops other than the swirl, making a file (with the MP4 muxer),
 * reading an animated picture, pixel art's conversion, each language's texts, the service worker's registration (with
 * the Update chip and a picture shared to FOIL), and the deck builder's and the shop's rules.
 */
const ON_DEMAND = [
  'i18n/ja.ts',
  'i18n/en.ts',
  'adjust.ts',
  'tune/panel.ts',
  'tune/peek.ts',
  'tune/handle.ts',
  'tune/quickTray.ts',
  'letteringPanel.ts',
  'messagePanel.ts',
  'rangePanel.ts',
  'layersPanel.ts',
  'miniPreview.ts',
  'swatches.ts',
  'printPop.ts',
  'arrangeEdit.ts',
  'exporter.ts',
  'tune/moves.ts',
  'tune/motionIcons.ts',
  'anim/apngExport.ts',
  'anim/mp4Export.ts',
  'anim/png.ts',
  'gifDecode.ts',
  'anim/apngDecode.ts',
  'card/tcgFace.ts',
  'pwa.ts',
  'card/effect.ts',
  'pack/rules.ts',
  'gl/backdrops.ts',
  'dot/dot.ts',
  'dot/convert.ts',
];

test('the on-demand modules are not in the first load', () => {
  const first = closure(join(SRC, 'main.ts'));
  for (const f of ON_DEMAND) {
    assert.ok(existsSync(join(SRC, f)), `${f} does not exist`);
    assert.ok(!first.has(join(SRC, f)), `${f} is loaded up front`);
  }
});

test('each on-demand module is still loaded somewhere (a dynamic import reaches it)', () => {
  // Every dynamic import target in src, and what those modules import statically.
  const reached = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
          const base = normalize(join(dirname(p), m[1]));
          for (const f of [base, `${base}.ts`]) if (f.endsWith('.ts') && existsSync(f)) for (const c of closure(f)) reached.add(c);
        }
      }
    }
  };
  walk(SRC);
  for (const f of ON_DEMAND) assert.ok(reached.has(join(SRC, f)), `${f} is never loaded`);
});

test('the MP4 muxer is not in the first load', () => {
  for (const f of closure(join(SRC, 'main.ts'))) assert.ok(!/from\s+['"]mp4-muxer['"]/.test(readFileSync(f, 'utf8')), `${f.slice(SRC.length + 1)} imports mp4-muxer`);
});
