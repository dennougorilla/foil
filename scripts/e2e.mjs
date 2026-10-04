// End-to-end check of the side panel and exports: node scripts/e2e.mjs (with the dev server running)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { decompressFrames, parseGIF } from 'gifuct-js';

const URL = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('foil:v1') ?? '{}'));
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
/** Whether a button wears a solid face (inked) rather than an outline. */
const filled = (id, p = page) => p.evaluate((id) => !/^rgba\(.*, 0\)$|transparent/.test(getComputedStyle(document.getElementById(id)).backgroundColor), id);
const tab = async (id) => {
  if (!(await page.isVisible('#panelTabs'))) await page.click('#adjustToggle');
  await page.click(`#panelTabs [role=tab][data-tab=${id}]`);
  expect(await page.isVisible(`#pane-${id}`), `pane ${id} hidden after its tab was picked`);
};

await page.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.clear();
    sessionStorage.setItem('seeded', '1');
  }
});
await page.goto(`${URL}?lang=en`);
await page.waitForTimeout(2000);

await step('first visit shows only the main flow', async () => {
  expect((await page.locator('.panel .btn-primary').count()) === 1, 'expected exactly one primary button');
  expect(!(await page.isVisible('#panelTabs')), 'fine-tuning is open on a first visit');
  expect(!(await page.isVisible('#intensity')), 'a fine control shows before Fine-tune is opened');
  expect(!(await page.isVisible('.sw-strip-stage')), 'the backdrop row should be gone');
});

await step('the panel reads as three numbered steps', async () => {
  const steps = await page.locator('.panel .step').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.textContent));
  expect(steps.join() === '1,2,3', `steps shown: ${steps.join() || 'none'}`);
});

await step('while a sample shows, choosing a picture outranks Save', async () => {
  expect((await filled('pickBtn')) && !(await filled('saveBtn')), 'expected an inked pick button and a Save stamp still in outline');
});

await step('the crop preview is sized to the picture', async () => {
  const [view, pic] = await page.evaluate(() => ['#cropView', '#cropCanvas'].map((s) => document.querySelector(s).getBoundingClientRect().width));
  expect((view - pic) / view < 0.4, `the preview is mostly empty (${Math.round(pic)} of ${Math.round(view)} px)`);
});

await step('content fades out above the pinned Save bar', async () => {
  const fade = await page.evaluate(() => getComputedStyle(document.querySelector('.sec-export'), '::before'));
  expect(fade.display !== 'none' && parseFloat(fade.height) >= 24, `fade is ${fade.display} / ${fade.height}`);
});

await step('fine-tune opens with four tabs and is remembered', async () => {
  await page.click('#adjustToggle');
  expect((await page.locator('#panelTabs [role=tab]').count()) === 4, 'expected four tabs');
  expect(await page.isVisible('#pane-card'), 'Card tab is not open first');
  expect((await state()).adjustOpen === true, 'open state not saved');
  await page.reload();
  await page.waitForTimeout(1500);
  expect(await page.isVisible('#panelTabs'), 'open state not restored');
  await page.click('#adjustToggle');
  expect(!(await page.isVisible('#panelTabs')), 'fine-tune did not close');
});

await step('an unreadable file is explained beside the pick button', async () => {
  await page.setInputFiles('#fileInput', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForTimeout(400);
  expect(await page.isVisible('#imageError'), 'no error under the pick button');
  expect((await page.textContent('#imageError p')).includes('notes.txt'), 'the error does not name the file');
  await page
    .waitForFunction(() => document.getElementById('panel').classList.contains('has-more'), null, { timeout: 3000 })
    .catch(() => expect(false, 'the steps pushed under the stub are not marked as more below'));
  await page.click('#imageErrorClose');
  expect(!(await page.isVisible('#imageError')), 'the error did not close');
  // Fine-tune folds the picture step away; a failed file opens it again to show why.
  await page.click('#adjustToggle');
  await page.setInputFiles('#fileInput', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForTimeout(400);
  expect(await page.isVisible('#imageError'), 'the error is hidden while Fine-tune is open');
  await page.click('#imageErrorClose');
});

await step('load an image', async () => {
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 400;
    const x = c.getContext('2d');
    x.fillStyle = '#3a6';
    x.fillRect(0, 0, 600, 400);
    x.fillStyle = '#fd3';
    x.fillRect(200, 100, 200, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('#fileInput', { name: 'meadow.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('foil:v1') ?? '{}').sample === -1, null, { timeout: 15000 });
  expect((await page.locator('#thumbs .thumb').count()) === 4, 'own image thumb missing');
  expect((await filled('saveBtn')) && !(await filled('pickBtn')), 'with your own picture, Save should be the inked stamp and the pick button quiet');
});

await step('crop zoom', async () => {
  await page.locator('#zoom').fill('2');
  expect((await state()).crop.zoom === 2, 'zoom not applied');
  await page.click('#cropReset');
  expect((await state()).crop.zoom === 1, 'crop reset failed');
});

await step('switch finish', async () => {
  await page.locator('#cardSlot').focus();
  await page.keyboard.press('2');
  await page.waitForTimeout(300);
  expect((await state()).edition === 'foil', 'key 2 did not pick Foil');
  expect((await page.textContent('#finishName')) === 'Foil', 'the panel does not name the finish on the card');
  await page.click('#finishPick');
  expect(await page.evaluate(() => document.activeElement?.matches('.hand-slot[aria-checked=true]')), 'Pick from the hand did not lead to the hand');
});

await step('card tab: strength, pixelate, frame', async () => {
  await tab('card');
  await page.locator('#intensity').fill('0.5');
  await page.locator('#pixel').fill('2');
  await page.click('#frameSeg [role=radio]:nth-child(2)');
  const s = await state();
  expect(s.intensity === 0.5 && s.pixel === 2 && s.frame === 'ink', `got ${s.intensity}/${s.pixel}/${s.frame}`);
  await page.click('#cardReset');
  const r = await state();
  expect(r.intensity === 1 && r.pixel === 0 && r.frame === 'paper', 'card reset failed');
  await page.click('#adjustToggle');
  expect(!(await page.isVisible('#panelTabs')), 'the pinned Fine-tune row did not close it');
});

await step('add a frame color', async () => {
  await tab('card');
  await page.click('.sw-strip-frame .sw-add');
  await page.evaluate(() => {
    const i = document.querySelector('.sw-input');
    i.value = '#2266aa';
    i.dispatchEvent(new Event('input'));
    i.dispatchEvent(new Event('change'));
  });
  const s = await state();
  expect(s.frameSwatches.includes('#2266aa') && s.frameColor === '#2266aa', 'frame colour not saved');
});

await step('shine tab', async () => {
  await tab('light');
  await page.locator('#tune-scale').fill('1.6');
  await page.click('#pane-light [data-key=idle] [role=radio][data-value=spin]');
  const s = await state();
  expect(s.tune.scale === 1.6 && s.tune.idle === 'spin', 'tune not applied');
  expect(await page.isVisible('#panelTabs [data-tab=light] .tab-dot'), 'changed dot missing on the tab');
  await page.click('#pane-light .tune-reset-all');
  expect((await state()).tune.scale === 1, 'reset all failed');
});

await step('lettering from the name tag', async () => {
  await tab('card');
  // The name tag sways gently, so Playwright's "stable" wait can time out; the chip is still clickable.
  await page.click('.lt-jump', { force: true });
  expect(await page.isVisible('#pane-text'), 'name tag did not open the Lettering tab');
  await page.click('.lt-style[data-style=foil]');
  expect((await state()).text.style === 'foil', 'lettering style not applied');
});

await step('finish area tab and brush', async () => {
  await tab('range');
  await page.click('#pane-range .region-btn[data-v=art]');
  expect((await state()).rangeRegion === 'art', 'region not applied');
  await page.click('#pane-range .range-paint');
  await page.waitForTimeout(400);
  expect(await page.isVisible('.brush'), 'brush bar did not open');
  const b = await page.locator('#cardSlot').boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.click('.brush-done');
  await page.waitForTimeout(300);
  expect(!(await page.isVisible('.brush')), 'brush bar did not close');
});

for (const [format, ext] of [['png', '.png'], ['gif', '.gif'], ['apng', '-anim.png']]) {
  await step(`export ${format}`, async () => {
    await page.click(`#formatSeg [role=radio][data-format=${format}]`);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('#saveBtn')]);
    const name = dl.suggestedFilename();
    expect(typeof ext === 'string' ? name.endsWith(ext) : ext.test(name), `unexpected file ${name}`);
    await page.waitForFunction(() => !document.querySelector('#saveBtn[aria-busy]'), null, { timeout: 30000 });
  });
}

await step('GIF with a clear background is really clear', async () => {
  await page.click('#formatSeg [role=radio][data-format=gif]');
  expect(!(await page.isVisible('#gifBgSeg')), 'GIF options are open before being asked for');
  await page.click('#saveOptsToggle');
  await page.click('#gifBgSeg [data-v=clear]');
  await page.click('#matteSeg [data-v="#ffffff"]');
  expect(await page.isVisible('#gifClearNote'), 'no note about the dropped shadow');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('#saveBtn')]);
  const gif = parseGIF(readFileSync(await dl.path()));
  const frames = decompressFrames(gif, true);
  const { width, height } = gif.lsd;
  for (const f of [frames[0], frames[Math.floor(frames.length / 2)]]) {
    const at = (x, y) => f.patch[(y * f.dims.width + x) * 4 + 3];
    expect(f.dims.width === width && f.disposalType === 2, 'frames must be whole and cleared after showing');
    expect(at(2, 2) === 0 && at(width - 3, height - 3) === 0, 'corners are not transparent');
    expect(at(width >> 1, height >> 1) === 255, 'the card is not opaque');
  }
  await page.waitForFunction(() => !document.querySelector('#saveBtn[aria-busy]'), null, { timeout: 30000 });
});

await step('the hand opens with seven finishes; each support link unlocks one secret', async () => {
  const shown = () => page.locator('.hand-slot:not([hidden])').count();
  expect((await shown()) === 7, `the hand opened with ${await shown()} finishes, not seven`);
  for (let n = 1; n <= 2; n++) {
    await page.click('#supportBtn');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click(`.support-link >> nth=${n - 1}`)]);
    await popup.close();
    await page.waitForTimeout(600);
    const unlocked = await page.evaluate(() => JSON.parse(localStorage.getItem('foil:secrets') ?? '[]'));
    expect(unlocked.length === n, `expected ${n} secrets unlocked, got ${unlocked.length}`);
    expect((await shown()) === 7 + n, 'the unlocked secret did not join the hand');
    await page.keyboard.press('Escape');
  }
  // Secrets follow the seven open finishes in the hand, so key 8 picks the first one unlocked.
  const first = await page.locator('.hand-slot:not([hidden]) >> nth=7').getAttribute('data-id');
  await page.keyboard.press('8');
  await page.waitForTimeout(400);
  expect((await state()).edition === first, 'the unlocked secret could not be applied');
});

await step('phones: the live preview rides in the Save stub, never over the controls', async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await phone.newPage();
  p.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await p.goto(`${URL}?lang=en`);
  await p.waitForTimeout(1500);
  await p.click('#adjustToggle');
  await p.click('#panelTabs [role=tab][data-tab=light]');
  // Mid-tab, so the sheet runs on under the stub.
  await p.locator('#pane-light .tune-row').nth(3).scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  expect(await p.isVisible('.tune-peek'), 'no preview once the card has scrolled away');
  expect(await p.evaluate(() => !!document.querySelector('.tune-peek').closest('.sec-export')), 'the preview is not inside the Save stub');
  const fade = await p.evaluate(() => getComputedStyle(document.querySelector('.sec-export'), '::before'));
  expect(fade.display !== 'none' && fade.opacity === '1' && parseFloat(fade.height) >= 24, `no fade above the Save stub on phones (${fade.display} / ${fade.opacity} / ${fade.height})`);
  await phone.close();
});

// ---------- Phone: the hand on the first screen, flicking the card, gyro, drawing quality ----------

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mob = await phone.newPage();
mob.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
mob.on('console', (m) => m.type() === 'error' && errors.push(`phone: ${m.text()}`));
await mob.addInitScript(() => localStorage.clear());
await mob.goto(`${URL}?lang=en`);
await mob.waitForTimeout(3000);
const edition = () => mob.evaluate(() => JSON.parse(localStorage.getItem('foil:v1') ?? '{}').edition);

await step('phone: the card and the whole hand fit above the Save bar', async () => {
  const bar = await mob.locator('.sec-export').boundingBox();
  for (const sel of ['#cardSlot', '#hand', '#handCaption']) {
    const b = await mob.locator(sel).boundingBox();
    expect(b.y >= 0 && b.y + b.height <= bar.y + 1, `${sel} is not on the first screen above Save`);
  }
  expect((await mob.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'the page scrolls sideways');
});

await step('phone: flicking the card or tapping ‹ › steps through the hand; only a sideways flick does', async () => {
  const cdp = await phone.newCDPSession(mob);
  const b = await mob.locator('#cardSlot').boundingBox();
  const flick = async (dx, dy) => {
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++) {
      await mob.waitForTimeout(16);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mob.waitForTimeout(500);
    return edition();
  };
  const hand = await mob.locator('.hand-slot:not([hidden])').evaluateAll((els) => els.map((el) => el.dataset.id));
  const at = hand.indexOf(await edition());
  expect((await flick(-120, 6)) === hand[(at + 1) % hand.length], 'a flick left did not deal the next card');
  expect((await flick(120, -4)) === hand[at], 'a flick right did not go back');
  expect((await flick(8, 130)) === hand[at], 'a vertical drag changed the finish');
  await mob.click('#handNext');
  expect((await edition()) === hand[(at + 1) % hand.length], 'the › step did not deal the next card');
  await mob.click('#handPrev');
  expect((await edition()) === hand[at], 'the ‹ step did not go back');
});

await step('phone: tilting the device is taken without errors', async () => {
  await mob.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40 + i, gamma: i - 10 }));
      await new Promise((r) => setTimeout(r, 16));
    }
  });
});

await step('phone: ?quality pins the drawing level and lowers the card resolution', async () => {
  const width = async (q) => {
    await mob.goto(`${URL}?lang=en&quality=${q}`);
    await mob.waitForTimeout(1500);
    const level = await mob.evaluate(() => document.documentElement.dataset.quality);
    expect(level === String(q), `expected data-quality ${q}, got ${level}`);
    return mob.evaluate(() => document.getElementById('cards').width);
  };
  const full = await width(0);
  const low = await width(3);
  expect(low < full * 0.6, `the lowest level drew ${low}px wide, full drew ${full}px`);
});

await browser.close();
console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exitCode = 1;
