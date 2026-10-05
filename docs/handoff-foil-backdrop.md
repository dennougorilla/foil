# Handoff: foil-backdrop (issue #44, backdrops)

Branch `dennougorilla/foil-backdrop`, from main v0.13.1 (a66c8dc). Work moved from the Windows
desktop to the Mac on 2026-10-05. Design and rules: [`backdrops.md`](backdrops.md).

## Done

- **Docs first:** `docs/backdrops.md` (new), `features.md`, `motion.md`, `performance.md`, both
  READMEs, one line in `AGENTS.md`.
- **Nine backdrops:** Swirl (default), Felt, Studio, Velvet, Bokeh, Stars, Confetti, Plain (color
  picker), Clear. Neon and a synthwave grid were left out (reasons in `backdrops.md`).
- **Code:**
  - `src/backdrop.ts`: the list, the checks for saved values, `backdropPhase` and `swirlTime`.
  - `src/gl/backdrops.ts`: the on-demand shaders.
  - `src/gl/common.ts`: the GLSL helpers, moved out of `shaders.ts` so the backdrops share them.
  - `BackgroundRenderer.use()` and the new uniforms `uPhase`, `uCard`, `uColor`.
  - `stage.ts`: the backdrop now runs on the motion's idle clock; the free-running `bgTime` is gone.
  - `exporter.ts`: `createScene` is now async, reads `ExportInput.backdrop` and has no `bgTime`
    argument. Clear decides whether a file is transparent.
  - `state.ts`: `backdrop` and `backdropColor` are card keys; `gifClear` is removed.
  - UI: tiles in Fine-tune → Card (`buildBackdrops`, CSS in `style.css`) and a backdrop row with a
    link in the GIF/APNG options.
  - APNG now follows the backdrop; its texts changed to match.
- **Tests:** `tests/backdrop.test.ts` (phase agreement between stage and file, seamless loop,
  sanitizing, the shader list) and `gl/backdrops.ts` added to `ON_DEMAND` in `tests/lazy-load.test.ts`.
  `npm test`: 160/160. `npm run build`: OK.
- **e2e (`scripts/e2e.mjs`):** the GIF background step was rewritten for the Clear backdrop, and a
  new step checks that every backdrop closes its loop in a file, that the still ones hold still,
  that Plain shows its color on the stage and in a file, and that Clear is transparent. The first
  step now also checks that `gl/backdrops` isn't fetched up front. Existing `createScene` calls were
  updated (`await`, a `backdrop` argument, `draw(p)`).

## Done on the Mac (2026-10-05)

- Round 1's fixes to the backdrops themselves: Felt's wide oval lamp pool, Studio's wider, lower
  spot and its pool on the floor (the paper turns up under the card's foot), Velvet's broad soft
  folds, Bokeh's soft lights (no hard edge, 1.5 times larger), half as many bright stars, confetti
  at 60%, Plain's default `#182127`, Clear's checker at half the contrast (stage and tile), a soft
  Bokeh tile. Checked in headless Chromium: the card shows on every backdrop after a switch.
- `npm run build` and `npm test` pass.

## Not done

1. **The look is the owner's call now** (no more scoring rounds). Open questions for the owner:
   - **Swirl** (the default) is unchanged: round 1 wanted its bright band toned down.
   - **Picker:** tile pictures closer to the real backdrops (the Swirl tile looks unlike the
     swirl), taller pictures (about 1.4 times), a check mark on the picked tile.
   - Whether to add a quick switch on the stage.
2. **e2e was not run** (by request); the new steps in `scripts/e2e.mjs` have never run to the end.

## Notes

- **Integration with `foil-lowend` (#31, uncommitted when this was written):** it adds
  `BackgroundRenderer.draw(f, q, w, h)`, which redraws a still level only when its "still key"
  (size, colors, place) changes. When merging, add the backdrop's shader (or id) and Plain's color
  to that key, or a backdrop switch at a still level won't show. Its `held` snapshot keeps `time`;
  `phase` must be held too.
- **Integration with `foil-mp4` (#42):** `createScene` is async and `draw(p, sourceMs)` lost its
  `bgTime`, so `mp4Export.ts` needs `await` and the new arguments. MP4 then gets the backdrop as
  well; no MP4 has a transparent background (Clear is drawn as the transparent frame on black, so
  check this).
- **Behavior changes for users:**
  - An APNG used to be always transparent. It now follows the backdrop (default: Swirl), as the
    issue asks (files show the same backdrop). Transparency comes from choosing Clear.
  - The swirl on the stage no longer turns on its own clock; it breathes once per loop, the same
    as in a file (`SWIRL_BREATH = 1.2`).
- **Sizes:**
  - First-load entry: 67.89 → 68.60 kB gzip. Language chunks: +0.24 kB (en), +0.29 kB (ja).
  - On-demand backdrops chunk: 2.99 kB gzip.
  - To cut size, drop `backdropHelp` (the tile tooltips).
  - Holo with Sway: GIF 4.5–4.9 MB, APNG 6.3–6.8 MB on any backdrop (Swirl about +7% over Plain).
    The APNG size estimate was left as it is.
- **No quick switch on the stage** (reasons in `backdrops.md`). The owner may want one; if so, a
  row in the motion tray is the least intrusive place.
- **GLSL:** `half` is a reserved word.
- **Imports:** modules that the Node tests import (`backdrop.ts`, `gl/backdrops.ts`) must import
  with a `.ts` extension.
- **Ports:** 5410 was taken by another session (foil-release-v014's dev server), so the review
  server never started on it. Pick a free port on the Mac.
