# FOIL

Turn any picture into a collectible card and give it a rare finish.

**Live:** https://dennougorilla.github.io/foil/

- Bring an image by choosing a file, dropping it anywhere, or pasting (Ctrl+V). It never leaves your browser.
- Pick a finish from the fanned hand at the bottom — each card in the hand is a live preview: Base, Foil, Holographic, Polychrome, Negative, Gold, Prism, Galaxy, Glitch. Keys 1–9 work too.
- Edit the name, line and rarity right in the tag beside the card. Tune the frame, effect strength and pixelation.
- The card tilts with your pointer, can be tossed around, and bounces when clicked. Press the logo to shuffle the finish.
- Save a transparent PNG (900×1260) or a 4-second looping clip (MP4/WebM).
- English / 日本語, sound effects and a CRT filter can be toggled. Respects `prefers-reduced-motion`.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
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

## Support

If FOIL made you smile: [GitHub Sponsors](https://github.com/sponsors/dennougorilla) · [Buy Me a Coffee](https://buymeacoffee.com/dennougorip)

## License

MIT
