// Performance budget check (docs/performance.md). With a server running (npm run dev, or vite preview
// of a build), puts every finish on the card in turn on a phone-sized page at full quality and
// measures the stage twice: its frames with the GPU in software (SwiftShader, where a shader's cost
// shows as frame time) and its main-thread work with the CPU slowed down on the real GPU. Prints
// every finish and the backdrop, then only what is over budget, and exits with 1 when something is.
//
//   node scripts/perf-budget.mjs [--url http://localhost:5173/] [--only holo,gold] [--cpu 4]
//
// Numbers depend on the machine (and on what else it runs): compare runs on the same one. Over budget
// means "look at this one", not a failure by itself.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const PAGE = arg('url', process.env.URL ?? 'http://localhost:5173/');
const CPU = +arg('cpu', 4);
const ONLY = arg('only', '').split(',').filter(Boolean);

/**
 * The budget, set so that only the heaviest stand out: a finish may draw up to FINISH_GPU times the
 * frame of Base (the plain card) and take up to FINISH_MAIN ms of main-thread work a frame (CPU
 * slowed 4×); the backdrop up to BACKDROP of a frame.
 */
const FINISH_GPU = 3;
const FINISH_MAIN = 15;
const BACKDROP = 0.3;

const editions = readFileSync(new URL('../src/editions.ts', import.meta.url), 'utf8');
const ids = [...editions.matchAll(/\{ id: '(\w+)', shader: \d+/g)].map((m) => m[1]).filter((id) => !ONLY.length || ONLY.includes(id));
const depth = new Set([...editions.matchAll(/\{ id: '(\w+)'[^\n]*depth: true/g)].map((m) => m[1]));
const OPEN = ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch'];
const ALL_PACKS = { opened: ['metal', 'light', 'nature', 'studio', 'supporter'], supporter: true };

/** Knows when the main card (the one with its nameplate) is first drawn, and can leave the backdrop out. */
function hooks() {
  window.__perf = { card: 0, noBg: false };
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, o) {
    const gl = get.call(this, type, o);
    if (!gl || type !== 'webgl2' || gl.__perf || !['cards', 'bg'].includes(this.id)) return gl;
    gl.__perf = true;
    const id = this.id;
    const draw = gl.drawArrays.bind(gl);
    const loc = gl.getUniformLocation.bind(gl);
    const u1f = gl.uniform1f.bind(gl);
    let plate = 0;
    gl.getUniformLocation = (p, n) => {
      const l = loc(p, n);
      if (l) l.__n = n;
      return l;
    };
    gl.uniform1f = (l, v) => {
      if (l?.__n === 'uPlate') plate = v;
      return u1f(l, v);
    };
    gl.drawArrays = (mode, a, b) => {
      if (id === 'bg' && window.__perf.noBg) return;
      if (id === 'cards' && plate === 1 && !window.__perf.card) window.__perf.card = performance.now();
      return draw(mode, a, b);
    };
    return gl;
  };
}

/** One browser: `software` draws with SwiftShader, `cpu` slows the main thread. */
async function session(software, cpu) {
  const browser = await chromium.launch({
    args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(hooks);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto(`${PAGE}?lang=en`);

  /** Mean frame (ms) and main-thread work a frame (ms) with `edition` on the card. */
  async function show(edition) {
    const hand = OPEN.includes(edition) ? OPEN : [...OPEN.slice(0, 6), edition];
    await page.evaluate(
      ({ s, packs }) => {
        localStorage.setItem('foil:v1', JSON.stringify(s));
        localStorage.setItem('foil:packs', JSON.stringify(packs));
      },
      { s: { edition, hand, flicked: true }, packs: ALL_PACKS },
    );
    await page.goto(`${PAGE}?lang=en&quality=0`);
    await page.waitForFunction(() => window.__perf.card > 0, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    return measure();
  }

  /** Mean frame (ms) and main-thread work a frame (ms) over three seconds of what is on the page. */
  async function measure() {
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const a = await metrics();
    const t = await page.evaluate(
      () =>
        new Promise((done) => {
          const t = [];
          const end = performance.now() + 3000;
          const f = (now) => {
            t.push(now);
            if (now < end) requestAnimationFrame(f);
            else done(t);
          };
          requestAnimationFrame(f);
        }),
    );
    const b = await metrics();
    const n = t.length - 1;
    return { frame: (t[n] - t[0]) / n, main: ((b.TaskDuration - a.TaskDuration) * 1000) / n };
  }
  /** The backdrop's share of a frame: the same card measured with and without it, in turns. */
  async function backdrop() {
    const run = async (off) => {
      await page.evaluate((v) => (window.__perf.noBg = v), off);
      return (await measure()).frame;
    };
    let on = 0;
    let off = 0;
    for (let i = 0; i < 2; i++) {
      on += await run(false);
      off += await run(true);
    }
    return 1 - off / on;
  }
  return { show, backdrop, errors, close: () => browser.close() };
}

const rows = new Map(ids.map((id) => [id, { frame: NaN, main: NaN, note: depth.has(id) ? 'depth model may still be loading' : '' }]));
const fail = (id, e) => (rows.get(id).note = e.message.split('\n')[0]);
const errors = [];

// GPU: software drawing, the CPU at its own speed.
const soft = await session(true, 1);
const base = await soft.show('base');
for (const id of ids) await (id === 'base' ? Promise.resolve(base) : soft.show(id)).then((r) => (rows.get(id).frame = r.frame), (e) => fail(id, e));
await soft.show('base');
const bgShare = await soft.backdrop();
errors.push(...soft.errors);
await soft.close();

// Main thread: the real GPU, the CPU slowed down.
const hw = await session(false, CPU);
for (const id of ids) await hw.show(id).then((r) => (rows.get(id).main = r.main), (e) => fail(id, e));
errors.push(...hw.errors);
await hw.close();

console.log(`360x800 @2x, full quality. Frames in SwiftShader (Base ${base.frame.toFixed(0)} ms); main thread with the CPU ${CPU}x slower.`);
console.log('finish'.padEnd(16), 'x Base'.padStart(7), 'main ms'.padStart(8));
const over = [];
for (const [id, r] of rows) {
  const ratio = r.frame / base.frame;
  const bad = !(ratio <= FINISH_GPU) || !(r.main <= FINISH_MAIN);
  if (bad) over.push(id);
  console.log(id.padEnd(16), ratio.toFixed(2).padStart(7), r.main.toFixed(1).padStart(8), bad ? ' OVER' : '', r.note);
}
console.log(`backdrop: ${(bgShare * 100).toFixed(0)}% of a frame${bgShare > BACKDROP ? ' OVER' : ''}`);
if (bgShare > BACKDROP) over.push('backdrop');
console.log(
  over.length
    ? `\nOver budget (frame > ${FINISH_GPU}x Base, main thread > ${FINISH_MAIN} ms, backdrop > ${BACKDROP * 100}% of a frame): ${over.join(', ')}`
    : '\nEverything is within budget.',
);
if (errors.length) console.log(`Page errors:\n${[...new Set(errors)].join('\n')}`);
if (over.length) console.log('A machine busy with other work slows some runs: measure what is over again with --only before acting on it.');
process.exitCode = over.length || errors.length ? 1 : 0;
