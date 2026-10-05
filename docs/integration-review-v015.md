# Integration: review-v015 (for review, not a release)

Branch `dennougorilla/review-v015`, from `origin/release/v0.14.0` (then `v0.14.0` merged in). It
gathers the work after v0.14 so the owner can try it all at once. Nothing here is released; where
the new finishes finally go is the owner's call.

## Merged, in order

1. `foil-openall` (#43): Open all, the packs reorganized (Metal / Jewel / Light / Nature / Studio /
   Supporter of celebrations), the deck's All tab. The base for the packs, so first; merged again at
   the end for its later deck-builder spacing fix (e81d1f0).
2. `foil-copy` (#38): texts and the glossary.
3. `foil-backdrop` (#44): nine backdrops.
4. `foil-frameless` (#45): the picture as the whole card.
5. `foil-pixelart` (#46): pixel art over the whole card (replaces the Pixelate slider).
6. `foil-samples`: seven samples.
7. The nine new finishes: `foil-chameleon` (90), `foil-neon` (92), `foil-rain` (94), `foil-plasma`
   (96), `foil-liquidmetal` (98), `foil-kaleido` (100), `foil-marble` (102), `foil-mirrorball`
   (104), `foil-engraving` (106).

## Decisions on conflicts

- **Packs:** `foil-openall`'s packs are kept as they are. Each finish branch put its finish in a
  pack of the old layout (Metal, Light, Nature); instead all nine go to a new provisional pack,
  **Lab / ラボ (試作)** (`src/gl/finishes/lab.ts`, `lab` in `PACKS`, after Supporter on the shelf,
  wrapped in Holographic with the Light pack's star art in teal). The theme packs' modules are
  unchanged. Tests that said "in the Metal / Light / Nature pack" now say Lab; `tests/lab.test.ts`
  checks that shader numbers are unique, that `lab.ts` dispatches exactly the Lab finishes, that
  their own uniforms are declared nowhere else, and that the Lab layers' texture units are free.
- **One program for nine finishes:** the touch field's GLSL (`TOUCH_GLSL`, `uHeat`/`uPrints`) is
  spliced once. Rainy Window reads the heat on unit 6; Liquid Metal's ripples (`uLmField`) moved
  from unit 6 to 10 and Marble's flow (`uMarbleFlow`) to 11, so no two samplers share a unit.
  Mirror Ball's room of spots is a Lab layer.
- **Touch field (`src/touch/heat.ts`):** Rainy Window (`rain`), Liquid Metal (`liquid`, a wave
  field, `calm` under reduced motion) and Marble (`marble`, two channels, `moves`) all kept; the
  stage sets `calm` and skips stepping a field that `moves` under reduced motion.
- **Core shader:** the frame-in-full list and the glare tweaks of every branch are kept together
  (90, 92, 96, 98, 106 cover the frame; 70 and 92 get the dim glare; 90 a softer one).
- **Torch:** Plasma's `torch: 'uv' | 'plasma'` replaces the boolean; Blacklight is `'uv'`.
- **Export and backdrops:** v0.14 has no PNG and adds MP4; the backdrop branch replaced
  `gifClear` with the Clear backdrop. Merged: `createScene` is async and draws the card's backdrop
  for GIF, APNG and MP4 (the MP4 keeps v0.14's coarser pixel scale); Clear makes a GIF or APNG
  transparent; an MP4 has no alpha, so Clear comes out black. The save options name the motion and
  the backdrop; the old Swirl / Transparent switch is gone. `swirlAt` is removed.
- **Texts:** where `foil-copy` and v0.14 both changed a string, v0.14's meaning (MP4, no PNG) with
  `foil-copy`'s wording. The deck builder's title stays `foil-openall`'s 「デッキを編成」 (the copy
  branch had 「手札を組む」). APNG is 「動く・高画質」 / "Moving, full color" now that it follows the
  backdrop. The glossary gains Backdrop and Pixel art and loses PNG.
- **Frameless × samples:** the crisp-pixel check reads samples through `sampleImg`, since the
  card samples load later.
- **Counts:** 42 finishes, seven in the hand and 35 in seven packs (README, features, the page's
  meta descriptions, which also now say GIF, APNG or MP4).
- **e2e:** not run (by request). The finish branches' edits to `scripts/e2e.mjs` were not taken; the
  e2e script is v0.14's plus the earlier branches' and needs a pass for the Lab pack.
- The branches' `docs/handoff-*.md` notes are kept as they came.

## For the review build only

`index.html` gets an uncommitted script that marks every pack finish owned and the Supporter
pack shown, so all 42 finishes are in the hand or the deck from the first visit. It is not
committed.
