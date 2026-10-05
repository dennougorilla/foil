// Run with `npm test` (Node's own test runner, which strips the types itself).
// The home-screen app (docs/pwa.md): the manifest, its icons, and which built files the service worker keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { offlineFiles } from '../src/swFiles.ts';

const ROOT = join(import.meta.dirname, '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const html = read('index.html');
// Where GitHub Pages serves it.
const AT = 'https://dennougorilla.github.io/foil/manifest.webmanifest';
const PAGES = 'https://dennougorilla.github.io/foil/';

test('the manifest is linked from the page by a relative URL', () => {
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/);
});

test('the app opens standalone at the GitHub Pages sub-path, which is also its scope', () => {
  assert.equal(manifest.name, 'FOIL');
  assert.equal(manifest.short_name, 'FOIL');
  assert.equal(manifest.display, 'standalone');
  assert.equal(new URL(manifest.start_url, AT).href, PAGES);
  assert.equal(new URL(manifest.scope, AT).href, PAGES);
  assert.equal(new URL(manifest.id, PAGES).href, PAGES);
});

test("the manifest's colors are the page's: its theme color and its ink", () => {
  assert.equal(manifest.theme_color, html.match(/<meta name="theme-color" content="([^"]+)"/)![1]);
  assert.equal(manifest.background_color, read('src/style.css').match(/--ink-900: (#[0-9a-f]+);/)![1]);
});

/** Width and height of a PNG, from its IHDR chunk. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(join(ROOT, 'public', file));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('icons come at 192 and 512 px, both rounded (any) and edge to edge (maskable), each the size it says', () => {
  for (const purpose of ['any', 'maskable']) {
    const sizes = manifest.icons.filter((i: { purpose: string }) => i.purpose === purpose).map((i: { sizes: string }) => i.sizes);
    assert.deepEqual(sizes.sort(), ['192x192', '512x512'], purpose);
  }
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    const [w, h] = pngSize(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
  }
});

test('pictures can be shared to it: a multipart POST inside the scope, taking what the Open button takes', () => {
  const t = manifest.share_target;
  assert.equal(t.method, 'POST');
  assert.equal(t.enctype, 'multipart/form-data');
  assert.ok(new URL(t.action, AT).href.startsWith(PAGES), 'the share target is outside the scope');
  assert.equal(new URL(t.action, AT).href, `${PAGES}share-target`);
  assert.equal(t.params.files.length, 1);
  assert.equal(t.params.files[0].name, 'image');
  const accept = html.match(/id="fileInput" accept="([^"]+)"/)![1].split(',');
  assert.deepEqual(t.params.files[0].accept, accept);
});

test('the service worker keeps the page and every script, style, icon and the manifest', () => {
  const built = [
    'index.html',
    'manifest.webmanifest',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-maskable-512.png',
    'assets/index-csuPsfgF.js',
    'assets/index-BA8IWQNC.css',
    'assets/adjust-DRtCJ-t9.js',
    'assets/gifWorker-Bh-VmWPK.js',
  ];
  assert.deepEqual(offlineFiles(built), ['./', ...built.slice(1).map((f) => `./${f}`)]);
});

test('it leaves out the link preview, the license notices, the depth runtime and itself', () => {
  const built = ['og.png', 'THIRD_PARTY_NOTICES.txt', 'assets/ort-wasm-simd-threaded-DcHrbrbl.wasm', 'assets/ort-wasm-simd-threaded.asyncify-D5D0fo7z.wasm', 'sw.js'];
  assert.deepEqual(offlineFiles(built), []);
});
