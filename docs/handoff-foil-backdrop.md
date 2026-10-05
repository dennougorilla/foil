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

## Not done

1. **Run the whole e2e suite.** On Windows it was reaped for low memory before it finished, so
   nothing in it has been verified, including the new steps.
2. **Judging rounds 2 and 3** (criterion: does the card look its best, and does it not look cheap).
   Round 1 scored **5.5 / 10** overall and **6.0** for the picker. Per backdrop: Swirl 4.5, Felt 6.5,
   Studio 6.5, Velvet 6.0, Bokeh 4.0, Stars 6.0, Confetti 5.0, Plain 7.0, Clear 6.0. Its fixes,
   most important first:
   - The judge saw no card on Felt and Stars in the desktop shots. That is very likely my capture
     script screenshotting before a pack finish (Gold, Galaxy) had loaded, but **check on a real
     screen** that the card always shows after switching backdrops.
   - **Swirl:** bring its bright band about halfway toward the dark tone. Note that the swirl is
     also the default; how far to tone it down is the owner's call.
   - **Bokeh:** drop the hard disc edge for a smooth radial falloff, make the lights about 1.5 times
     larger and about half as bright.
   - **Stars:** half as many bright stars. **Confetti:** pieces at about 60% of their size.
   - **Plain:** default color about `#182127`. **Clear:** half the checker contrast (`#20262a` /
     `#262c30`).
   - **Felt:** a wide oval light round the card. **Studio:** a wider, lower spot with a pool of
     light on the floor. **Velvet:** a broad, soft light instead of thin bright streaks.
   - **Picker:** pictures closer to the real backdrops (the Swirl tile looks unlike the swirl),
     pictures about 1.4 times taller, a check mark and darker text on the picked tile, a lighter
     lip on the tiles.
3. **Final check** (AGENTS.md step 4), a commit numbered for the issue, and dropping "WIP".

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
