# FOIL

Turn any picture into a collectible card and give it a rare finish.

**Live:** https://dennougorilla.github.io/foil/

- Bring an image by choosing a file, dropping it anywhere, or pasting (Ctrl+V). Animated GIF, APNG and animated WebP keep moving on the card. It never leaves your browser.
- Pick a finish from the fanned hand at the bottom — each card in the hand is a live preview. The hand starts with seven finishes: the five editions of the game FOIL is modelled on (Base, Foil, Holographic, Polychrome and Negative), plus Prism and Glitch. Keys 1–9 and 0 pick the cards in the hand in order, ← → step through them.
- Every other finish (fifteen more, among them Relief, Warmth, Shadowbox and Shallows below) is a secret and leaves no trace in the UI until it is unlocked. Each time you open one of the support links in the header (GitHub Sponsors or Buy Me a Coffee), one secret still locked, picked at random, quietly joins the hand in this browser (and in its other open tabs); once all are out, nothing more happens. It is an honor system with no payment check. A saved card on a finish that is locked again (site data cleared) goes back to Holographic.
- Relief strikes the picture in metal like a proof coin: the subject stands up as a matte relief in a few flat levels with crisp steps, the background becomes a flat mirror field that flashes as the card tilts, and line work sinks into grooves. Dark pictures are lifted rather than crushed. The frame gets a stamped dot texture and the name a mirror foil on a matte plate. Gold by default; silver is a choice under Light & motion.
- Warmth reacts to touch: untouched, the art is printed as a blue cyanotype in thermochromic ink. Hover with a mouse or drag a finger across it and the ink flushes rose, coral and peach, then turns clear to show the picture in its own colors, and slowly cools back. Press and hold to leave a fingerprint. The card arrives with an unseen finger swiping it once, as a hint. On this finish a drag strokes the card instead of tossing it. Exports play the whole story (cold, a swipe, a press, cooling) and aim the swipe at the busiest part of the picture.
- Shadowbox cuts the picture into paper layers along its depth and stands them up inside a lit box, so the layers slide apart and cast shadows as the card tilts. It reads the picture's depth with a small depth model that runs on your device (WebGPU when available, otherwise WebAssembly). The first time it is chosen it downloads the model once (about 19–27 MB, then cached by the browser); a chip on the card shows the progress. Until then, or if the model can't run, the layers are guessed from color. With the browser's data saver on, it waits until you ask. A cached model is checked again before use, and the model is let go about half a minute after you leave Shadowbox. With an animated picture the layers are cut from one frame, so the back of the box keeps showing the moving picture instead of a painted-out background.
- Shallows sinks the art like a pool floor under a net of sunlight; tilting refocuses it and splits its brightest knots into spectrum, and its ripples loop seamlessly in exports.
- Edit the name, line and rarity right in the tag beside the card.
- The side panel keeps to the main flow: your picture (samples, choose a file, crop and zoom) at the top and one Save button at the bottom, with the format (PNG, GIF, APNG) picked right above it. Everything finer sits behind **Fine-tune**, which stays closed until you open it (and remembers that): four tabs — **Card** (effect strength, frame, pixelation), **Light & motion**, **Lettering** and **Area**. A dot on a tab means something in it differs from the defaults.
- Print the name in ink, deboss, emboss, hot-foil (gold, silver, rose gold, copper, rainbow or any color) or spot UV. The name tag beside the card shows the current lettering and opens the Lettering tab. The relief and shine follow the card's tilt and light, in exports too.
- Choose where the finish goes: the whole card, the art, the frame, the text or nowhere, a band of brightness (highlights only, shadows only…), inverted, and painted in or out with a soft brush while the card holds still. An overlay shows what is left out, and exports follow it.
- Add your own frame colors with the color picker; they stay as swatches for next time (hover or press Delete to remove).
- The card tilts with your pointer, can be tossed around, and bounces when clicked. Press the logo to shuffle the finish.
- **Light & motion** fine-tunes every finish: pattern size and angle, hue, saturation, glare and its focus, light color, glitter, a light that follows the pointer / orbits / stays fixed / follows the phone's gyro, speed, max tilt and idle motion (none, sway, spin, breathe), and the metal of Relief (gold or silver; shown while Relief is on the card). Defaults keep the original look; exports follow the same settings.
- Save a transparent PNG (900×1260), a looping GIF or a full-color transparent APNG loop. With an animated picture, the loop follows its timing. Relief GIFs are dithered so its smooth metal doesn't band in 256 colors.
- The GIF can also drop the backdrop (GIF options under the formats, closed by default). GIF transparency is one bit, so a clear GIF has no shadow and a hard edge; the edge pixels keep the card's border color (Auto) or blend into a matte you pick (white, black or any color) to suit where it will sit. For a soft shadow and edges, save an APNG.
- English / 日本語, sound effects and a CRT filter can be toggled. Respects `prefers-reduced-motion`.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm test         # unit tests (Node's built-in runner)
npm run shoot -- <outDir> [filter]   # with the dev server running: capture the screenshot matrix
npm run e2e      # with the dev server running: check the panel, every export and the secret finishes
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

The Shadowbox finish uses [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small) (Apache-2.0), fetched at run time from the [onnx-community conversion](https://huggingface.co/onnx-community/depth-anything-v2-small) pinned to one revision and checked against its SHA-256, and [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT). The model is not part of this repository. Licenses of the bundled third-party code ship with the site as `THIRD_PARTY_NOTICES.txt` (from `public/`).

## Support

If FOIL made you smile: [GitHub Sponsors](https://github.com/sponsors/dennougorilla) · [Buy Me a Coffee](https://buymeacoffee.com/dennougorip)

## License

MIT
