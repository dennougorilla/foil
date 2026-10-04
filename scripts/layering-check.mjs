// Checks for layered finishes (docs/layering.md), with the dev server running:
//   node scripts/layering-check.mjs                  the outside pass composes: the art keeps the card's finish, the rest is the outside one
//   node scripts/layering-check.mjs --ref <url>      every single finish draws pixel for pixel as on <url> (a server of the release before)
//   node scripts/layering-check.mjs --measure        the cost of a second finish: frame time (GPU and SwiftShader) and GIF export time
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const URL = process.env.URL ?? 'http://localhost:5173/';
const ref = args.includes('--ref') ? args[args.indexOf('--ref') + 1] : null;
const measure = args.includes('--measure');
const W = 450;
const H = 630;
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const SOFT = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** A page with every pack loaded and a renderer on sample 0; `window.render` draws one card and returns its pixels. */
async function open(browser, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?lang=en`);
  await page.waitForTimeout(1500);
  await page.evaluate(
    async ({ W, H }) => {
      const { CardRenderer } = await import('/src/gl/renderers.ts');
      const { drawFace, drawBack } = await import('/src/card/face.ts');
      const { paintSample } = await import('/src/samples.ts');
      const { loadPack } = await import('/src/gl/finishes/registry.ts');
      const { PACKS } = await import('/src/packs.ts');
      const { RangeModel } = await import('/src/range.ts');
      const { EDITIONS } = await import('/src/editions.ts');
      await Promise.all(PACKS.map((p) => loadPack(p.id)));
      const face = document.createElement('canvas');
      const mask = document.createElement('canvas');
      const back = document.createElement('canvas');
      const spec = { image: paintSample(0), crop: { zoom: 1, x: 0.5, y: 0.5 }, frame: 'paper', rarity: 'rare', name: 'Layer test' };
      drawFace(face, mask, spec);
      drawBack(back);
      const model = new RangeModel();
      model.onFace(face, mask, spec);
      const canvas = document.createElement('canvas');
      const r = new CardRenderer(canvas, { settled: true });
      r.setFace(face, mask);
      r.setBack(back);
      r.resize(W, H, 1);
      const shader = (id) => EDITIONS.find((e) => e.id === id).shader;
      const range = (region) => r.range.set(model.snapshot({ rangeRegion: region, rangeLo: 0, rangeHi: 1, rangeInvert: false }));
      const draw = (o, w = W, h = H) => {
        r.begin();
        r.drawCard(
          {
            cx: w / 2, cy: h / 2, w, h, rx: 0, ry: 0, rz: 0, scale: 1,
            edition: shader(o.edition), outside: o.outside ? shader(o.outside) : undefined,
            intensity: 1, pixel: 0, tilt: [0.35, -0.25], light: [0.32, 0.22], alpha: 1, flash: 0, shadow: null,
          },
          o.time ?? 1.7,
        );
      };
      window.ids = EDITIONS.map((e) => e.id);
      window.render = (o) => {
        r.resize(W, H, 1);
        range(o.region ?? 'all');
        draw(o);
        draw(o); // twice: lazy helpers (Relief's map) are ready by the second
        const px = new Uint8Array(W * H * 4);
        r.gl.readPixels(0, 0, W, H, r.gl.RGBA, r.gl.UNSIGNED_BYTE, px);
        let s = '';
        for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode(...px.subarray(i, i + 0x8000));
        return btoa(s);
      };
      // Milliseconds per frame at a stage-sized card (the GPU is waited on every frame).
      window.time = (o, w, h, n) => {
        r.resize(w, h, 1);
        range(o.region ?? 'all');
        const one = new Uint8Array(4);
        for (let i = 0; i < 5; i++) draw(o, w, h);
        r.gl.readPixels(0, 0, 1, 1, r.gl.RGBA, r.gl.UNSIGNED_BYTE, one);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          draw({ ...o, time: 1 + i / 60 }, w, h);
          r.gl.readPixels(0, 0, 1, 1, r.gl.RGBA, r.gl.UNSIGNED_BYTE, one);
        }
        return (performance.now() - t0) / n;
      };
      // One GIF export, start to file, in ms.
      window.gif = async (o) => {
        const { exportGif } = await import('/src/exporter.ts');
        const { editionById } = await import('/src/editions.ts');
        const input = {
          face, mask, back, edition: editionById(o.edition), outside: o.outside ? editionById(o.outside) : undefined,
          intensity: 1, pixel: 0, name: 'layer-test',
          range: model.snapshot({ rangeRegion: o.region ?? 'all', rangeLo: 0, rangeHi: 1, rangeInvert: false }),
        };
        // The file is not wanted: the download link's click is held back.
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = () => {};
        const t0 = performance.now();
        await exportGif(input);
        const ms = performance.now() - t0;
        HTMLAnchorElement.prototype.click = click;
        return ms;
      };
      window.maskArt = () => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d');
        // Flipped to match readPixels (bottom row first).
        x.translate(0, H);
        x.scale(1, -1);
        x.drawImage(mask, 0, 0, W, H);
        return Array.from(x.getImageData(0, 0, W, H).data.filter((_, i) => i % 4 === 0));
      };
    },
    { W, H },
  );
  return { page, errors };
}

const pixels = (b64) => Buffer.from(b64, 'base64');
const results = [];
const report = (ok, msg) => results.push(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);

if (ref) {
  // SwiftShader rasterises on the CPU, so two servers' pixels can be compared exactly.
  const browser = await chromium.launch({ args: SOFT });
  const a = await open(browser, ref);
  const a2 = await open(browser, ref);
  const b = await open(browser, URL);
  const ids = await b.page.evaluate(() => window.ids);
  const shot = async (p, id) => pixels(await p.page.evaluate((id) => window.render({ edition: id }), id));
  for (const id of ids) {
    const pa = await shot(a, id);
    // Drawn on two pages of the reference: a finish that varies from run to run there (Snow Globe's glitter) can't be compared.
    if (!pa.equals(await shot(a2, id))) {
      report(true, `${id}: varies from run to run on the reference too, skipped`);
      continue;
    }
    const pb = await shot(b, id);
    let diff = 0;
    let max = 0;
    for (let i = 0; i < pa.length; i++) {
      const d = Math.abs(pa[i] - pb[i]);
      if (d) diff++;
      if (d > max) max = d;
    }
    report(diff === 0, `${id}: ${diff ? `${diff} channel values differ (max ${max})` : 'identical'}`);
  }
  for (const e of [...a.errors, ...a2.errors, ...b.errors]) report(false, `page error: ${e}`);
  await browser.close();
} else if (!measure) {
  const browser = await chromium.launch({ args: SOFT });
  const { page, errors } = await open(browser, URL);
  const art = await page.evaluate(() => window.maskArt());
  // Away from the window's edge, so antialiasing and the soft mask edge are left out.
  const inside = (i, want) => {
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) {
      const v = art[(y + dy) * W + x + dx];
      if (v === undefined || (want ? v < 250 : v > 5)) return false;
    }
    return x > 12 && y > 12 && x < W - 12 && y < H - 12;
  };
  // `same`: the outside finish already covers the frame in full on its own, so the frame matches it exactly
  // (Kintsugi mends a frame more boldly when layered than on its own).
  for (const [main, outside, same] of [['sakura', 'kintsugi', false], ['confetti', 'gold', true], ['holo', 'negative', true], ['crystal', 'platinum', true]]) {
    const layered = pixels(await page.evaluate((o) => window.render(o), { edition: main, outside, region: 'art' }));
    const mainOnly = pixels(await page.evaluate((o) => window.render(o), { edition: main, region: 'art' }));
    const outOnly = pixels(await page.evaluate((o) => window.render(o), { edition: outside, region: 'all' }));
    let artDiff = 0;
    let frameDiff = 0;
    let frameN = 0;
    let frameChanged = 0;
    for (let i = 0; i < W * H; i++) {
      const d = (p, q) => Math.max(...[0, 1, 2].map((c) => Math.abs(p[i * 4 + c] - q[i * 4 + c])));
      if (inside(i, true) && d(layered, mainOnly) > 0) artDiff++;
      if (inside(i, false) && layered[i * 4 + 3] === 255) {
        frameN++;
        if (d(layered, outOnly) > 1) frameDiff++;
        if (d(layered, mainOnly) > 8) frameChanged++;
      }
    }
    report(artDiff === 0, `${main} + ${outside}: the art is ${main} as before (${artDiff} pixels differ)`);
    if (same) report(frameDiff / frameN < 0.002, `${main} + ${outside}: the frame is ${outside} (${frameDiff} of ${frameN} pixels differ)`);
    report(frameChanged / frameN > 0.05, `${main} + ${outside}: the frame visibly changes (${((frameChanged / frameN) * 100).toFixed(1)}% of it)`);
  }
  for (const e of errors) report(false, `page error: ${e}`);
  await browser.close();
} else {
  const pairs = [['sakura', 'kintsugi'], ['confetti', 'gold'], ['holo', 'negative'], ['fireworks', 'platinum']];
  for (const [label, flags, n, w, h] of [['GPU', GPU, 240, 720, 1008], ['SwiftShader', SOFT, 30, 360, 504]]) {
    const browser = await chromium.launch({ args: flags });
    const { page } = await open(browser, URL);
    for (const [main, outside] of pairs) {
      // Interleaved, best of three, so other load on the machine evens out.
      const single = [];
      const layered = [];
      for (let k = 0; k < 3; k++) {
        single.push(await page.evaluate((a) => window.time({ edition: a.main, region: 'art' }, a.w, a.h, a.n), { main, w, h, n }));
        layered.push(await page.evaluate((a) => window.time({ edition: a.main, outside: a.outside, region: 'art' }, a.w, a.h, a.n), { main, outside, w, h, n }));
      }
      const s = Math.min(...single);
      const l = Math.min(...layered);
      results.push(`${label} ${w}×${h} ${main} + ${outside}: ${s.toFixed(2)} → ${l.toFixed(2)} ms/frame (+${(((l - s) / s) * 100).toFixed(0)}%)`);
    }
    if (label === 'GPU') {
      for (const [main, outside] of pairs.slice(0, 2)) {
        const s = await page.evaluate((o) => window.gif(o), { edition: main, region: 'art' });
        const l = await page.evaluate((o) => window.gif(o), { edition: main, outside, region: 'art' });
        results.push(`GIF export ${main} + ${outside}: ${(s / 1000).toFixed(2)} → ${(l / 1000).toFixed(2)} s`);
      }
    }
    await browser.close();
  }
}

console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
