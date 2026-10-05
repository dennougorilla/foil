# FOIL

[![FOIL — turn any picture into a collectible card with a rare finish](public/og.png)](https://dennougorilla.github.io/foil/)

Turn any picture into a collectible card and give it a rare foil finish.

**Try it:** https://dennougorilla.github.io/foil/

English · [日本語](README.ja.md)

## What it does

- **Any picture.** Open a file, drop it or paste it. Animated GIF, APNG and WebP keep moving on the card.
- **Pixel art.** Draw the whole card as chunky pixel art with few colors and a dark outline, from three presets or your own coarseness, colors, outline and dither. The finish's light steps on the same pixels, and files are saved the same way.
- **33 finishes.** Holographic, Polychrome, Negative and the other editions of the game FOIL is modelled on, plus metal, light, nature and studio finishes. Each one reacts to tilt and light.
- **Packs.** Seven finishes come in the starting hand; the rest come in theme packs you tear open once. Each pack holds its whole theme, with no random draws.
- **Hand and deck.** Pick finishes from a fanned hand of up to seven live previews; the others wait in the deck, which you edit like a card game's deck screen.
- **Card shapes.** Trading card, wide, square, postcard (upright or on its side) and business card. Frames include Gold rim and Ribbon for celebration cards.
- **Message and trading-card layout.** Up to four lines of text in four typefaces, a trading-card layout with a type line and card text, a print of its own for each piece of text (ink, deboss, emboss, hot foil, spot UV), and free placement by drag.
- **Layers.** Put two finishes on one card, each in its own place (art, frame, name, highlights, or painted with a brush).
- **Binder.** Keep cards in a binder of six pages that lives in this browser; drag them between pockets and bring any of them back to the stage.
- **Share.** On phones, send the card as a moving GIF straight to the share sheet (X, LINE and the like).
- **Export.** Save a transparent PNG, a looping GIF or a full-color transparent APNG. The loop is what the card does on screen: pick one of 20 motions in four groups and the file moves just like that.
- **Phones.** The card tilts with the device's motion sensor, and a phone held upright shows the card first, nearly edge to edge.

Every detail, finish by finish: [`docs/features.md`](docs/features.md).

## Finishes and packs

| Where | Finishes |
| --- | --- |
| Starting hand | Base, Foil, Holographic, Polychrome, Negative, Prism, Glitch |
| Metal pack | Relief, Gold, Platinum, Cosmo Holo, Crystal |
| Light pack | Galaxy, Aurora, Glow, Blacklight, Shallows |
| Nature pack | Sakura, Frost, Stardust, Snow Globe, Magma |
| Studio pack | Halftone, Warmth, Stained Glass, Flip Lenticular, 3D Lenticular, Shadowbox |
| Supporter pack | Opal, Raden, Confetti, Fireworks, Kintsugi |

33 finishes in all. The Supporter pack appears in the pack shop after you open one of the support links once. It is an honor system: there is no payment check. How packs and their opening are designed: [`docs/packs.md`](docs/packs.md).

## Privacy

- Your pictures never leave your browser. FOIL is a static site with no server of its own: no accounts, no uploads, no analytics.
- Settings, opened packs, your current picture and the binder are kept in this browser's storage (localStorage and IndexedDB) and nowhere else.
- Share hands the GIF straight from the page to your device's share sheet. Nothing is uploaded and the card is never put in a link.
- The page loads its interface typefaces from Google Fonts, and the message typefaces too once a message is used.
- Shadowbox and 3D Lenticular download a depth model (about 19–27 MB) from Hugging Face the first time one of them is chosen. The file is pinned to one revision and checked against its SHA-256; the picture itself is read on your device.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm test         # unit tests (Node's built-in runner)
npm run shoot -- <outDir> [filter]   # with the dev server running: capture the screenshot matrix
npm run e2e      # with the dev server running: check the panel, every export, the packs, the binder, sharing and the phone stage
npm run og       # with the dev server running: render public/og.png and the home-screen icon
node scripts/layering-check.mjs [--measure]   # with the dev server running: single finishes unchanged pixel for pixel (against a reference URL), and the cost of a second finish
```

Rendering is WebGL2 (swirl backdrop, cards, particles). The card shader's core and the seven open finishes live in `src/gl/shaders.ts`, each pack's finishes in `src/gl/finishes/` (see [`docs/packs.md`](docs/packs.md) for adding one); the card face is composed in `src/card/face.ts`, its shapes are listed in `src/card/shape.ts`. Shaders never assume the 5 : 7 card: `uCardK` is the face's size in units of its short side ((1, 1.4) on the trading card) and `uArt` the art window in face uv. Design notes: [`docs/tcg.md`](docs/tcg.md) (trading-card layout), [`docs/arrange.md`](docs/arrange.md) (free placement), [`docs/layering.md`](docs/layering.md) (layers), [`docs/binder.md`](docs/binder.md) (binder).

Pushes to `main` and pull requests are type-checked and built by `.github/workflows/ci.yml`; they do not deploy.

## Releasing

```sh
npm run release -- patch            # or minor / major / an exact x.y.z; add --dry-run to only run the checks
```

From a clean `main` that is up to date with `origin`, this builds, bumps the version (commit + tag `vX.Y.Z`) and pushes both. The tag runs `.github/workflows/release.yml`, which deploys to GitHub Pages and publishes a GitHub Release with auto-generated notes (grouped by PR label, see `.github/release.yml`) and the built site as a zip. To redeploy without a release, run the Release workflow by hand from the Actions tab. The build exposes `__APP_VERSION__` and `__APP_COMMIT__` (short SHA) as globals.

## Inspiration

FOIL is an unofficial fan project inspired by the card editions in [Balatro](https://www.playbalatro.com/) by LocalThunk. It is not affiliated with, or endorsed by, LocalThunk or Playstack. No code, art, fonts or other assets from the game are used.

Balatro is a registered trademark of LocalThunk LLC.

## Third-party

The Shadowbox and 3D Lenticular finishes use [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small) (Apache-2.0), fetched at run time from the [onnx-community conversion](https://huggingface.co/onnx-community/depth-anything-v2-small) pinned to one revision and checked against its SHA-256, and [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT). The model is not part of this repository. The typefaces (DotGothic16, Silkscreen, Yusei Magic, Shippori Mincho and Mochiy Pop One, all SIL Open Font License) are served by Google Fonts. Licenses of the bundled third-party code ship with the site as `THIRD_PARTY_NOTICES.txt` (from `public/`).

## Support

If FOIL made you smile: [GitHub Sponsors](https://github.com/sponsors/dennougorilla) · [Buy Me a Coffee](https://buymeacoffee.com/dennougorip)

## License

MIT. See [`LICENSE`](LICENSE).
