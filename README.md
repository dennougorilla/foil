# FOIL

Turn any picture into a collectible card and give it a rare finish.

**Live:** https://dennougorilla.github.io/foil/

- Bring an image by choosing a file, dropping it anywhere, or pasting (Ctrl+V). It never leaves your browser.
- Pick a finish from the fanned hand at the bottom — each card in the hand is a live preview: Base, Foil, Holographic, Polychrome, Negative, Gold, Prism, Galaxy, Glitch. Keys 1–9 work too.
- Edit the name, line and rarity right in the tag beside the card. Tune the frame, effect strength and pixelation.
- Print the name in ink, deboss, emboss, hot-foil (gold, silver, rose gold, copper, rainbow or any colour) or spot UV. The relief and shine follow the card's tilt and light, in exports too.
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

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Support

If FOIL made you smile: [GitHub Sponsors](https://github.com/sponsors/dennougorilla) · [Buy Me a Coffee](https://buymeacoffee.com/dennougorip)

## License

MIT
