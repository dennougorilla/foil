# Handoff: Neon (branch `dennougorilla/foil-neon`)

Moved from the Windows desktop to the Mac on 2026-10-05 to lower the desktop's load. WIP commit
`0eaafca` on top of main v0.13.1 (`a66c8dc`). Not merged, no PR, no release.

## What Neon is

New finish **Neon / ネオン**, shader **92**, `id: 'neon'`, in the **Light** pack before its
showpiece (Galaxy → Aurora → Glow → Blacklight → Neon → **Shallows**). The pack placement is
provisional: foil-openall is reorganising packs, so `src/packs.ts` was changed by one id only.

The picture's outlines become colored neon glass tubes in a dark room:

- Outlines are found at two mip scales (`neonEdge` in `src/gl/neon.ts`) as a signed distance in face
  pixels, (value − local mean) / |gradient|, so the tubes have an even thickness. The fine scale
  (lod 2.6) draws tubes; the coarse one (lod 3.9) keeps only big outlines (no texture or small marks)
  and casts the glow. The tone traced is half luma and half max channel, so saturated shapes on dark
  ground get outlines too.
- The gas is the color of the shape it outlines (sampled 18 px towards the bright side), snapped to
  8 neon colors; grey shapes and the paper frame take the whole card's color (pink if grey too).
- Tube: gas column with a white-hot core, a faint glass wall with darker shoulders, a reflection
  streak that slides across the tube and a glass-edge highlight on the side facing the light.
  Tubes are offset by tilt (34 face px at full tilt) as parallax against the wall.
- Room: the picture dimmed and cooled (×0.44, frame ×0.62 of that), light spill near tubes (exp
  falloff), a wide glow (`neonSpread`, lod 5.2), less spill on the frame. No tubes along the card's
  own outer edge; the name and pips are lit as thin neon lettering.
- Flicker (`neonFlicker`): period ≈ 2.4 s fitted to `uLoop` (a whole number per exported loop),
  75 % of cycles pick a point; the tubes of that point's gas within ~0.4 card of it stutter
  (off / on / off / dim). With the clock held still (reduced motion) it is lit.
- Core shader touched only by index: e == 92 covers the frame in full and gets Glow's faint glare.
- No uniforms of its own (the prefix test in `tests/neon.test.ts` guards any added later).
- The low-end "lite" version was dropped by the owner's call (the common quality mechanism covers it).

Docs updated: README (en/ja), docs/features.md (row, paragraph, dither list), docs/packs.md (table,
placement note), docs/layering.md (frame list). i18n: en/ja names and lines.

## Checks

- `npm test`: 159 pass (new `tests/neon.test.ts`; Light list updated in `tests/packs.test.ts`).
- `npm run build`: clean.
- **e2e: not finished.** A new step ("Neon lights the outlines in a dark room, keeps the picture, and
  its loop closes") was added at the end of `scripts/e2e.mjs`, but the run was stopped for the
  handoff before it reached it; only the Raden/Opal step had printed. Run the whole suite again.
  Its thresholds (`tubes > 0.01`, `dim < 0.75`, `keep > 0.4`, `seam < 0.6`) are untested guesses.

## Quality loop (Codex as independent judge, strict, 1–10)

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
