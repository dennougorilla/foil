// Checks for layered finishes (docs/layering.md), with the dev server running:
//   node scripts/layering-check.mjs                  the layers compose: split areas show each finish alone, overlaps add light or lay over
//   node scripts/layering-check.mjs --ref <url>      every single finish draws pixel for pixel as on <url> (a server of the release before)
//   node scripts/layering-check.mjs --measure        the cost of layer 2: frame time (GPU and SwiftShader) and GIF export time
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
      const range = await import('/src/range.ts');
      const { RangeModel } = range;
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
      // The reference release has one area and snapshot(state); this one has a Paint per layer and snapshot(area, paint).
      const twoLayers = 'Paint' in range;
      const blank = twoLayers ? new range.Paint('layering-check') : null;
      const snap = (region, lo = 0, hi = 1) =>
        twoLayers ? model.snapshot({ region, lo, hi, invert: false }, blank) : model.snapshot({ rangeRegion: region, rangeLo: lo, rangeHi: hi, rangeInvert: false });
      const setAreas = (o) => {
        r.range.set(snap(o.region ?? 'all'));
        if (o.layer) r.range2.set(snap(o.layer.region ?? 'all', o.layer.lo, o.layer.hi));
      };
      const draw = (o, w = W, h = H) => {
        r.begin();
        r.drawCard(
          {
            cx: w / 2, cy: h / 2, w, h, rx: 0, ry: 0, rz: 0, scale: 1,
            edition: shader(o.edition),
            layer: o.layer ? { edition: shader(o.layer.edition), light: o.layer.blend !== 'over', strength: o.layer.strength ?? 1, under: o.edition !== 'base' } : undefined,
            intensity: 1, pixel: 0, tilt: [0.35, -0.25], light: [0.32, 0.22], alpha: 1, flash: 0, shadow: null,
          },
          o.time ?? 1.7,
        );
      };
      window.ids = EDITIONS.map((e) => e.id);
      window.render = (o) => {
        r.resize(W, H, 1);
        setAreas(o);
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
        setAreas(o);
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
          face, mask, back, edition: editionById(o.edition), intensity: 1, pixel: 0, name: 'layer-test', range: snap(o.region ?? 'all'),
          layer: o.layer
            ? { edition: editionById(o.layer.edition), draw: { edition: shader(o.layer.edition), light: o.layer.blend !== 'over', strength: 1, under: true }, range: snap(o.layer.region ?? 'all') }
            : undefined,
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
  const at = (p, i) => [p[i * 4], p[i * 4 + 1], p[i * 4 + 2]];
  const diff = (p, q, i) => Math.max(...[0, 1, 2].map((c) => Math.abs(p[i * 4 + c] - q[i * 4 + c])));
  const shot = async (o) => pixels(await page.evaluate((o) => window.render(o), o));
  // Split: layer 1 on the art, layer 2 on the frame. Where they don't overlap each shows alone, whichever the blend.
  // `same`: the frame finish covers the frame in full on its own too, so the frame matches it exactly
  // (Kintsugi mends a frame more boldly as layer 2 than on its own).
  for (const [main, top, same] of [['sakura', 'kintsugi', false], ['confetti', 'gold', true], ['holo', 'negative', true], ['crystal', 'platinum', true]]) {
    for (const blend of ['light', 'over']) {
      const layered = await shot({ edition: main, region: 'art', layer: { edition: top, region: 'frame', blend } });
      const mainOnly = await shot({ edition: main, region: 'art' });
      const topOnly = await shot({ edition: top, region: 'all' });
      let artDiff = 0;
      let frameDiff = 0;
      let frameN = 0;
      let frameChanged = 0;
      for (let i = 0; i < W * H; i++) {
        if (inside(i, true) && diff(layered, mainOnly, i) > 0) artDiff++;
        if (inside(i, false) && layered[i * 4 + 3] === 255) {
          frameN++;
          if (diff(layered, topOnly, i) > 1) frameDiff++;
          if (diff(layered, mainOnly, i) > 8) frameChanged++;
        }
      }
      const tag = `${main} (art) + ${top} (frame), ${blend}`;
      report(artDiff === 0, `${tag}: the art is ${main} as before (${artDiff} pixels differ)`);
      if (same) report(frameDiff / frameN < 0.002, `${tag}: the frame is ${top} (${frameDiff} of ${frameN} pixels differ)`);
      report(frameChanged / frameN > 0.05, `${tag}: the frame visibly changes (${((frameChanged / frameN) * 100).toFixed(1)}% of it)`);
    }
  }
  // Overlap: both on the whole card. Light only adds to layer 1; laid over at full strength, layer 2 is all there is.
  for (const [main, top] of [['holo', 'kintsugi'], ['sakura', 'gold'], ['poly', 'stardust']]) {
    const mainOnly = await shot({ edition: main });
    const topOnly = await shot({ edition: top });
    const light = await shot({ edition: main, layer: { edition: top, blend: 'light' } });
    const over = await shot({ edition: main, layer: { edition: top, blend: 'over' } });
    const half = await shot({ edition: main, layer: { edition: top, blend: 'over', strength: 0.5 } });
    let darker = 0;
    let lifted = 0;
    let overDiff = 0;
    let between = 0;
    let n = 0;
    for (let i = 0; i < W * H; i++) {
      if (light[i * 4 + 3] !== 255 || !inside(i, true)) continue;
      n++;
      const [l, m, o, h, t] = [at(light, i), at(mainOnly, i), at(over, i), at(half, i), at(topOnly, i)];
      if (l.some((v, c) => v < m[c] - 1)) darker++;
      if (l.some((v, c) => v > m[c] + 8)) lifted++;
      if (diff(over, topOnly, i) > 1) overDiff++;
      if (h.every((v, c) => v >= Math.min(m[c], o[c]) - 2 && v <= Math.max(m[c], o[c]) + 2)) between++;
      void t;
    }
    const tag = `${main} + ${top}, both on the whole card`;
    report(darker / n < 0.002, `${tag}, light: never darker than ${main} alone (${darker} of ${n} pixels)`);
    report(lifted / n > 0.03, `${tag}, light: ${top}'s light shows (${((lifted / n) * 100).toFixed(1)}% of the art lifted)`);
    report(overDiff / n < 0.002, `${tag}, over: ${top} alone (${overDiff} of ${n} pixels differ)`);
    report(between / n > 0.995, `${tag}, over at 50%: between the two (${((between / n) * 100).toFixed(1)}%)`);
  }
  for (const e of errors) report(false, `page error: ${e}`);
  await browser.close();
} else {
  // [label, layer 1, its region, layer 2]: a split (art + frame) and an overlap (both whole, light only).
  const cases = [
    ['Sakura art + Kintsugi frame', 'sakura', 'art', { edition: 'kintsugi', region: 'frame' }],
    ['Confetti art + Gold frame', 'confetti', 'art', { edition: 'gold', region: 'frame' }],
    ['Holo + Kintsugi, whole card, light', 'holo', 'all', { edition: 'kintsugi' }],
    ['Fireworks + Platinum, whole card, light', 'fireworks', 'all', { edition: 'platinum' }],
  ];
  for (const [label, flags, n, w, h] of [['GPU', GPU, 240, 720, 1008], ['SwiftShader', SOFT, 30, 360, 504]]) {
    const browser = await chromium.launch({ args: flags });
    const { page } = await open(browser, URL);
    for (const [name, main, region, layer] of cases) {
      // Interleaved, best of three, so other load on the machine evens out.
      const single = [];
      const layered = [];
      for (let k = 0; k < 3; k++) {
        single.push(await page.evaluate((a) => window.time({ edition: a.main, region: a.region }, a.w, a.h, a.n), { main, region, w, h, n }));
        layered.push(await page.evaluate((a) => window.time({ edition: a.main, region: a.region, layer: a.layer }, a.w, a.h, a.n), { main, region, layer, w, h, n }));
      }
      const a = Math.min(...single);
      const b = Math.min(...layered);
      results.push(`${label} ${w}×${h} ${name}: ${a.toFixed(2)} → ${b.toFixed(2)} ms/frame (+${(((b - a) / a) * 100).toFixed(0)}%)`);
    }
    if (label === 'GPU') {
      for (const [name, main, region, layer] of cases.slice(0, 3)) {
        const a = await page.evaluate((o) => window.gif(o), { edition: main, region });
        const b = await page.evaluate((o) => window.gif(o), { edition: main, region, layer });
        results.push(`GIF export ${name}: ${(a / 1000).toFixed(2)} → ${(b / 1000).toFixed(2)} s`);
      }
    }
    await browser.close();
  }
}

console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
