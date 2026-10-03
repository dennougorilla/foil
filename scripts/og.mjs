// Renders the share images from the running app: node scripts/og.mjs (needs `npm run dev`).
//   public/og.png               1200×630 Open Graph / Twitter card
//   public/apple-touch-icon.png 180×180 home-screen icon (the pixel card favicon)
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// ---------- og.png ----------

{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${URL}?lang=en`);
  // Recompose the live app as a poster: logo and pitch on the left over the fanned hand,
  // the card large on the right. The WebGL stage follows the DOM boxes, so CSS is enough.
  await page.addStyleTag({
    content: `
      .app { display: block; height: 100vh; }
      .panel, .toggles, .info, .hand-hint, .hand-caption, .stage-pick, .toasts { display: none !important; }
      .stage { position: fixed; inset: 0; padding: 0; display: block; }
      .showcase { position: absolute; inset: 0; display: block; }
      .card-slot { position: absolute; right: 118px; top: 46px; height: 538px; max-height: none; }
      .top { position: absolute; left: 64px; top: 58px; padding: 0; z-index: 4; }
      .logo-word { zoom: 2.6; pointer-events: none; }
      .logo-word .tile { animation: none; }
      .logo-word .spark { animation: none; opacity: 1; transform: scale(1); }
      .logo-word .spark:nth-of-type(4) { display: none; }
      .hand-wrap { position: absolute; left: 22px; bottom: 6px; width: 660px; }
      .hand { width: 100%; }
      .og-pitch { position: absolute; left: 66px; top: 190px; z-index: 4; width: 560px; margin: 0; }
      .og-pitch h2 { margin: 0; font-weight: 400; font-size: 46px; line-height: 1.12; letter-spacing: -0.01em; text-shadow: 0 4px 0 var(--edge), 0 0 24px rgba(0,0,0,.45); }
      .og-pitch h2 em { font-style: normal; color: var(--gold); }
      .og-pitch p { margin: 16px 0 0; font-size: 21px; line-height: 1.45; color: #d6dfe0; text-shadow: 0 2px 0 var(--edge); }
    `,
  });
  await page.evaluate(() => {
    const pitch = document.createElement('div');
    pitch.className = 'og-pitch';
    pitch.innerHTML = '<h2>Turn any picture into a <em>rare foil</em> card.</h2><p>Holo, polychrome, gold, prism and more.<br>Free, right in your browser.</p>';
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

// ---------- apple-touch-icon.png ----------

{
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  // Same pixels as the favicon (a 10×14 card), centred on the app's ink with a soft glow.
  await page.setContent(`
    <body style="margin:0;width:180px;height:180px;display:grid;place-items:center;
      background:radial-gradient(circle at 50% 38%, #3d5058, #1a2328 78%)">
      <svg width="100" height="140" viewBox="0 0 10 14" shape-rendering="crispEdges"
        style="filter:drop-shadow(0 6px 0 #0b1012)">
        <rect width="10" height="14" fill="#161c1f"/>
        <rect x="1" y="1" width="8" height="12" fill="#f3eee2"/>
        <rect x="2" y="2" width="6" height="7" fill="#ff5a4f"/>
        <rect x="2" y="5" width="6" height="4" fill="#1a9cff"/>
      </svg>
    </body>`);
  await page.screenshot({ path: 'public/apple-touch-icon.png' });
  await page.close();
}

await browser.close();
console.log('ok: public/og.png, public/apple-touch-icon.png');
