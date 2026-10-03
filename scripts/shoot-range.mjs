// Screenshots for the Foil area and custom colours: node scripts/shoot-range.mjs [outDir] [filter]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5173/';
const out = process.argv[2] ?? 'shots-range';
const filter = process.argv[3] ?? '';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const saved = {
  frameSwatches: ['#2f8f83', '#e86a92'],
  stageSwatches: ['#6a3fd0', '#d8a020'],
};

const shots = [
  { name: 'panel-ja', w: 1440, h: 900, lang: 'ja', act: 'scrollPanel' },
  { name: 'panel-en', w: 1440, h: 900, lang: 'en', act: 'scrollPanel' },
  { name: 'colors-ja', w: 1440, h: 900, lang: 'ja', state: { ...saved, frameColor: '#2f8f83', stageColor: '#6a3fd0' } },
  { name: 'colors-hover', w: 1440, h: 900, lang: 'en', state: { ...saved, frameColor: '#e86a92' }, act: 'hoverSwatch' },
  { name: 'range-art-hi', w: 1440, h: 900, lang: 'ja', state: { rangeRegion: 'art', rangeLo: 0.6, rangeHi: 1 }, act: 'hoverRange' },
  { name: 'range-text', w: 1440, h: 900, lang: 'en', state: { rangeRegion: 'text', rangeShow: true }, act: 'scrollPanel' },
  { name: 'range-frame-inv', w: 1440, h: 900, lang: 'ja', state: { rangeRegion: 'frame', rangeInvert: true, rangeShow: true }, act: 'scrollPanel' },
  { name: 'range-none', w: 1440, h: 900, lang: 'ja', state: { rangeRegion: 'art', rangeLo: 0.95, rangeHi: 1 }, act: 'focusTone' },
  { name: 'paint-ja', w: 1440, h: 900, lang: 'ja', act: 'paint' },
  { name: 'paint-en', w: 1440, h: 900, lang: 'en', act: 'paint' },
  { name: 'paint-erase', w: 1440, h: 900, lang: 'ja', act: 'paintErase' },
  { name: 'paint-reduced', w: 1440, h: 900, lang: 'ja', act: 'paint', reduced: true },
  { name: 'export-range', w: 1440, h: 900, lang: 'ja', state: { rangeRegion: 'art', rangeLo: 0, rangeHi: 0.4 }, act: 'exportPng' },
  { name: 'tablet-1024', w: 1024, h: 768, lang: 'ja', state: saved, act: 'scrollPanel' },
  { name: 'tablet-paint', w: 1024, h: 768, lang: 'en', act: 'paint' },
  { name: 'scale-125', w: 1152, h: 720, lang: 'ja', dpr: 1.25, state: saved, act: 'scrollPanel' },
  { name: 'mobile-ja', w: 390, h: 844, lang: 'ja', full: true, dpr: 2, state: saved },
  { name: 'mobile-en', w: 390, h: 844, lang: 'en', full: true, dpr: 2, state: saved },
  { name: 'mobile-paint', w: 390, h: 844, lang: 'ja', dpr: 2, act: 'paint' },
  { name: 'mobile-range', w: 390, h: 844, lang: 'ja', dpr: 2, state: { rangeRegion: 'art', rangeLo: 0.55, rangeHi: 1 }, act: 'mobileRange' },
  { name: 'mobile-range-en', w: 390, h: 844, lang: 'en', dpr: 2, state: { rangeRegion: 'frame', rangeInvert: true }, act: 'mobileRange' },
  { name: 'paint-mid', w: 1440, h: 900, lang: 'ja', state: { rangeRegion: 'none' }, act: 'paintMid' },
  { name: 'remove-undo', w: 1440, h: 900, lang: 'en', state: { ...saved, frameColor: '#e86a92' }, act: 'removeColor' },
  { name: 'range-narrow-en', w: 1440, h: 900, lang: 'en', state: { rangeRegion: 'text', rangeLo: 0.42, rangeHi: 0.5, rangeInvert: true }, act: 'scrollPanel' },
].filter((s) => s.name.includes(filter));

const errors = [];

async function strokes(page, erase) {
  await page.locator('.range-paint').click();
  await page.waitForTimeout(900);
  const b = await page.locator('.paint-layer').boundingBox();
  const line = async (pts) => {
    await page.mouse.move(b.x + b.width * pts[0][0], b.y + b.height * pts[0][1]);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(b.x + b.width * x, b.y + b.height * y, { steps: 12 });
    await page.mouse.up();
  };
  await page.locator('#brushSize').fill('40');
  await line([[0.2, 0.25], [0.5, 0.35], [0.8, 0.25]]);
  await line([[0.25, 0.6], [0.5, 0.5], [0.75, 0.62]]);
  if (erase) {
    await page.keyboard.press('x');
    await line([[0.5, 0.2], [0.5, 0.7]]);
  }
  await page.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.42);
  await page.waitForTimeout(500);
}

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: s.dpr ?? 1,
    reducedMotion: s.reduced ? 'reduce' : 'no-preference',
    locale: s.lang === 'ja' ? 'ja-JP' : 'en-US',
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${s.name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  await page.addInitScript((st) => {
    localStorage.clear();
    indexedDB.deleteDatabase('foil');
    if (st) localStorage.setItem('foil:v1', JSON.stringify({ edition: 'holo', ...st }));
  }, s.state ?? null);
  await page.goto(`${URL}?lang=${s.lang}`);
  await page.waitForTimeout(2600);
  const scrollPanel = () => page.locator('.sec-range').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  if (s.act === 'scrollPanel') {
    await scrollPanel();
    await page.waitForTimeout(400);
  } else if (s.act === 'hoverSwatch') {
    await page.locator('.sw-strip-frame .sw-chip').first().hover();
    await page.waitForTimeout(500);
  } else if (s.act === 'hoverRange') {
    await scrollPanel();
    await page.locator('.seg-region').hover();
    await page.waitForTimeout(800);
  } else if (s.act === 'focusTone') {
    await scrollPanel();
    await page.locator('.tone-lo').focus();
    await page.waitForTimeout(800);
  } else if (s.act === 'paint') {
    await strokes(page, false);
  } else if (s.act === 'paintErase') {
    await strokes(page, true);
  } else if (s.act === 'mobileRange') {
    await page.locator('.sec-range .tone').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1200);
  } else if (s.act === 'paintMid') {
    await page.locator('.range-paint').click();
    await page.waitForTimeout(900);
    const b = await page.locator('.paint-layer').boundingBox();
    await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.45, { steps: 16 });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/${s.name}.png` });
    await page.mouse.up();
  } else if (s.act === 'removeColor') {
    await page.locator('.sw-strip-frame .sw-item').nth(1).hover();
    await page.waitForTimeout(300);
    await page.locator('.sw-strip-frame .sw-del').nth(1).click();
    await page.waitForTimeout(500);
  } else if (s.act === 'exportPng') {
    const dl = page.waitForEvent('download');
    await page.locator('#pngBtn').click();
    const d = await dl;
    await d.saveAs(`${out}/export-range.png`);
    await page.waitForTimeout(300);
  }
  if (s.act !== 'exportPng' && s.act !== 'paintMid') await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: !!s.full });
  await ctx.close();
}
await browser.close();
if (errors.length) {
  console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log(`ok: ${shots.length} shots -> ${out}`);
