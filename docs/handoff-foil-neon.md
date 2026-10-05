# Handoff: Neon (branch `dennougorilla/foil-neon`)

Moved from the Windows desktop to the Mac on 2026-10-05 to lower the desktop's load. WIP commit
`0eaafca` on top of main v0.13.1 (`a66c8dc`). Not merged, no PR, no release.

## What Neon is

New finish **Neon / ネオン**, shader **92**, `id: 'neon'`, in the **Light** pack before its
showpiece (Galaxy → Aurora → Glow → Blacklight → Neon → **Shallows**). The pack placement is
provisional: foil-openall is reorganising packs, so `src/packs.ts` was changed by one id only.

The picture's main shapes become a neon sign in a dark room. This list is as of polish round 3 and
kept as history; the second polish cycle (at the end of this note) replaced the layout and the look:

- The sign is laid out on the CPU from each new face (`src/gl/neonMap.ts`, pure and unit-tested in
  `tests/neonMap.test.ts`; GPU side in `src/gl/neonGL.ts`, a layer of the Lab pack (units 12 and 13) like Relief's
  map in the Metal pack). The blurred picture (brightness and two color-opponent channels) is split
  into 5 k-means color regions; each region's outline is traced by marching squares, kept inside
  the art window, smoothed heavily, cut where it bends tighter than 1.5 tube widths, and the
  strongest runs taken greedily (score length^1.5 × contrast² × 2.2 if closed; at most 6, each at
  least 0.18 of the long side). A small strong spot (an eye) gets a ring first. Anything within 2.5
  tube widths of a tube already taken, or doubling back along itself, is cut away; broken pieces of
  one gas are joined; corner/edge stubs and lone short tubes are dropped. Closed outlines open with a
  short gap at their lowest point. One gas per tube from its brighter, more colorful side. A border
  tube runs round the art window in the frame with one break near the top right, in a color that
  differs from the art tubes.
- Two float maps go to the shader: the tube map (3 face px cells: distance to the nearest centre
  line, arc length along it, tube index; reach 110 px) and the wall map (10 px cells: the colored
  light the tubes pool on the wall, a line of lamps at two heights, and the tube lighting it most).
  Uniforms `uNeonGas[8]`, `uNeonLen[8]`, `uNeonPost[40]` (post positions), `uNeonInfo`; texture
  units 12 and 13 since the second cycle (as in review-v015's Lab module; 5 is Relief's, 6 Glow's).
- The shader draws each tube (0.025 S wide) as a cream core (~15 % of the width) in a thick body of
  saturated glass with a softer rim and one sharp highlight on the lit side, a tight and a wide
  halo; electrode sleeves at the ends; posts as small clear discs with a contact shadow. The wall is
  the picture at ~4–6 % plus the pooled light; the border tube burns at 62 %. Tubes are offset by
  tilt (16 face px at full tilt) against the wall, posts and pools.
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

## Polish round 3 (2026-10-06, Mac)

Judge after round 2: tubes read as thin vector lines (mostly white core, color only in the halo),
the wall light covered too much, clips every 80–120 px and grey "thorn" posts when tilted, a double
pink border that tore off the card edge (54 px slide), and tubes placed where outlines happen to be
(meaningless loops, stray stubs, a partial bar over the sun, a broken hill, a scribble on the moon's
water). Changes:

- Layout (`neonMap.ts`): outlines of k-means color regions (5) instead of iso-lines of the shading;
  closed outlines count double and score by length^1.5 x contrast^2; a ring round a small strong spot
  (an eye) laid first; a minimum bend radius of 1.5 tube widths cuts curls; short straight bars,
  corner/edge stubs and lone short tubes dropped; one-gas pieces whose ends face each other across
  a short gap joined (never across another tube); minimum length 0.18 of the long side.
- Look (`neon.ts`): tube 0.025 S wide (was 0.015), cream core ~15 %, saturated body, softer rim,
  one sharp highlight on the lit side; tight + wide halos; wall ~4–6 % far from tubes; border tube
  at 62 %; slide 16 px (was 54); posts as small clear discs with contact shadow, no clips; one post
  per ~420 px (border 620), none under 300 px; the art window's edge no longer lit as lettering.
- Tests: posts, curl/horizon join, corner stub, eye ring, shader reach constant.
- Screens: production build in headless Chromium (Metal), sunset/moon/parrot/poppy, front and two
  tilts, plus a GIF export. Still open: the moon sample keeps only the moon ring (the water no longer
  becomes a scribble, but nothing replaces it); a short neck tube on the parrot.


## Second polish cycle, round 1 (2026-10-06, Mac)

The first cycle plateaued (judge: realism 6 / premium 6 / picture 3) because tracing the picture's
edges gives meaningless strokes. The owner asked to change the approach: Neon is now designed
signage. Merged origin/main (v0.15.0) first: Neon joins the reorganised Light pack before Shallows
(37 finishes; a v0.14 save now sees Light sealed again for Neon, as Metal and Nature are).

- Layout (`neonMap.ts`, once per picture, cached by NeonGL as before):
  - Ground = edge colors (k-means on the window's edge cells) that are rare in the middle box, smooth
    when the backdrop is defocused, and not a shade of a subject hue. Saliency = distance to the
    nearest ground color, split at Otsu (clamped 0.12–0.24), refined three times as two 4-color
    models with a centre prior, largest component, holes filled.
  - Subject = that figure, unless it is missing, too big, cropped by three sides or a band running
    across the window; then the brightest, most colorful compact blob (a sun, a moon).
  - Silhouette = one tube: Douglas–Peucker + Chaikin, smoothed until glass can bend it; closed with
    a 2.8 W electrode gap at its lowest point, or (cropped) one open tube preferring the upper run;
    a round outline is bent as a fitted circle (Kåsa fit of its upper part).
  - Details (max 3): eye ring (spot inside the subject), round closed shapes inside it (compact >
    0.45), long lines (>= 0.4 S) inside it; straight bars, hairpins, short arcs rejected.
  - Sparse picture (subject 3–16 % of the window and clearly brighter than the rest): a warm sun gets
    cut lines and, where a ridge crosses it, sets (arc stops above the horizon, horizon laid); a cool
    moon gets cyan water dashes. A busy picture gets none.
- Look (`neon.ts`): near-black board with grain and mottling; picture as a 12 % pale blurred tint;
  spill from the wall map in the gas color; contact shadow cast away from the room light; glass with
  a cylindrical body, one gaussian hot core (sigma 0.3 of the radius), no rim, one specular streak
  sliding with tilt; ends painted black (1.3 W, shorter on short tubes); per-tube brightness
  variation; border tube at 40 % and desaturated; standoff 11 face px.
- Tests: new layout tests (cropped subject, setting sun, moon with water, busy picture gets no
  strokes), texture units. e2e not run (the Neon step's `keep` bar lowered to 0.2, untested).
- Analysis cost: about 250–350 ms per new picture on the dev server (no minification), more than
  before (k-means for edge colors and the refinement); the stage re-reads a changing face at most
  every 160 ms, so a crop drag on Neon can stutter. Worth trimming if the direction is kept.
- Known weak spots: a subject whose shadowed part matches a dark backdrop (the parrot's crown) is
  partly lost; a figure split by a crease (a poppy's two petals) keeps only the larger part.

## Second polish cycle, round 2 (2026-10-06, Mac)

Merged origin/main (v0.16.0) first (README finish count conflict: 37 with Neon). Judge after round 1:
the silhouette did not say "eagle" or "parrot" (a smoothed hull over the head, no beak, no eye; the
parrot as unrelated open strokes), tubes looked like flat vector strokes with a hard dark outline and
long plastic electrode stubs, and the board read as the darkened photo (grey ghost at 30–40 %,
pixel-stepped haze), with a frame tube that vanished in one still. Changes:

- Layout (`neonMap.ts`): the subject's contour is traced from a lightly blurred mask (0.006 S, was
  0.02 S) and bent by `glassBend`: Douglas–Peucker within 0.009 S of the contour, then each corner
  rounded with a circular bend as wide as the runs allow (0.5 W to 0.12 S). A cropped outline is
  started at its longest stretch along the window edge, so a brief graze (a beak's tip) is bridged
  (up to 0.3 S); `calm` replaces zigzag stretches (much turning that cancels out: feather tips) with
  a heavily smoothed course and keeps one-way turns (a beak's hook); `unfold` cuts a run where it
  folds back beside itself (both sides of a slot). The eye search tries the strongest few spots and
  accepts one that stands out at some radius on every side with subject all round it; the ring gets
  a pupil dot (`role: 'dot'`, a stub shorter than the tube width, drawn without electrode boots).
  Details are bent with `glassBend` too; an open detail from window edge to window edge that encloses
  nothing is dropped. Posts carry the tube's direction (4 floats each) for the clips.
- Look (`neon.ts`): picture as a matte print at 4.5 % from a wide blur (no pixel steps), no spill
  brightening of the photo; spill is the wall map only (tight 1.6 W + broad 0.065 S inverse-square
  terms, ×0.34); glass across the width: gaussian core (sigma 0.22 R) into saturated gas, slight
  side falloff, a ~1 px darker wall, no outline; one narrow streak off-centre on the lit side whose
  place across the tube follows the tilt (0.3–0.9 R); short boots (0.85 W, none on the dot), darker
  at the tip; clear clips across the tube at each post with a faint rim; the glow color blended over
  4 tube-map cells (no stepped edge where two tubes' glows meet); the frame tube never flickers and
  burns at 50 %; flicker in about one cycle in five; white gas cooler (0.66, 0.8, 1.0).
- Tests: glass bends, calm/unfold, beak profile, eye dot, edge-to-edge helper, frame never flickers,
  print ≤ 6 %, post directions.
- Still weak: the parrot's black lower beak is taken as ground, so its outline runs up the slot and
  stops; the eagle's cropped beak front is a straight bridge along the window edge; owl-like faces
  (subject fills the window) still give only an eye ring.

## Second polish cycle, round 3 (2026-10-06, Mac)

Judge after round 2: the eagle was one open, wandering line with an end floating mid-card and no
beak; the parrot three disconnected strokes; tubes traced (micro-wiggles, facets) rather than bent;
a ring plus pill eye that read as a power icon; standoffs and clips near invisible, no contact
shadows, every tube equally bright, a dull mauve frame tube competing with the subject. Changes:

- Layout (`neonMap.ts`):
  - The subject mask is clipped a little inside the window before tracing, so a cropped subject
    closes: where it runs off the picture its outline becomes a straight cut (a bust's base). One
    closed icon unless the cut is more than 38 % of it; the electrode gap sits at the middle of the
    base. The lowest 30 % of a closed silhouette is smoothed into one calm sweep (`calmBase`).
  - `iconBend`: Douglas–Peucker within 2 % of the card, corners bent at 1.8 W or wider, the joins
    eased (no jump in curvature), then `relax` eases any stretch still tighter than 1.6 W.
  - A subject that fills the window: its own edge as one open tube whose ends run straight out of
    the window under the frame (`outOfWindow`), never stopping in open board; a strong shape the
    window crops (a parrot's beak) is drawn the same way as a detail.
  - A shape that meets the silhouette (an eagle's beak) keeps the part of its outline clear of it as
    a detail line, ending at the silhouette. Open details may be 0.25 S long (was 0.4) but turn no
    more than 1.4 pi in all (`turning`), so no scribbles.
  - The eye: a dot of glass in the eye's own color under a short brow arc in the silhouette's gas
    (no ring).
- Look (`neon.ts`): brushed black board (the spill catches on its streaks); spill wider (0.09 S),
  deeper in color where it is strong (bends); contact shadow 5–9 px below right of each tube,
  sliding against the tilt, also through the halo; metal standoff caps wider than the tube with a
  shadow and a lit rim; clips as metal straps with bright edges; per-tube ±8 % brightness and a
  slightly different shade; frame tube at 30 % and mostly desaturated, its spill at 0.2.
- Tests: closed cropped icon with a base, brow + dot eye, relax / iconBend / outOfWindow.
