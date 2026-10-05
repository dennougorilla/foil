// Renders the share images from the running app: node scripts/og.mjs (needs `npm run dev`).
//   public/og.png               1200×630 Open Graph / Twitter card
//   public/apple-touch-icon.png 180×180 home-screen icon for iOS (the pixel card favicon)
//   public/icon-*.png           the manifest's icons, 192 and 512, rounded and maskable (docs/pwa.md)
// node scripts/og.mjs --icons renders only the manifest's icons, without the dev server.
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5173/';
const onlyIcons = process.argv.includes('--icons');
// The real GPU when there is one (sharper, and the stage runs at full speed); SwiftShader otherwise.
const browser = await chromium.launch({ args: process.env.SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

// ---------- og.png ----------

if (!onlyIcons) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  // Every pack opened, a hand of the showiest finishes, and a message on the card.
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('foil:packs', JSON.stringify({ opened: ['metal', 'light', 'nature', 'studio', 'supporter'], supporter: true }));
    localStorage.setItem(
      'foil:v1',
      JSON.stringify({ lang: 'en', edition: 'cosmoholo', hand: ['gold', 'holo', 'cosmoholo', 'negative', 'raden'], rarity: 'legendary', name: 'Meadow', message: { text: 'Happy day!', place: 'top', font: 'pop' } }),
    );
  });
  await page.goto(`${URL}?lang=en`);
  // Recompose the live app as a poster: logo and pitch on the left over the fanned hand,
  // the card large on the right. The WebGL stage follows the DOM boxes, so CSS is enough.
  await page.addStyleTag({
    content: `
      .app { display: block; height: 100vh; }
      .panel, .toggles, .info, .hand-hint, .hand-caption, .stage-pick, .toasts, .qm, .deck-dock, #flickHint { display: none !important; }
      .stage { position: fixed; inset: 0; padding: 0; display: block; }
      .showcase { position: absolute; inset: 0; display: block; }
      .card-slot { position: absolute; right: 118px; top: 46px; height: 538px; max-height: none; }
      .top { position: absolute; left: 64px; top: 58px; padding: 0; z-index: 4; }
      .logo-word { zoom: 2.6; pointer-events: none; }
      .logo-word .tile { animation: none; }
      .logo-word .spark { animation: none; opacity: 1; transform: scale(1); }
      .logo-word .spark:nth-of-type(4) { display: none; }
      .hand-wrap { position: absolute; left: 34px; bottom: 34px; width: 560px; z-index: 4; }
      .hand-slot[aria-checked='true']::after { display: none; }
      /* A calm field behind the words: the swirl falls away into shade on the left. */
      .stage::before { content: ''; position: absolute; inset: 0 0 220px 0; z-index: 3; pointer-events: none; -webkit-mask: linear-gradient(180deg, #000 80%, transparent); mask: linear-gradient(180deg, #000 80%, transparent);
        background: linear-gradient(90deg, rgba(8, 11, 14, .78) 0%, rgba(8, 11, 14, .55) 42%, rgba(8, 11, 14, 0) 62%); }
      .hand { width: 100%; }
      .og-pitch { position: absolute; left: 66px; top: 182px; z-index: 4; width: 600px; margin: 0; }
      .og-pitch h2 { margin: 0; font-weight: 400; font-size: 50px; letter-spacing: -0.03em; line-height: 1.12; letter-spacing: -0.01em; text-shadow: 0 4px 0 var(--edge), 0 0 24px rgba(0,0,0,.45); }
      .og-pitch h2 em { font-style: normal; color: transparent; background: linear-gradient(100deg, #ffd23f 0%, #ff6fb5 30%, #45cfff 58%, #7dff5c 80%, #ffd23f 100%); -webkit-background-clip: text; background-clip: text; text-shadow: none; filter: drop-shadow(0 4px 0 var(--edge)); }
      .og-pitch p { margin: 16px 0 0; font-size: 21px; line-height: 1.45; color: #d6dfe0; text-shadow: 0 2px 0 var(--edge); }
      .og-chips { display: flex; flex-wrap: nowrap; gap: 7px; margin-top: 16px; white-space: nowrap; }
      .og-chips span { padding: 4px 12px 6px; border-radius: 8px; background: #3a4a52; box-shadow: 0 0 0 2px var(--edge), 0 4px 0 2px var(--edge); font-size: 21px; color: #fff; }
    `,
  });
  await page.evaluate(() => {
    const pitch = document.createElement('div');
    pitch.className = 'og-pitch';
    pitch.innerHTML =
      '<h2>Turn any picture into a <em>rare foil</em> card.</h2><p>Free, in your browser. Your picture never leaves it.</p>' +
      '<div class="og-chips"><span>33 finishes</span><span>Card shapes</span><span>GIF · APNG</span></div>';
    document.querySelector('.stage').appendChild(pitch);
    window.dispatchEvent(new Event('resize'));
  });
  // Let the deal-in finish, then lean the card toward the light.
  await page.waitForTimeout(2600);
  const b = await page.locator('#cardSlot').boundingBox();
  await page.mouse.move(b.x + b.width * 0.92, b.y + b.height * 0.14, { steps: 10 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'public/og.png' });
  await page.close();
}

// ---------- home-screen icons ----------

/**
 * The favicon's pixel card (10×14) on the app's ink with a soft glow, `unit` px per pixel. iOS's icon is
 * square (iOS rounds it); the manifest's `any` icons are rounded here, and the `maskable` ones run edge
 * to edge with the card inside the middle 80 % that every Android shape keeps.
 */
async function icon(file, size, unit, round) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const k = size / 180;
  await page.setContent(`
    <body style="margin:0;width:${size}px;height:${size}px;background:transparent">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center;border-radius:${round ? Math.round(size * 0.22) : 0}px;
      background:radial-gradient(circle at 50% 38%, #3d5058, #1a2328 78%)">
      <svg width="${unit * 10}" height="${unit * 14}" viewBox="0 0 10 14" shape-rendering="crispEdges"
        style="filter:drop-shadow(0 ${Math.round(6 * k)}px 0 #0b1012)">
        <rect width="10" height="14" fill="#161c1f"/>
        <rect x="1" y="1" width="8" height="12" fill="#f3eee2"/>
        <rect x="2" y="2" width="6" height="7" fill="#ff5a4f"/>
        <rect x="2" y="5" width="6" height="4" fill="#1a9cff"/>
      </svg>
    </div>
    </body>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: true });
  await page.close();
}

if (!onlyIcons) await icon('apple-touch-icon.png', 180, 10, false);
await icon('icon-192.png', 192, 10, true);
await icon('icon-512.png', 512, 28, true);
await icon('icon-maskable-192.png', 192, 8, false);
await icon('icon-maskable-512.png', 512, 22, false);

await browser.close();
console.log(onlyIcons ? 'ok: public/icon-*.png' : 'ok: public/og.png, public/apple-touch-icon.png, public/icon-*.png');
