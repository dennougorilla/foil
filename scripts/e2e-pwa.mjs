// End-to-end check of the home-screen app (docs/pwa.md): node scripts/e2e-pwa.mjs (after npm run build).
// Serves a copy of dist under /foil/ like GitHub Pages, on a port of its own, and checks the manifest,
// the service worker, an offline launch, the Update chip, a picture shared to FOIL and the binder's
// request for persistent storage.
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'foil-pwa-'));
cpSync('dist', root, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.txt': 'text/plain' };
let online = true;
const server = createServer((req, res) => {
  // Offline: the connection drops, as with no network at all.
  if (!online) return req.socket.destroy();
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith('/foil/')) return res.writeHead(404).end();
  // GitHub Pages serves files only.
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  const file = join(root, path.slice('/foil/'.length) || 'index.html');
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://localhost:${server.address().port}/foil/`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|Failed to load resource|net::/.test(m.text()) && errors.push(m.text()));
// Counts the binder's requests for persistent storage.
await page.addInitScript(() => {
  window.__persist = 0;
  const s = navigator.storage;
  if (s?.persist) {
    const real = s.persist.bind(s);
    s.persist = () => (window.__persist++, real());
  }
});

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message.split('\n')[0]}`);
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
const appCaches = () => page.evaluate(async () => Promise.all((await caches.keys()).map(async (k) => [k, (await (await caches.open(k)).keys()).map((r) => r.url)])));
const ready = () => page.waitForSelector('#hand .hand-slot', { timeout: 20000 });

let navigations = 0;
page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);
await page.goto(`${URL_}?lang=en`);
await ready();

await step('the manifest is linked and its start, scope and share target sit under /foil/', async () => {
  const m = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href;
    const json = await (await fetch(href)).json();
    const at = (u) => new URL(u, href).href;
    const icons = await Promise.all(json.icons.map(async (i) => (await fetch(at(i.src))).status));
    return { start: at(json.start_url), scope: at(json.scope), share: at(json.share_target.action), display: json.display, icons };
  });
  expect(m.start === URL_ && m.scope === URL_, `start ${m.start}, scope ${m.scope}`);
  expect(m.share === `${URL_}share-target`, `share target ${m.share}`);
  expect(m.display === 'standalone', `display ${m.display}`);
  expect(m.icons.every((s) => s === 200), `icons answered ${m.icons.join()}`);
});

await step('the worker registers once the page is idle, keeps this version and takes the page over', async () => {
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
  const reg = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
  expect(reg === URL_, `scope ${reg}`);
  const kept = await appCaches();
  const app = kept.find(([k]) => k.startsWith('foil-app-'));
  expect(app, `no app cache in ${kept.map(([k]) => k).join()}`);
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const want = JSON.parse(sw.match(/^const OFFLINE = (.*);$/m)[1]).length;
  expect(app[1].length === want, `kept ${app[1].length} of ${want} files`);
  expect(app[1].includes(URL_), 'the page itself is not kept');
  expect(!app[1].some((u) => /\.wasm$|og\.png$|THIRD_PARTY|sw\.js$/.test(u)), 'kept a file that should be left out');
});

await step('the first install shows no Update chip and does not reload the page', async () => {
  await page.waitForTimeout(500);
  expect((await page.locator('#updateBtn').count()) === 0, 'an Update chip on the first install');
  expect(navigations === 1, `${navigations} navigations`);
});

await step('the fonts the page loaded before the worker ran are kept for offline', async () => {
  await page.waitForFunction(async () => (await (await caches.open('foil-fonts')).keys()).length > 0, null, { timeout: 15000 });
});

await step('offline, FOIL opens and loads what waits until it is used (Fine-tune, the binder)', async () => {
  online = false;
  try {
    await page.reload();
    await ready();
    await page.click('#adjustToggle');
    await page.waitForSelector('#panelTabs [role=tab]', { timeout: 10000 });
    await page.click('#panelTabs [role=tab][data-tab=light]');
    expect(await page.isVisible('#pane-light'), 'the Shine tab did not open');
    await page.click('#binderBtn');
    await page.waitForSelector('.bd.is-in', { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.bd', { state: 'detached', timeout: 10000 });
    expect(await page.evaluate(() => document.fonts.check('16px DotGothic16')), 'the interface font is missing offline');
  } finally {
    online = true;
  }
});

await step('Keep asks the browser once to keep the storage', async () => {
  await page.reload();
  await ready();
  const before = await page.evaluate(() => window.__persist);
  await page.click('#keepBtn');
  await page.waitForFunction(() => document.querySelector('.binder-count')?.textContent === '1', null, { timeout: 20000 });
  await page.waitForFunction((n) => window.__persist === n + 1, before, { timeout: 5000 });
});

await step('a picture shared to FOIL opens on the card, and the address loses ?shared', async () => {
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.method = 'post';
    form.enctype = 'multipart/form-data';
    form.action = './share-target';
    form.innerHTML = '<input type="file" name="image" />';
    document.body.appendChild(form);
  });
  await page.setInputFiles('form[action="./share-target"] input', { name: 'sunset-walk.png', mimeType: 'image/png', buffer: readFileSync('public/icon-512.png') });
  await Promise.all([page.waitForURL(`${URL_}?shared`, { timeout: 10000 }), page.evaluate(() => document.querySelector('form[action="./share-target"]').submit())]);
  await page.waitForFunction(() => document.querySelector('#nameInput').value === 'sunset-walk', null, { timeout: 15000 });
  expect(page.url() === URL_, `address ${page.url()}`);
  // The card turns over to the picture.
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('foil:v1')).sample === -1, null, { timeout: 10000 });
  const left = await page.evaluate(async () => (await (await caches.open('foil-shared')).keys()).length);
  expect(left === 0, 'the shared picture was not handed over once');
});

await step('a new version waits behind an Update chip; a reload keeps the old one; the chip switches', async () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  writeFileSync(join(root, 'sw.js'), sw.replace(/^const VERSION = '([0-9a-f]+)';$/m, "const VERSION = 'e2e2e2e2e2e2';"));
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  writeFileSync(join(root, 'index.html'), html.replace('<head>', '<head><meta name="e2e" content="v2" />'));
  const isNew = () => page.evaluate(() => !!document.querySelector('meta[name=e2e]'));
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForSelector('#updateBtn', { state: 'visible', timeout: 30000 });
  expect((await page.textContent('#updateBtn')).trim() === 'Update', `chip says ${await page.textContent('#updateBtn')}`);
  expect(!(await isNew()), 'the page switched before the chip was pressed');
  await page.reload();
  await ready();
  expect(!(await isNew()), 'a reload switched to the new version by itself');
  await page.waitForSelector('#updateBtn', { state: 'visible', timeout: 30000 });
  await Promise.all([page.waitForEvent('load', { timeout: 20000 }), page.click('#updateBtn')]);
  await ready();
  expect(await isNew(), 'the page is still the old version after the chip');
  const keys = (await appCaches()).map(([k]) => k).filter((k) => k.startsWith('foil-app-'));
  expect(keys.join() === 'foil-app-e2e2e2e2e2e2', `app caches: ${keys.join()}`);
  expect((await page.locator('#updateBtn').count()) === 0, 'the chip is still there on the new version');
});

await browser.close();
server.close();
rmSync(root, { recursive: true, force: true });
console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exitCode = 1;
