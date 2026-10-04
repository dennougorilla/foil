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
  await page.click('#imageErrorClose');
  expect(!(await page.isVisible('#imageError')), 'the error did not close');
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

await step('light & motion tab', async () => {
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

await step('area tab and brush', async () => {
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

await step('Confetti and Fireworks keep the message and the name, and their loops close', async () => {
  const report = await page.evaluate(async () => {
    const { createScene } = await import('/src/exporter.ts');
    const { drawBack, drawFace } = await import('/src/card/face.ts');
    const { editionById } = await import('/src/editions.ts');
    const { TUNE_DEFAULTS } = await import('/src/tune/model.ts');
    // A birthday message: dark lettering on a pale picture.
    const img = document.createElement('canvas');
    img.width = 600;
    img.height = 800;
    const x = img.getContext('2d');
    x.fillStyle = '#f4e6d0';
    x.fillRect(0, 0, 600, 800);
    x.fillStyle = '#e07a8a';
    x.beginPath();
    x.arc(300, 520, 150, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#2a1a3a';
    x.font = 'bold 84px sans-serif';
    x.textAlign = 'center';
    x.fillText('HAPPY', 300, 200);
    x.fillText('BIRTHDAY', 300, 300);
    const face = document.createElement('canvas');
    const mask = document.createElement('canvas');
    const back = document.createElement('canvas');
    face.width = mask.width = back.width = 900;
    face.height = mask.height = back.height = 1260;
    drawFace(face, mask, { image: img, crop: { zoom: 1, x: 0.5, y: 0.5 }, frame: 'paper', rarity: 'rare', name: 'Hanako' });
    drawBack(back);
    // A flat card (no idle motion) so the art and the nameplate land on known pixels.
    const W = 360;
    const H = 450;
    const tune = { ...TUNE_DEFAULTS, idle: 'none' };
    const cw = (320 * 5) / 7;
    const box = (u0, v0, u1, v1) => [Math.round(W / 2 + (u0 - 0.5) * cw), Math.round(H / 2 + (v0 - 0.5) * 320), Math.round(W / 2 + (u1 - 0.5) * cw), Math.round(H / 2 + (v1 - 0.5) * 320)];
    const ART = box(0.1, 0.08, 0.9, 0.85);
    const PLATE = box(0.1, 0.9, 0.55, 0.965);
    const grab = (id, intensity, ps, loop = 2.4) => {
      const s = createScene({ face, mask, back, edition: editionById(id), intensity, pixel: 0, name: 't', tune }, W, H, true, true, false);
      const out = ps.map((p) => {
        s.draw(p, 40, loop);
        return s.ctx.getImageData(0, 0, W, H).data;
      });
      s.dispose();
      return out;
    };
    const lumas = (d, [x0, y0, x1, y1]) => {
      const v = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        v.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      }
      return v;
    };
    const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const sd = (v) => Math.sqrt(mean(v.map((a) => (a - mean(v)) ** 2)));
    const corr = (a, b) => {
      const ma = mean(a);
      const mb = mean(b);
      let n = 0;
      for (let i = 0; i < a.length; i++) n += (a[i] - ma) * (b[i] - mb);
      return n / a.length / (sd(a) * sd(b));
    };
    // Share of pixels that visibly differ, so a finish that leaves the art as it is and only adds sparks still counts.
    const marked = (a, b) => a.filter((v, i) => Math.abs(v - b[i]) > 24).length / a.length;
    const diff = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i++) n += Math.abs(a[i] - b[i]);
      return n / a.length;
    };
    const out = {};
    for (const id of ['confetti', 'fireworks']) {
      const [plain] = grab(id, 0, [0]);
      const [p0, p1, half, p0b, p1b] = [...grab(id, 1, [0, 1, 0.5]), ...grab(id, 1, [0, 1], 3.1)];
      out[id] = {
        shader: editionById(id).id,
        change: marked(lumas(p0, ART), lumas(plain, ART)),
        art: corr(lumas(p0, ART), lumas(plain, ART)),
        plate: diff(lumas(p0, PLATE), lumas(plain, PLATE)),
        plateContrast: sd(lumas(p0, PLATE)) / sd(lumas(plain, PLATE)),
        seam: Math.max(diff(p0, p1), diff(p0b, p1b)),
        moves: diff(p0, half),
      };
    }
    return out;
  });
  for (const [id, r] of Object.entries(report)) {
    const f = (v) => v.toFixed(2);
    expect(r.shader === id, `${id} is not a finish`);
    expect(r.change > 0.03, `${id} barely changes the picture (${f(r.change * 100)}% of it)`);
    expect(r.art > 0.75, `${id} hides the message (correlation ${f(r.art)})`);
    expect(r.plate < 4 && r.plateContrast > 0.9, `${id} covers the name (diff ${f(r.plate)}, contrast ${f(r.plateContrast)})`);
    expect(r.seam < 0.6, `${id} jumps where its loop closes (${f(r.seam)})`);
    expect(r.moves > r.seam * 4, `${id} does not move along its loop (${f(r.moves)})`);
  }
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

await browser.close();
console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exitCode = 1;
