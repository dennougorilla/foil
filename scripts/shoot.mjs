// Screenshot matrix for the UI quality loop: node scripts/shoot.mjs [outDir] [filter]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5173/';
const out = process.argv[2] ?? 'shots';
const filter = process.argv[3] ?? '';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const shots = [
  { name: 'desktop-ja', w: 1440, h: 900, lang: 'ja' },
  { name: 'desktop-en', w: 1440, h: 900, lang: 'en' },
  { name: 'desktop-hover', w: 1440, h: 900, lang: 'ja', act: 'hoverCard' },
  { name: 'desktop-hand', w: 1440, h: 900, lang: 'ja', act: 'hoverHand' },
  { name: 'desktop-focus', w: 1440, h: 900, lang: 'ja', act: 'focusHand' },
  { name: 'desktop-drop', w: 1440, h: 900, lang: 'ja', act: 'drop' },
  { name: 'desktop-error', w: 1440, h: 900, lang: 'ja', act: 'badFile' },
  { name: 'desktop-upload', w: 1440, h: 900, lang: 'ja', act: 'upload' },
  { name: 'desktop-pixel', w: 1440, h: 900, lang: 'en', act: 'pixel' },
  { name: 'desktop-reduced', w: 1440, h: 900, lang: 'ja', reduced: true },
  { name: 'tablet-1024', w: 1024, h: 768, lang: 'ja' },
  { name: 'scale-125', w: 1152, h: 720, lang: 'ja', dpr: 1.25 },
  { name: 'mobile-ja', w: 390, h: 844, lang: 'ja', full: true, dpr: 2 },
  { name: 'mobile-en', w: 390, h: 844, lang: 'en', full: true, dpr: 2 },
].filter((s) => s.name.includes(filter));

const editions = ['base', 'foil', 'holo', 'poly', 'negative', 'gold', 'prism', 'galaxy', 'glitch', 'aurora', 'frost', 'magma', 'halftone', 'crystal', 'sakura'];
const errors = [];

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: s.dpr ?? 1,
    reducedMotion: s.reduced ? 'reduce' : 'no-preference',
    locale: s.lang === 'ja' ? 'ja-JP' : 'en-US',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${s.name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${s.name}: ${e.message}`));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${URL}?lang=${s.lang}`);
  await page.waitForTimeout(2600);
  const card = page.locator('#cardSlot');
  if (s.act === 'hoverCard') {
    const b = await card.boundingBox();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.25, { steps: 8 });
    await page.waitForTimeout(700);
  } else if (s.act === 'hoverHand') {
    const slot = page.locator('.hand-slot').nth(5);
    const b = await slot.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.waitForTimeout(700);
  } else if (s.act === 'focusHand') {
    await page.locator('.hand-slot[aria-checked=true]').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900);
  } else if (s.act === 'drop') {
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    });
    await page.waitForTimeout(400);
  } else if (s.act === 'badFile') {
    await page.setInputFiles('#fileInput', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.waitForTimeout(500);
  } else if (s.act === 'upload') {
    // A large photo-like image (soft bokeh over a sky gradient) generated in the page.
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 4000;
      c.height = 3000;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 3000);
      g.addColorStop(0, '#2b5fb8');
      g.addColorStop(0.6, '#f0a35e');
      g.addColorStop(1, '#3a2340');
      x.fillStyle = g;
      x.fillRect(0, 0, 4000, 3000);
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      x.filter = 'blur(18px)';
      for (let i = 0; i < 60; i++) {
        x.fillStyle = `hsla(${r() * 360},80%,${50 + r() * 30}%,.55)`;
        x.beginPath();
        x.arc(r() * 4000, r() * 3000, 60 + r() * 380, 0, Math.PI * 2);
        x.fill();
      }
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    });
    await page.setInputFiles('#fileInput', { name: '旅の写真.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
    await page.waitForTimeout(1600);
  } else if (s.act === 'pixel') {
    await page.keyboard.press('7');
    await page.locator('#pixel').fill('3');
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: !!s.full });
  if (s.name === 'desktop-ja') {
    // One frame per edition, cropped to the card.
    for (let i = 0; i < editions.length; i++) {
      await page.locator('.hand-slot').nth(i).click({ force: true });
      await page.waitForTimeout(900);
      const b = await card.boundingBox();
      await page.screenshot({
        path: `${out}/edition-${String(i + 1).padStart(2, '0')}-${editions[i]}.png`,
        clip: { x: b.x - 40, y: b.y - 40, width: b.width + 80, height: b.height + 80 },
      });
    }
  }
  await ctx.close();
}
await browser.close();
if (errors.length) {
  console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log(`ok: ${shots.length} shots -> ${out}`);
