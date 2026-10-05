// Run with `npm test` (Node's own test runner, which strips the types itself).
// The CRT filter (docs/features.md, Language and accessibility; docs/performance.md): off by default for
// everyone, a screen filter of its own layers, gone on slow devices and still under reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const state = read('src/state.ts');
const html = read('index.html');
const css = read('src/style.css');

test('the CRT filter starts off, under a new saved name so an old "on" is not carried over', () => {
  assert.match(state, /\n  crtFilter: false,\n/);
  assert.doesNotMatch(state, /'crt'/, 'the old saved key is no longer read or written');
  assert.match(state, /\n  'crtFilter',\n/);
  assert.match(html, /id="crtBtn" type="button" aria-pressed="false"/);
  assert.match(html, /class="crt is-off" id="crt"/);
});

test('the filter is its own layers over the page, each blending with the page itself', () => {
  for (const layer of ['crt-glow', 'crt-mask', 'crt-noise', 'crt-glass']) assert.ok(html.includes(`class="${layer}"`), layer);
  // A wrapper that made a stacking context of its own would keep the layers from blending with the page.
  assert.match(css, /\.crt \{\n  display: contents;/);
});

test('slow devices drop it, level 1 drops the glow, reduced motion stills it', () => {
  assert.match(css, /\[data-no-crt\] \.crt \{\n  display: none;/);
  assert.match(css, /\[data-still\] \.crt-glow \{\n  display: none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.crt-noise \{\n    display: none;/);
});
