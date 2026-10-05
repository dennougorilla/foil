# Handoff: Rainy Window (branch `dennougorilla/foil-rain`)

New finish 「雨の窓 / Rainy Window」, shader **94**, in the **Nature** pack before Magma (a temporary
choice; foil-openall is reorganising the packs, so `src/packs.ts` was touched by one id only). Branched
from main v0.13.1 (a66c8dc). The WIP commit (e148b0a) holds everything below.

## Done

- **Docs first:** README (en/ja: 34 finishes, Nature row), `docs/features.md` (table row, a paragraph,
  layer-2 and GIF-dither lists, the flick note), `docs/packs.md` (Nature reveal order; Nature and
  Studio are now the packs of six).
- **Shader** `src/gl/rain.ts` (`RAIN_GLSL`, `RAIN_SHADER = 94`, no imports so tests read it). Helpers
  are prefixed `rn…`. It declares no uniforms of its own; it reads the touch field (`uHeat`, `uPrints` from
  `TOUCH_GLSL`) plus core uniforms (`uTime`, `uLoop`, `uLight`, `uCardK`).
  - Fog: 8-tap two-ring blur on the face mipmaps, a cool milky veil, uneven density (thicker low),
    a faint mist of micro droplets lit toward the light. Fog only on the art (12 % on the frame).
  - Beads: two offset grids (big sparse, small), clustered by a low-frequency noise.
  - Running drops: two column layers, each drop once per `rnPeriod(6)` cycle (divides the loop:
    the same as Confetti's `cePeriod`), jerky descent (`rnSlide`), a trail that clears the fog and
    leaves shrinking beads.
  - Inside a drop: the picture sampled sharp through a lens offset, thin dark rim (top), pale upper
    reflection, caustic on the far side, a highlight scaled by drop size (no star field).
  - Glass parallax: drop layer shifted by `t * 0.012`.
- **Touch:** new `TouchKind` `'rain'` in `src/touch/heat.ts` (spread 0.4, cool 0.3, loss 0.02,
  prints on; `AUTO_STILL.rain = 0.3`). The edition has `touch: 'rain'`, so drag = wipe, the arrival
  hint wipe, the unseen finger per export loop and "not layer 2" all come from the existing touch path.
  Nature's module now splices `TOUCH_GLSL` and binds a `HeatLayer` on texture unit 6.
- Edition entry (`dither: true`), i18n en/ja names and looks, Speed always shown (`tune/panel.ts`).
- **Tests:** `tests/rain.test.ts` (edition/pack/shader 94, wipe path, fog returns in ~10 s,
  fingerprint, AutoTouch loop seam, uniform prefix, dispatch line); packs and layering lists updated.
  Unit tests 160/160, `npm run build` OK.
- **e2e:** new step "Rainy Window fogs the picture but keeps it…" (exporter-based: sharpness ratio,
  correlation, ≥3 of 36 tiles sharper after the wipe, drops move, loop seam for None and Heartbeat;
  then on the stage under reduced motion the card settles completely). It **passes on its own**
  (fogged 0.624, 4 tiles cleared, keep 0.831, drops 0.547, seam 0.000). Layer-chip exclusion list
  includes `rain`. `scripts/shoot.mjs` lists it.

## Remaining

1. **Full `npm run e2e` not run.** The owner chose review over e2e for now (the machine was too loaded).
   The new step passed on its own earlier; run the full suite before a release.
2. **Look and direction:** the owner reviews the finish by eye and decides the direction; the strict
   scoring loop is stopped (3 rounds done, round 3's fixes not re-scored). Open ideas: fewer beads,
   trails a touch more visible on bright skies, the pixel-art sample's dither shows through the fog,
   a wipe over a dark sky reads as a dark patch more than as glass wiped clear.
3. ~~Unused `L` parameter of `rain()`~~ removed (Mac session).
4. Final check per AGENTS.md (unused code/docs), the hand-preview build for the owner, and the
   decision on the final pack (foil-openall).
5. The "light version for low-end Android" was dropped by the owner (handled globally), so there is
   no `lite` path. Nothing about it remains in code or docs.

## Notes / pitfalls

- Hand preview for review (**do not commit**): `OPEN_EDITIONS` and the default `hand` in
  `src/state.ts` with `'rain'` in place of `'glitch'`, `edition: 'rain'`, and
  `if (id === 'rain') return true;` at the top of `available()` in `src/packs.ts`. Remove it before
  running e2e (first-visit steps check that no pack loads).
- Shots: GPU headless Chromium (`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`) with
  `?quality=0`; a mouse over the card wipes it, so tilt shots use the Lean motion (set via
  `localStorage['foil:v1'] = {edition:'rain', tune:{idle:'lean'}}`). A generated night-city photo
  shows the finish far better than the pixel-art sample.
- The first capture after editing `src` sometimes crashed (dev-server reload); rerun.
- The wipe edge noise is below the threshold, so a cold field draws no wipe at all (reduced motion
  settles completely ~11 s after the arrival hint).
- Review port 5403 (dev and the planned preview build) — nothing is running now.

## Score history (Codex, strict; A realism / B clearly effective / C not cheap / D picture survives)

| Round | A | B | C | D | Main points fixed after it |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 | 7 | 4 | 6 | drops too black, trails like ribbons, uniform beads, hard wipe, flat fog |
| 2 | 4 | 6 | 4 | 7 | star field of highlights, big drops luminous, dark trails, muddy blur, angular wipe |
| 3 | 4 | 6 | 4 | 6 | fewer/varied beads, smaller highlights, 25 % less blur, residual haze in the wipe, fainter print |
