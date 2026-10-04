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
  for (const name of ['Relief', 'Gold']) {
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
  expect((await page.locator('.pk-name').count()) === 3, 'the haul does not show all three');
  await page.click('.pk-try');
  await overlayGone();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('foil:v1')).edition === 'crystal', null, { timeout: 10000 });
  const hand = (await state()).hand;
  expect(hand.includes('crystal') && !hand.includes('glitch'), `the pick did not take the hand's last place: ${hand}`);
  expect((await handCount()) === 7, `the hand has ${await handCount()} cards, not seven`);
  expect((await page.textContent('#deckBtn .deck-count')) === '3', 'the deck does not hold Relief, Gold and the swapped-out Glitch');
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
  expect((await page.textContent('#deckBtn .deck-count')) === '4', 'the deck count did not rise');
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
  expect((await page.textContent('#deckBtn .deck-count')) === '6', 'the deck does not hold both packs');
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
  expect((await page.textContent('#deckBtn .deck-count')) === '6', 'the carried-over packs are not in the deck');
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

await browser.close();
console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exitCode = 1;
