// End-to-end check of the side panel, exports, the packs and the deck: node scripts/e2e.mjs (with the dev server running)
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
/** Whether a button wears a step's bright colour rather than the board's slate (HSL saturation). */
const loud = (id, p = page) =>
  p.evaluate((id) => {
    const [r, g, b] = getComputedStyle(document.getElementById(id)).backgroundColor.match(/[\d.]+/g).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    return max > min && (max - min) / (1 - Math.abs(2 * l - 1)) > 0.5;
  }, id);
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
  expect((await loud('pickBtn')) && !(await loud('saveBtn')), 'expected a blue pick button and Save still resting in slate');
});

await step('the crop preview is sized to the picture', async () => {
  const [view, pic] = await page.evaluate(() => ['#cropView', '#cropCanvas'].map((s) => document.querySelector(s).getBoundingClientRect().width));
  expect((view - pic) / view < 0.4, `the preview is mostly empty (${Math.round(pic)} of ${Math.round(view)} px)`);
});

await step('content fades out above the pinned Save bar', async () => {
  const fade = await page.evaluate(() => getComputedStyle(document.querySelector('.sec-export'), '::before'));
  expect(fade.display !== 'none' && parseFloat(fade.height) >= 24, `fade is ${fade.display} / ${fade.height}`);
});

await step('nothing of a pack loads before one is opened', async () => {
  const names = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
  const pack = names.filter((n) => /finishes\/(metal|light|nature|studio|supporter)|\/pack\/|opening|shadowDepth/.test(n));
  expect(pack.length === 0, `loaded early: ${pack.join(', ')}`);
  expect((await page.locator('.hand-slot').count()) === 7, 'the hand does not start with seven');
  expect((await page.getAttribute('#packsBtn', 'data-sealed')) === '4', 'the pack button does not count four sealed packs');
  expect((await page.textContent('#deckBtn .deck-count')) === '0', 'the deck is not empty on a first visit');
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
    .catch(() => expect(false, 'the steps pushed under the Save box are not marked as more below'));
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
  expect((await loud('saveBtn')) && !(await loud('pickBtn')), 'with your own picture, Save should be the red slab and the pick button quiet');
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
  expect(await page.evaluate(() => document.getElementById('intensityOut').classList.contains('is-bump')), 'a changed value does not pop in its pocket');
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

await step('the motion button above the deck switches the idle motion in one tap, in step with the Shine tab', async () => {
  const btn = '#deckDock .qm-btn';
  expect(await page.isVisible(btn), 'no motion button by the deck');
  const deck = await page.locator('#deckBtn').boundingBox();
  const b = await page.locator(btn).boundingBox();
  expect(b.y + b.height <= deck.y && Math.abs(b.x + b.width / 2 - (deck.x + deck.width / 2)) < 30, 'the motion button is not just above the deck');
  await page.click(btn);
  expect((await page.getAttribute(btn, 'aria-expanded')) === 'true' && (await page.isVisible('.qm-tray')), 'the tray did not open');
  const names = await page.locator('.qm-opt span').allTextContents();
  expect(names.length === 13 && names.every(Boolean), `the tray shows ${names.length} motions: ${names}`);
  expect((await page.getAttribute('.qm-opt[aria-checked=true]', 'data-value')) === (await state()).tune.idle, 'the tray does not mark the current motion');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('qm-opt')), 'focus did not move into the tray');
  // Keyboard: Sway → Float, picked with Enter; the tray closes and focus returns to the button.
  await page.keyboard.press('ArrowRight');
  expect((await page.textContent('.qm-help')).length > 10, 'the focused motion is not described');
  await page.keyboard.press('Enter');
  expect((await state()).tune.idle === 'float', `Enter picked ${(await state()).tune.idle}`);
  expect(!(await page.isVisible('.qm-tray')) && (await page.evaluate(() => document.activeElement?.classList.contains('qm-btn'))), 'the tray stayed open or focus was lost');
  expect((await page.getAttribute(btn, 'data-value')) === 'float', 'the button does not show the new motion');
  // The Shine tab shows the same choice, and a pick there shows on the button.
  await tab('light');
  expect((await page.getAttribute('#pane-light [data-key=idle] [aria-checked=true]', 'data-value')) === 'float', 'the Shine tab disagrees');
  await page.click('#pane-light [data-key=idle] [role=radio][data-value=bounce]');
  expect((await page.getAttribute(btn, 'data-value')) === 'bounce', 'a pick in the Shine tab did not reach the button');
  // Escape and a press elsewhere close it without changing anything.
  await page.click(btn);
  await page.keyboard.press('Escape');
  expect(!(await page.isVisible('.qm-tray')), 'Escape did not close the tray');
  await page.click(btn);
  await page.mouse.click(20, 450);
  expect(!(await page.isVisible('.qm-tray')) && (await state()).tune.idle === 'bounce', 'a press elsewhere did not close the tray, or changed the motion');
  await page.click('#pane-light .tune-reset-all');
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

await step('a GIF moves exactly as the card does on the stage, for every idle motion', async () => {
  // Every card draw is recorded: the stage's main card with the idle clock it was drawn at, and each
  // exported frame with its loop time. Pose, sheen, light and flash are compared as the renderer gets them.
  await page.evaluate(async () => {
    const { CardRenderer } = await import('/src/gl/renderers.ts');
    const { motion, LiveMotion } = await import('/src/tune/motion.ts');
    const live = document.getElementById('cards');
    const slot = document.getElementById('cardSlot');
    const rec = (window.__draws = { live: null, frames: [] });
    const draw = (window.__drawCard = CardRenderer.prototype.drawCard);
    CardRenderer.prototype.drawCard = function (d, time) {
      const pick = ({ cx, cy, w, h, rx, ry, rz, scale, tilt, light, flash, glint }) => ({ cx, cy, w, h, rx, ry, rz, scale, tilt: [...tilt], light: [...light], flash, glint: glint ?? -2 });
      if (this.gl.canvas === live) {
        if (d.plate !== false) {
          const c = live.getBoundingClientRect();
          const s = slot.getBoundingClientRect();
          rec.live = { ...pick(d), s: motion.idleTime, ox: s.left - c.left + s.width / 2, oy: s.top - c.top + s.height / 2 };
        }
      } else rec.frames.push({ ...pick(d), time, W: this.gl.canvas.width, H: this.gl.canvas.height });
      return draw.call(this, d, time);
    };
    // The stage's idle clock is frozen (time stands still for it), so it can be set to any moment.
    motion.step = function (dt, ...rest) {
      return LiveMotion.prototype.step.call(this, 0, ...rest);
    };
  });
  await tab('light');
  try {
  const cases = [
    ['pendulum', 'orbit', 1.5],
    ['sway', 'pointer', 1],
    ['float', 'pointer', 0.75],
    ['wobble', 'fixed', 1],
    ['bounce', 'pointer', 2],
    ['glint', 'pointer', 1],
    ['spin', 'orbit', 1],
    ['turn', 'pointer', 1],
    ['breathe', 'pointer', 1],
    ['reveal', 'pointer', 1],
    ['push', 'fixed', 1.5],
    ['pulse', 'orbit', 1],
  ];
  const norm = (d, ox, oy) => ({ dx: (d.cx - ox) / d.h, dy: (d.cy - oy) / d.h, rx: d.rx, cry: Math.cos(d.ry), sry: Math.sin(d.ry), rz: d.rz, scale: d.scale, t0: d.tilt[0], t1: d.tilt[1], l0: d.light[0], l1: d.light[1], flash: d.flash, glint: d.glint });
  for (const [n, [idle, light, speed]] of cases.entries()) {
    await page.click(`#pane-light [data-key=light] [role=radio][data-value=${light}]`);
    await page.click(`#pane-light [data-key=idle] [role=radio][data-value=${idle}]`);
    await page.locator('#tune-speed').fill(String(speed));
    await page.waitForTimeout(300);
    const s = (await state()).tune;
    expect(s.idle === idle && s.light === light && s.speed === speed, `the tune did not take ${idle}/${light}/${speed}`);
    // The first case goes through Save, so the file's own timing is checked; the rest draw the export's frames directly.
    let frames;
    if (n === 0) {
      await page.click('#formatSeg [role=radio][data-format=gif]');
      await page.evaluate(() => (window.__draws.frames = []));
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.click('#saveBtn')]);
      const gif = decompressFrames(parseGIF(readFileSync(await dl.path())), true);
      const total = gif.reduce((a, f) => a + f.delay, 0);
      expect(Math.abs(total - 6000 / speed) <= 10, `the GIF lasts ${total} ms, not one ${6000 / speed} ms idle cycle`);
      await page.waitForFunction(() => !document.querySelector('#saveBtn[aria-busy]'), null, { timeout: 30000 });
      frames = await page.evaluate(() => window.__draws.frames);
      expect(frames.length === gif.length, `drew ${frames.length} frames for a ${gif.length}-frame GIF`);
    } else {
      frames = await page.evaluate(async () => {
        const { createScene } = await import('/src/exporter.ts');
        const { editionById } = await import('/src/editions.ts');
        const { drawBack } = await import('/src/card/back.ts');
        const { loopCycle } = await import('/src/tune/model.ts');
        const store = JSON.parse(localStorage.getItem('foil:v1'));
        const face = document.createElement('canvas');
        const back = document.createElement('canvas');
        face.width = back.width = 900;
        face.height = back.height = 1260;
        drawBack(back);
        window.__draws.frames = [];
        const scene = createScene({ face, mask: face, back, edition: editionById('base'), intensity: 1, pixel: 0, name: 't', tune: store.tune }, 480, 600, false, true, false);
        const loop = loopCycle(store.tune) / store.tune.speed;
        for (let i = 0; i < 12; i++) scene.draw(i / 12, 40, loop);
        scene.dispose();
        return window.__draws.frames;
      });
    }
    // The pointer leaves the stage (the card leans a little toward a pointer anywhere on it) and the card settles.
    await page.evaluate(() => document.getElementById('stage').dispatchEvent(new PointerEvent('pointerleave')));
    await page.waitForTimeout(1500);
    // Each exported frame against the stage held at the same moment of its idle cycle.
    let worst = { d: 0, at: '' };
    for (const f of frames.filter((_, i, a) => i % Math.ceil(a.length / 12) === 0)) {
      // An exported frame's loop time is its moment in idle seconds.
      const sAt = f.time;
      const got = await page.evaluate(async (sAt) => {
        const { motion } = await import('/src/tune/motion.ts');
        motion.idleTime = sAt;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return window.__draws.live;
      }, sAt);
      expect(Math.abs(got.s - sAt) < 1e-9, 'the stage clock moved while frozen');
      const a = norm(got, got.ox, got.oy);
      const b = norm(f, f.W / 2, f.H / 2);
      for (const k of Object.keys(a)) {
        const d = Math.abs(a[k] - b[k]);
        if (d > worst.d) worst = { d, at: `${k} at ${sAt.toFixed(2)}s: stage ${a[k].toFixed(4)}, export ${b[k].toFixed(4)}` };
      }
    }
    expect(worst.d < 2e-3, `${idle}/${light}/${speed}: the export drifts from the stage (${worst.at})`);
  }
  } finally {
    await page.evaluate(async () => {
      const { motion } = await import('/src/tune/motion.ts');
      const { CardRenderer } = await import('/src/gl/renderers.ts');
      delete motion.step;
      CardRenderer.prototype.drawCard = window.__drawCard;
    });
    await page.click('#pane-light .tune-reset-all');
  }
});

const handCount = () => page.locator('.hand-slot').count();
const packsSaved = () => page.evaluate(() => JSON.parse(localStorage.getItem('foil:packs') ?? 'null'));
const phase = (p) => page.waitForSelector(`.pk[data-phase=${p}]`, { timeout: 30000 });
const overlayGone = () => page.waitForSelector('.pk', { state: 'detached', timeout: 15000 });

await step('open a pack: trace the top, swipe through, the showpiece last, then try it', async () => {
  await page.click('#packsBtn');
  // The shop: every pack on the tray, the first sealed one chosen.
  await phase('shop');
  expect((await page.locator('.pk-slot').count()) === 4, 'the shop does not show the four packs');
  expect((await page.getAttribute('.pk-slot[data-pack=metal]', 'aria-checked')) === 'true', 'the first sealed pack is not the chosen one');
  await page.click('.pk-buy');
  await phase('pack');
  // Wait for the pack to settle from its flight (the guide lies level across its top).
  await page.waitForFunction(() => {
    const r = document.querySelector('.pk-guide').getBoundingClientRect();
    return r.height < 8 && r.top < innerHeight * 0.4;
  }, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const g = await page.locator('.pk-guide').boundingBox();
  await page.mouse.move(g.x + 4, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width * 0.5, g.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(!(await packsSaved())?.opened?.length, 'a trace stopped halfway opened the pack');
  await page.mouse.move(g.x + 4, g.y);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width, g.y, { steps: 12 });
  await page.mouse.up();
  await phase('deck');
  expect((await packsSaved()).opened.includes('metal'), 'the tear did not mark the pack opened');
  for (const name of ['Relief', 'Gold', 'Platinum', 'Cosmo Holo']) {
    await page.waitForFunction((n) => document.querySelector('.pk-label b')?.textContent === n, name, { timeout: 10000 });
    await page.keyboard.press('ArrowRight');
  }
  await page.waitForSelector('.pk.is-waiting', { timeout: 10000 });
  expect((await page.textContent('.pk-label b')) === '？？？', 'the showpiece showed its name before it was turned over');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.pk-label b')?.textContent === 'Crystal', null, { timeout: 15000 });
  // Under the card, top to bottom and never overlapping, even on a low screen: progress and tag,
  // name, line, next-step button.
  for (const [w, h] of [[1367, 664], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      return { tags: r('.pk-tags'), name: r('.pk-label b'), desc: r('.pk-label small'), hint: r('.pk-hint'), vh: innerHeight };
    });
    const ok = box.tags.bottom <= box.name.top && box.name.bottom <= box.desc.top && box.desc.bottom <= box.hint.top && box.hint.bottom <= box.vh;
    expect(ok, `the words under the card overlap at ${w}x${h}: ${JSON.stringify(box)}`);
  }
  await page.keyboard.press('ArrowRight');
  await phase('haul');
  expect((await page.locator('.pk-name').count()) === 5, 'the haul does not show all five');
  await page.click('.pk-try');
  await overlayGone();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('foil:v1')).edition === 'crystal', null, { timeout: 10000 });
  // The proof beside step 2 still copies finished frames once the stage draws again after the opening.
  await page.waitForTimeout(1500);
  const proofLit = await page.evaluate(() => {
    const c = document.querySelector('#finishProof canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 120) lit++;
    return lit / (d.length / 4);
  });
  expect(proofLit > 0.3, `the finish proof is blank after the opening (${(proofLit * 100).toFixed(0)}% lit)`);
  const hand = (await state()).hand;
  expect(hand.includes('crystal') && !hand.includes('glitch'), `the pick did not take the hand's last place: ${hand}`);
  expect((await handCount()) === 7, `the hand has ${await handCount()} cards, not seven`);
  expect((await page.textContent('#deckBtn .deck-count')) === '5', 'the deck does not hold the other four Metal finishes and the swapped-out Glitch');
});

await step('the deck builder: one tap moves a card, a full hand gives up its last card, undo, drag, reset', async () => {
  const hand = async () => (await state()).hand;
  const count = () => page.textContent('.db-count');
  await page.click('#deckBtn');
  await page.waitForSelector('.dv.is-in', { timeout: 15000 });
  expect((await count()) === '7 / 7', `count reads ${await count()}`);
  expect((await page.locator('.db-grid .db-card.is-in').count()) === 7, 'the grid does not mark the seven in the hand');
  await page.waitForSelector('.db-grid .db-pic canvas', { timeout: 30000 });
  // Out of the hand: its slot stays open, and the next card goes there.
  await page.click('.db-hand .db-card[data-id=holo]');
  expect((await count()) === '6 / 7' && !(await hand()).includes('holo'), 'tapping a hand card did not send it to the deck');
  expect((await page.textContent('#deckBtn .deck-count')) === '6', 'the deck count did not rise');
  await page.click('.db-grid .db-card[data-id=relief]');
  expect((await hand())[2] === 'relief', `Relief did not take the emptied slot: ${await hand()}`);
  // Full: the last card that is not Base gives way.
  await page.click('.db-grid .db-card[data-id=gold]');
  const full = await hand();
  expect(full.length === 7 && full[6] === 'gold' && !full.includes('crystal'), `a full hand did not give up its last card: ${full}`);
  // The next tap swaps the card before it, not the card just added.
  await page.click('.db-grid .db-card[data-id=glitch]');
  const next = await hand();
  expect(next[5] === 'glitch' && next[6] === 'gold', `the next tap replaced the card just added: ${next}`);
  await page.click('.db-undo');
  await page.click('.db-undo');
  expect((await hand()).includes('crystal') && !(await hand()).includes('gold'), 'undo did not step back');
  // Base cannot leave.
  await page.click('.db-hand .db-card[data-id=base]');
  expect((await hand()).includes('base'), 'Base left the hand');
  // Drag a grid card onto a slot: it swaps exactly that card.
  const from = await page.locator('.db-grid .db-card[data-id=glitch]').boundingBox();
  const to = await page.locator('.db-slot[data-slot="1"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await hand())[1] === 'glitch', `dragging onto slot 2 did not put Glitch there: ${await hand()}`);
  // Back to the starting seven, and closing keeps it.
  await page.click('.db-reset');
  await page.click('.db-done');
  await page.waitForSelector('.dv', { state: 'detached', timeout: 5000 });
  expect((await hand()).join() === 'base,foil,holo,poly,negative,prism,glitch', `the starting seven did not come back: ${await hand()}`);
  expect((await state()).edition === 'base', 'a finish taken out of the hand stayed on the card');
  expect((await handCount()) === 7, 'the page hand is not seven');
});

await step('a replay from the shop can be skipped straight to the haul and closed', async () => {
  await page.click('#packsBtn');
  await phase('shop');
  await page.click('.pk-slot[data-pack=metal]', { force: true });
  expect((await page.textContent('.pk-buy')).includes('Watch'), 'an opened pack does not offer a replay');
  await page.click('.pk-buy');
  await phase('pack');
  await page.click('.pk-skip');
  await phase('haul');
  await page.keyboard.press('Escape');
  await overlayGone();
  expect((await state()).edition === 'base', 'closing a replay changed the finish');
});

await step('held still, the pack opens with a button and the haul fades in', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#packsBtn');
  await phase('shop');
  await page.click('.pk-slot[data-pack=nature]', { force: true });
  await page.click('.pk-buy');
  await phase('pack');
  await page.click('.pk-open');
  await phase('haul');
  await page.click('.pk-name >> nth=0');
  await overlayGone();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('foil:v1')).hand.includes('sakura'), null, { timeout: 10000 });
  expect((await page.textContent('#deckBtn .deck-count')) === '10', 'the deck does not hold both packs');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

await step('a support link puts the Supporter pack in the shop, and only then', async () => {
  expect((await page.getAttribute('#packsBtn', 'data-sealed')) === '2', 'expected two sealed packs before the support link');
  await page.click('#supportBtn');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('.support-link >> nth=0')]);
  await popup.close();
  await page.keyboard.press('Escape');
  await page.waitForSelector('#packsBtn[data-sealed="3"]', { timeout: 5000 });
  expect((await packsSaved()).supporter === true, 'the support link was not remembered');
});

await step('finishes unlocked by the old support links carry over as opened packs', async () => {
  await page.evaluate(() => {
    localStorage.removeItem('foil:packs');
    localStorage.setItem('foil:secrets', '["shallows","kintsugi"]');
    const s = JSON.parse(localStorage.getItem('foil:v1'));
    // The earlier "drawn card" save: no hand, a drawn finish.
    const { hand, ...rest } = s;
    localStorage.setItem('foil:v1', JSON.stringify({ ...rest, edition: 'holo', drawn: 'shallows' }));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const saved = await packsSaved();
  expect(saved.opened.join() === 'light,supporter' && saved.supporter === true, `got ${JSON.stringify(saved)}`);
  expect((await page.evaluate(() => localStorage.getItem('foil:secrets'))) === null, 'the old key was left behind');
  const after = await state();
  expect(after.hand.length === 7 && after.hand.includes('shallows') && !('drawn' in after), `the drawn card did not move into the hand: ${after.hand}`);
  expect((await page.textContent('#deckBtn .deck-count')) === '10', 'the carried-over packs are not in the deck');
});

await step('a card on a finish whose pack is sealed goes back to Holographic', async () => {
  await page.evaluate(() => {
    localStorage.setItem('foil:packs', '{"opened":[],"supporter":false}');
    const s = JSON.parse(localStorage.getItem('foil:v1'));
    localStorage.setItem('foil:v1', JSON.stringify({ ...s, edition: 'magma', hand: ['base', 'magma', 'foil', 'holo', 'poly', 'negative', 'prism'] }));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const s = await state();
  expect(s.edition === 'holo' && !s.hand.includes('magma') && s.hand.includes('base'), `got ${s.edition} / ${s.hand}`);
  expect((await handCount()) === s.hand.length, 'the page hand does not match the saved hand');
});

await step('Confetti and Fireworks keep the message and the name, and their loops close', async () => {
  const report = await page.evaluate(async () => {
    const { createScene } = await import('/src/exporter.ts');
    // Exports draw a pack finish once its pack's module has arrived.
    await (await import('/src/gl/finishes/registry.ts')).loadPack('supporter');
    const { drawFace } = await import('/src/card/face.ts');
    const { drawBack } = await import('/src/card/back.ts');
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
    expect(r.change > 0.02, `${id} barely changes the picture (${f(r.change * 100)}% of it)`);
    expect(r.art > 0.75, `${id} hides the message (correlation ${f(r.art)})`);
    expect(r.plate < 4 && r.plateContrast > 0.9, `${id} covers the name (diff ${f(r.plate)}, contrast ${f(r.plateContrast)})`);
    expect(r.seam < 0.6, `${id} jumps where its loop closes (${f(r.seam)})`);
    expect(r.moves > r.seam * 4, `${id} does not move along its loop (${f(r.moves)})`);
  }
});

await step('phones: the live preview rides in the Save box, never over the controls', async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await phone.newPage();
  p.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await p.goto(`${URL}?lang=en`);
  await p.waitForTimeout(1500);
  await p.click('#adjustToggle');
  await p.click('#panelTabs [role=tab][data-tab=light]');
  // Mid-tab, so the panel runs on under the Save box.
  await p.locator('#pane-light .tune-row').nth(3).scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  expect(await p.isVisible('.tune-peek'), 'no preview once the card has scrolled away');
  expect(await p.evaluate(() => !!document.querySelector('.tune-peek').closest('.sec-export')), 'the preview is not inside the Save box');
  const fade = await p.evaluate(() => getComputedStyle(document.querySelector('.sec-export'), '::before'));
  expect(fade.display !== 'none' && fade.opacity === '1' && parseFloat(fade.height) >= 24, `no fade above the Save box on phones (${fade.display} / ${fade.opacity} / ${fade.height})`);
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

await step('Raden and Opal change the picture clearly, keep it, and answer the tilt', async () => {
  // Held still (reduced motion), so two shots differ only by the finish and the pointer.
  const still = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await still.newPage();
  await p.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear();
    // The Supporter pack opened, with Raden and Opal in the hand.
    localStorage.setItem('foil:packs', JSON.stringify({ opened: ['supporter'], supporter: true }));
    localStorage.setItem('foil:v1', JSON.stringify({ hand: ['base', 'foil', 'holo', 'raden', 'opal'] }));
    sessionStorage.setItem('seeded', '1');
  });
  await p.goto(`${URL}?lang=en`);
  await p.waitForTimeout(2000);
  const card = p.locator('#cardSlot');
  // Luminance and colour of the middle of the art window, read back from a screenshot.
  const art = async (id, fx, fy) => {
    await p.$eval(`.hand-slot[data-id=${id}]`, (el) => el.click());
    const b = await card.boundingBox();
    await p.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 4 });
    await p.waitForTimeout(900);
    const png = (await p.screenshot({ clip: { x: b.x + b.width * 0.15, y: b.y + b.height * 0.12, width: b.width * 0.7, height: b.height * 0.66 } })).toString('base64');
    return p.evaluate(async (src) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${src}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
      c.drawImage(img, 0, 0);
      return Array.from(c.getImageData(0, 0, img.width, img.height).data);
    }, png);
  };
  const diff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 765;
    return s / (a.length / 4);
  };
  // How coloured the change is: a grey haze scores 0, a shift into a strong hue scores high.
  const tint = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = [a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]];
      s += (Math.max(...d) - Math.min(...d)) / 255;
    }
    return s / (a.length / 4);
  };
  const corr = (a, b) => {
    const la = [], lb = [];
    for (let i = 0; i < a.length; i += 4) {
      la.push(a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114);
      lb.push(b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114);
    }
    const n = la.length, ma = la.reduce((x, y) => x + y) / n, mb = lb.reduce((x, y) => x + y) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) {
      sab += (la[i] - ma) * (lb[i] - mb);
      saa += (la[i] - ma) ** 2;
      sbb += (lb[i] - mb) ** 2;
    }
    return sab / Math.sqrt(saa * sbb);
  };
  for (const id of ['raden', 'opal']) {
    const base = await art('base', 0.5, 0.5);
    const front = await art(id, 0.5, 0.5);
    const baseA = await art('base', 0.1, 0.12);
    const tiltA = await art(id, 0.1, 0.12);
    const baseB = await art('base', 0.92, 0.9);
    const tiltB = await art(id, 0.92, 0.9);
    // How much colour the finish brings to the picture, and how much of it changes between two tilts.
    const strength = tint(front, base);
    const keep = corr(front, base);
    const layerA = tiltA.map((v, i) => v - baseA[i]);
    const layerB = tiltB.map((v, i) => v - baseB[i]);
    const swing = diff(layerA.map((v) => v + 128), layerB.map((v) => v + 128));
    console.log(`  ${id} strength ${strength.toFixed(3)} keep ${keep.toFixed(2)} swing ${swing.toFixed(3)}`);
    // The faint v0.9.1 versions scored about 0.1 strength and 0.03–0.05 swing here.
    expect(strength > 0.2, `${id} barely changes the picture (${strength.toFixed(3)})`);
    expect(keep > 0.6, `${id} loses the picture (${keep.toFixed(2)})`);
    expect(swing > 0.08, `${id} hardly answers the tilt (${swing.toFixed(3)})`);
  }
  await still.close();
});

await browser.close();
console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exitCode = 1;
