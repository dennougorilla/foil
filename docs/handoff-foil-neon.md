# Handoff: Neon (branch `dennougorilla/foil-neon`)

Moved from the Windows desktop to the Mac on 2026-10-05 to lower the desktop's load. WIP commit
`0eaafca` on top of main v0.13.1 (`a66c8dc`). Not merged, no PR, no release.

## What Neon is

New finish **Neon / ネオン**, shader **92**, `id: 'neon'`, in the **Light** pack before its
showpiece (Galaxy → Aurora → Glow → Blacklight → Neon → **Shallows**). The pack placement is
provisional: foil-openall is reorganising packs, so `src/packs.ts` was changed by one id only.

The picture's main outlines become a neon sign in a dark room (since polish round 2):

- The sign is laid out on the CPU from each new face (`src/gl/neonMap.ts`, pure and unit-tested in
  `tests/neonMap.test.ts`; GPU side in `src/gl/neonGL.ts`, a layer of the Light pack like Relief's
  map in the Metal pack). Iso-lines of a blurred picture (brightness and two color-opponent
  channels) are traced by marching squares, kept inside the art window, smoothed heavily, and the
  strongest long runs taken greedily (score length^1.5 × contrast; at most 6, each at least 0.18 of
  the short side); anything within 3.4 tube widths of a tube already taken, or doubling back along
  itself, is cut away. Closed outlines open with a short gap at their lowest point. One gas per tube
  from its brighter, more colorful side. A border tube runs round the art window in the frame with
  one break near the top right, in a color that differs from the art tubes.
- Two float maps go to the shader: the tube map (3 face px cells: distance to the nearest centre
  line, arc length along it, tube index) and the wall map (10 px cells: the colored light the tubes
  pool on the wall, a line of lamps at two heights, and the tube lighting it most). Uniforms
  `uNeonGas[8]`, `uNeonLen[8]`, `uNeonPost[40]` (post positions), `uNeonInfo`; texture units 5 and 11.
- The shader draws each tube as a white core (~30 % of the width), saturated glass with a darker rim,
  a room reflection on the side facing the light and an inverse-square halo; electrode sleeves at the
  ends; clips at posts, the posts as rods from wall to tube and a soft shadow round their feet. The
  wall is the picture at ~10 % plus the pooled light. Tubes are offset by tilt (54 face px at full
  tilt) against the wall, posts and pools.
- Flicker (`neonFlicker`): one tube per cycle (period ≈ 2.4 s fitted to `uLoop`); its pool dims too.
- Core shader touched only by index: e == 92 covers the frame in full and gets Glow's faint glare.
- The low-end "lite" version was dropped by the owner's call (the common quality mechanism covers it).
- Analysis cost: about 50–90 ms per new face on the Mac (throttled to one per 160 ms on the stage;
  typing the name does not re-run it).

Docs updated: README (en/ja), docs/features.md (row, paragraph, dither list), docs/packs.md (table,
placement note), docs/layering.md (frame list). i18n: en/ja names and lines.

## Checks

- `npm test`: 159 pass (new `tests/neon.test.ts`; Light list updated in `tests/packs.test.ts`).
- `npm run build`: clean.
- e2e: **not run, by the owner's call** ("e2e fits this project too badly; review first"). The step
  "Neon lights the outlines in a dark room, keeps the picture, and its loop closes" stays at the end
  of `scripts/e2e.mjs`; its thresholds (`tubes > 0.01`, `dim < 0.75`, `keep > 0.4`, `seam < 0.6`)
  are still untested guesses.
- Mac (2026-10-05): build and `npm test` (159) pass again; the production build renders Neon in
  headless Chromium (SwiftShader) with no console errors, sunset and moon samples.

## Quality loop (Codex as independent judge, strict, 1–10)

The scoring loop is closed: the owner now looks at a new finish first and sets its direction.

| Round | Realism | Clarity | Quality | Picture kept |
|---|---|---|---|---|
| 1 | 4 | 6 | 5 | 7 |
| 2 | 4 | 6 | 5 | 6 |
| 3 (with a smooth illustration added) | 4 | 5 | 5 | 7 |

After round 3 (the last allowed), two fixes went in without another judged round: gas taken from
the bright side (removed the colored fringes, e.g. a lime ring round an orange cat) and a dimmer
frame tube. The scores plateaued; what the judge kept asking for:

1. Tubes read as "edge detection" more than glass tubing. On the three built-in samples (pixel art)
   the tubes follow stair-steps. A cleaner tube profile/distance field might help.
2. Clutter from small edges (stars, water sparkle in the moon sample).
3. Tilt response is too subtle in stills (the card's pose change dominates).
4. Dimmed interiors look flat/muddy; the spill could follow tube emission more locally.
5. Flicker is hard to read in stills (needs a moving check).

## How to look at it

- Temporary preview change, **never commit**: in `src/packStore.ts` `read()`, merge
  `{ opened: ['light'], supporter: false }` into the saved packs; in `src/state.ts` defaults set
  `edition: 'neon'` and put `'neon'` in `hand`. Then the app opens on Neon.
- The review server was meant to be a production build on port 5402 (`--host 0.0.0.0`). It is not
  running now.
- Capture scripts used (not in the repo): GPU headless Chromium (`--use-angle=d3d11 --enable-gpu
  --ignore-gpu-blocklist` on Windows), reduced motion, front plus pointer at (0.08, 0.1) and
  (0.92, 0.88) of `#cardSlot`, per sample plus a smooth 900 × 1200 illustration; the GIF through
  `#formatSeg [data-format=gif]` + `#saveBtn` (90 frames, 70 ms, sway).

## Pitfalls seen

- A backtick inside a GLSL comment breaks the TS template literal (build error).
- A local variable named `face` would shadow the core `face()` sampler; names are prefixed `neon`.
- The first page load after a shader edit on the dev server sometimes came up unstyled; reload.
- e2e imports `/src/...` directly, so restart the dev server before e2e and don't edit sources while
  it runs (HMR reloads the page).

## Polish round 1 (2026-10-06, Mac)

Owner's feedback: "完成度上げればかなり良さそう" (good direction, raise the finish). Real neon, as
aimed for: even glass tubes in smooth bends (no stair-steps), a white-hot core in saturated glass,
a tight saturated bloom, colored light pooling on a dark wall behind, electrodes where the gas
stops and standoffs holding the tube off the wall, and a dark board round it.

- Tubes are traced at lod 4 / 5 (was 2.6 / 3.9) through `neonPath`, so pixel-art steps and fine
  texture (stars, feathers) no longer become tubes.
- The room is much darker (picture ×0.12–0.32 with a soft room light on `uLight`, slight contrast
  curve), the frame a darker board; the wide haze is halved and the light pools on the wall line
  behind each tube (from the tube's own distance field), lighting the picture's colors there.
- Parallax 44 face px: the tube slides off its pool and off its standoff posts as the card tilts.
- Electrode caps at tube ends; standoffs (post + clip) from a 120 px hashed grid, projected onto the
  nearest tube.
- Still open: short tube fragments along the art window's sides on the moon sample; overlapping
  tubes in the moon's water read busy.

## Polish round 2 (2026-10-06, Mac)

Judge after round 1: tubes still read as edge detection (varying width, blobs, rainbow color along one
outline), glass looks like smeared light, electrodes/standoffs look like glitches, wall murky,
border tube a flat UI glow, tilt too subtle. Rebuilt the tube layout on the CPU as stroke paths (see
above) instead of a per-pixel band of the gradient: constant width, round ends, one gas per tube,
at most 6 + border. Three-layer glass, clear electrode sleeves, posts as rods with shadowed feet,
near-black wall lit by inverse-square pools, a border tube with a break and a falloff along it,
stronger parallax. The faint horizontal scanlines in earlier screenshots are the app's CRT overlay
(the CRT toggle), not the finish; the round 2 shots turn it off.
