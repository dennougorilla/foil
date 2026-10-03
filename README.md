# FOIL

Turn any picture into a collectible card and give it a rare finish.

**Live:** https://dennougorilla.github.io/foil/

- Bring an image by choosing a file, dropping it anywhere, or pasting (Ctrl+V). Animated GIF, APNG and animated WebP keep moving on the card. It never leaves your browser.
- Pick a finish from the fanned hand at the bottom — each card in the hand is a live preview: Base, Foil, Holographic, Polychrome, Negative, Gold, Prism, Galaxy, Glitch, Aurora, Frost, Magma, Halftone, Crystal, Sakura, Shadowbox (the picture is cut into paper layers along its depth and stood up inside a lit box, so the layers slide apart and cast shadows as the card tilts). Keys 1–9 and 0 pick the first ten, ← → step through them all.
- Shadowbox reads the picture's depth with a small depth model that runs on your device (WebGPU when available, otherwise WebAssembly). The first time it is chosen it downloads the model once (about 19–27 MB, then cached by the browser); a chip on the card shows the progress. Until then, or if the model can't run, the layers are guessed from color. With the browser's data saver on, it waits until you ask.
- Opening one of the support links in the header quietly adds a few extra finishes to the hand in this browser, as a thank-you. It is an honor system with no payment check.
- Edit the name, line and rarity right in the tag beside the card. Tune the frame, effect strength and pixelation.
- Print the name in ink, deboss, emboss, hot-foil (gold, silver, rose gold, copper, rainbow or any color) or spot UV. The name tag beside the card shows the current lettering and jumps to its controls (last in Tune). The relief and shine follow the card's tilt and light, in exports too.
- Choose where the finish goes: the whole card, the art, the frame, the text or nowhere, a band of brightness (highlights only, shadows only…), inverted, and painted in or out with a soft brush while the card holds still. An overlay shows what is left out, and exports follow it.
- Add your own frame and backdrop colors with the color picker; they stay as swatches for next time (hover or press Delete to remove).
- The card tilts with your pointer, can be tossed around, and bounces when clicked. Press the logo to shuffle the finish.
- **Light & motion** (in Tune) fine-tunes every finish: pattern size and angle, hue, saturation, glare and its focus, light color, glitter, a light that follows the pointer / orbits / stays fixed / follows the phone's gyro, speed, max tilt and idle motion (none, sway, spin, breathe). Defaults keep the original look; exports follow the same settings.
- Save a transparent PNG (900×1260), a looping GIF, a full-color transparent APNG loop, or a 4-second clip (MP4/WebM). With an animated picture, the loop follows its timing.
- English / 日本語, sound effects and a CRT filter can be toggled. Respects `prefers-reduced-motion`.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm test         # unit tests (Node's built-in runner)
npm run shoot -- <outDir> [filter]   # with the dev server running: capture the screenshot matrix
```

Rendering is WebGL2 (swirl backdrop, cards, particles). Shaders live in `src/gl/shaders.ts`; the card face is composed in `src/card/face.ts`.

Pushes to `main` and pull requests are type-checked and built by `.github/workflows/ci.yml`; they do not deploy.

## Releasing

```sh
npm run release -- patch            # or minor / major / an exact x.y.z; add --dry-run to only run the checks
```

From a clean `main` that is up to date with `origin`, this builds, bumps the version (commit + tag `vX.Y.Z`) and pushes both. The tag runs `.github/workflows/release.yml`, which deploys to GitHub Pages and publishes a GitHub Release with auto-generated notes (grouped by PR label, see `.github/release.yml`) and the built site as a zip. To redeploy without a release, run the Release workflow by hand from the Actions tab.

The build exposes `__APP_VERSION__` and `__APP_COMMIT__` (short SHA) as globals.

## Inspiration

FOIL is an unofficial fan project inspired by the card editions in [Balatro](https://www.playbalatro.com/) by LocalThunk. It is not affiliated with, or endorsed by, LocalThunk or Playstack. No code, art, fonts or other assets from the game are used.

Balatro is a registered trademark of LocalThunk LLC.

## Third-party

The Shadowbox finish uses [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small) (Apache-2.0), fetched at run time from the [onnx-community conversion](https://huggingface.co/onnx-community/depth-anything-v2-small) pinned to one revision and checked against its SHA-256, and [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT). The model is not part of this repository.

## Support

If FOIL made you smile: [GitHub Sponsors](https://github.com/sponsors/dennougorilla) · [Buy Me a Coffee](https://buymeacoffee.com/dennougorip)

## License

MIT
