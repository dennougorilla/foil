# AGENTS.md

Instructions for coding agents working on FOIL. `README.md` describes the product, development and release commands; `docs/features.md` holds the detailed behavior.

A new finish always goes into a pack (its shader in that pack's module, never the core card shader); `docs/packs.md` says how, and how the pack opening is designed. A new backdrop goes into `src/gl/backdrops.ts` and must close its loop (`docs/backdrops.md`). The service worker (`src/sw.ts`, built by `vite.config.ts`) keeps every file of the build for offline use except those listed in `src/swFiles.ts`; a new file that must not be kept offline goes on that list (`docs/pwa.md`). The card comes in several shapes, so nothing may assume the 5 : 7 card: shaders read `uCardK` and `uArt`, layouts size cards with `src/card/shape.ts`.

Interface texts (Japanese and English) use the names and writing rules in `docs/glossary.md`: one name for each thing, in both languages.

## Slow devices

Nothing new needs a light version of its own. The drawing levels in `src/quality.ts` lower the card canvases' resolution, still the backdrop and the page's endless CSS loops, cut the sparks and drop the CRT lines for the whole page (`docs/performance.md`); draw backdrops through `BackgroundRenderer.draw` and put loading indicators under `[aria-busy]` or `.is-waiting` (they keep moving). After adding a finish, a backdrop or anything drawn on every frame, run `npm run perf` (with the dev server running) and look only at what it lists as over budget.

## Premise

FOIL is under active development (pre-1.0). **Do not keep backward compatibility or write data migrations.** Remove old formats, old APIs and compatibility branches instead of carrying them, and always rewrite toward the ideal, simplest (KISS) code. When saved settings (`localStorage`) or stored images (IndexedDB) no longer match the current shape, discard them and start from defaults instead of migrating.

## Development cycle

Work in this order for every change:

1. **Update the documents first.** Change the documents that describe the behavior you are about to change (`README.md`, this file, any notes) before touching code, and make sure nothing in them is contradictory or out of date.
2. **Write the tests first (TDD).** Express the expected behavior as a failing test, then implement.
3. **Implement the minimum.** Write only what the tests need. No speculative generalization, options or abstractions.
4. **Do a final check.** Look for code, tests and documents that are no longer used, and for places where the documents and the code disagree. Delete or fix them, and note what you checked in the pull request.
