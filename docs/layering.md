# Layering two finishes

People asked to put more than one finish on a card: "Sakura on the art and Kintsugi on the frame",
and birthday cards in particular (Confetti on the art, Gold on the frame). This note compares the
ways to do it and records the one FOIL uses. The product summary is in `README.md`.

## What the renderer had

- One card is one quad drawn by one fragment shader. `uEdition` picks the finish inside it
  (`if (e == N) col = …`), so a pixel runs exactly one finish.
- The shader is assembled per program: the core (helpers, tune, Finish area, lettering, the seven
  open finishes) plus **one** pack's finishes (`docs/packs.md`). A pack's program is compiled only
  once that pack is needed, in the background where the driver allows it.
- The **Finish area** (`src/range.ts`, `src/gl/range.ts`) already says, per pixel, how much of the
  finish lands there: a region (all, art, frame, name, none) from the face mask, a brightness band,
  invert, and a brush that paints in or out. Outside it the card shows the plain picture.
- Some finishes cover the frame in full (Gold, Halftone, Platinum, Engraving, Stained Glass, Blacklight,
  Confetti, Fireworks, Negative), two stay in the art window (Crystal, Cosmo Holo), the rest soften
  a little on the frame.
- Some finishes need the card to themselves: Warmth and Glow are driven by touch, Blacklight by a
  lamp that follows the pointer, Shadowbox and 3D Lenticular by the depth model, Flip Lenticular by
  a second picture, Snow Globe by particles drawn over its art.

## Options

**(a) One finish per region, in one pass.** The art takes finish A and the frame finish B, both
computed in the same shader. Two finishes from different packs need a program holding both packs:
up to 15 extra pack-pair programs (5 packs, plus the open set), each compiled on demand, and every
pair must link (uniform names and types across packs must agree; Glow's and Blacklight's `uLamp`
already clashed once). Cost: each pixel still runs one finish (plus a branch), so it is cheap to
draw, but the compile matrix and the shader-size growth are the price. Lazy loading suffers: a
pair program needs both modules and its own compile.

**(b) A second layer drawn over the first, masked.** Draw the card as now with finish A, then draw
the same quad again with finish B, through the program B already has, with alpha = a mask. Every
program stays as it is; nothing new to compile, nothing to link across packs, and each pack still
loads only when one of its finishes is used. Cost: a second pass over the card; with an early
`discard` where the mask is empty, B is computed only where it shows (the frame and name band are
about a third of the card). The mask can be the Finish area itself: what A's area leaves out is
B's. The brush, brightness band and invert then shape the split for free.

**(c) Two finishes mixed.** B processed on top of A's result (A's colours as B's input), or both
blended by a weight. This needs A rendered to a texture every frame (a full-size framebuffer at
the stage's resolution, then a second full pass), finishes that read the face at an offset
(Glitch, Relief, Shadowbox, the lenticulars) would read the wrong picture, and most pairs turn
muddy: two rainbows over each other read as noise, not as two foils. Most expensive, least
legible, and the result is hard to predict from the two names.

| | (a) region, one pass | (b) masked second pass | (c) mixed |
|---|---|---|---|
| Draw cost (phone, GIF) | ≈ 1× + branch | 1× + B over its own area only | ≥ 2× + a framebuffer copy |
| Shader combinations | up to 15 pair programs, each must link | none (existing programs) | none, but an extra FBO path |
| Pack lazy loading | pair program waits for two packs | unchanged | unchanged |
| UI | "art: A, frame: B" | "outside the area: B" next to the area controls | a blend amount nobody can predict |
| Brush / brightness / invert | would need its own mask | the Finish area already is the mask | would need its own mask |

**Chosen: (b), as layers.** It is the only option that adds no shader combinations and leaves
the pack loading as it is, and its cost is bounded by the size of the second area.

The first version used the Finish area as the split: layer 2 went wherever layer 1's area left
out. People found that hard to read ("so whole card + whole card can't be layered?"): it asked
them to think of one finish's place as the leftover of the other's. Now each layer has its own
finish **and** its own area, as layers in a photo app:

- Where only one layer's area reaches, that finish shows alone, as before (art Sakura + frame
  Kintsugi is layer 1 on Art, layer 2 on Frame).
- Where both reach (whole card + whole card, Art + highlights), layer 2 lies on top of layer 1 in
  one of two ways, with one strength slider:
  - **Add its light** (default): only what layer 2's finish adds to the plain picture (its
    sheen, sparkle, gold seams) is added on top of layer 1. Both finishes stay readable: Holo with
    Kintsugi's seams, Sakura's petals under Gold's sheen, Poly with Stardust's grains.
  - **Lay it over**: layer 2 covers layer 1, at its strength. This is the one for finishes that
    mostly darken or recolour (Raden, Negative, Magma), whose light alone is faint.
  Compared side by side on five pairs, "add its light" was the natural reading of "layering" in
  four; laid over at full strength, layer 1 simply disappears where they overlap.

## How it works

- **State**: layer 1 is the card's finish (`edition`) with the area fields it always had
  (`rangeRegion`, `rangeLo`, `rangeHi`, `rangeInvert`, brush strokes under `rangeBrush`), so
  saved settings from before keep their look. Layer 2 is `layer2`: `{ edition, region, lo, hi,
  invert, blend: 'light' | 'over', strength }` or `null` (the default), its brush strokes under
  `rangeBrush2`. A value that no longer fits is dropped; layer 2 is also dropped when its pack is
  sealed again (site data cleared), and when it would repeat layer 1's finish. A second finish
  saved by the first version (`outside`) is not carried over (AGENTS.md: no migrations).
- **Which finishes**: layer 1 is any owned finish (it is the card's finish; picking it here is
  the same as picking it in the hand). Layer 2 is any owned finish except Base and the ones that
  need the card to themselves (`layerable` in `src/editions.ts`: touch, a lamp, depth, Flip
  Lenticular, Snow Globe); its list says so in one line.
- **Drawing** (`CardRenderer.drawCard`): layer 1 is drawn exactly as a single finish. Layer 2 is a
  second pass of the same quad with its own program (`uLayer = 1`), its area in `range2` and layer
  1's area bound beside it (`uRangeUnder`). The pass discards where its own area (times its
  strength) is empty, so it costs only where it shows. Each pixel writes premultiplied
  `mix(finish·α, light, under)`, alpha `mix(α, 0, under)`, where `under` is layer 1's area when
  the blend is "add its light" (and 0 when layer 1 is Base): with the usual
  `ONE, ONE_MINUS_SRC_ALPHA` blending that lays layer 2 over where layer 1 is absent and adds only
  its light where layer 1 lies beneath, in one pass. Layer 2 applies in full on the frame (no
  frame softening), with its own glare and glitter.
- **Where it draws**: the card on the stage, the phone preview and every export (PNG, GIF, APNG;
  the GIF is dithered if either finish asks for it). The hand and View deck show single finishes.
- **Loading**: layer 2's pack is fetched with the hand's; until its program is compiled the card
  shows layer 1 alone, so the frame never stalls. Exports wait for both packs.
- **Kintsugi** is the one finish that knows it is layer 2: its seams skip bright parts so they
  never cut across the subject, which left nothing on the pale paper frame. As layer 2, on the
  frame, its seams cross bright parts too and are a little bolder and deeper in colour. On its
  own it is unchanged.
- **UI** (Fine-tune → Layers): see the next section.

## The Layers tab

Where each finish goes is shown, not described:

- A two-row list, layer 2 over layer 1 as in a paint program. Each row: a pixel card lit in the
  finish's colours exactly where that layer lands (drawn from the same area data the shader
  reads, brightness and brush included), the layer's number, its finish as a slab (opens the
  owned finishes as chips, grouped like the deck, the chosen one ticked), and where it goes in
  words ("Frame", "Highlights", "All but Art", "Art + brush"). Layer 2 has × to remove it.
- "+ Layer a finish" is a dashed empty slot above layer 1; it opens the finish list, and the
  finish chosen becomes layer 2 on the whole card, adding its light.
- Choosing a row hands the area controls below (region, brightness, invert, brush) to that
  layer; their heading names the finish they place ("Where Kintsugi goes"). While those controls
  are in use, the card shows that layer alone in its area with the proof overlay, so what is being
  changed is exactly what is marked; in the layer list the card shows both layers as they are.
- With two layers: "Where they overlap" (Add its light / Lay it over, one line saying what that
  does with the two names) and Strength.
- Reset area resets the chosen layer's area. A green gem on the tab marks any change there.

## Measured

`node scripts/layering-check.mjs --measure` (headless Chromium on a desktop RTX GPU through ANGLE
D3D11, and on SwiftShader, which rasterises on the CPU and stands in for a weak phone GPU); the
GPU is waited on every frame, best of three, interleaved.

| Layers | GPU, 720 × 1008 | SwiftShader, 360 × 504 |
|---|---|---|
| Sakura (art) + Kintsugi (frame) | 0.45 → 0.59 ms (+30 %) | 31.5 → 77.2 ms (+145 %) |
| Confetti (art) + Gold (frame) | 0.68 → 0.73 ms (+7 %) | 100.1 → 125.5 ms (+25 %) |
| Holographic + Kintsugi, both whole, light | 0.42 → 0.61 ms (+43 %) | 19.4 → 71.8 ms (+271 %) |
| Fireworks + Platinum, both whole, light | 0.71 → 0.92 ms (+28 %) | 94.5 → 126.7 ms (+34 %) |

- Layer 2 costs what its finish costs over its own area, plus the face, mask and both areas'
  lookups before the discard. A heavy finish over the whole card next to a light one (Kintsugi's
  two cell noises over Holographic) is the worst case: two full finishes per pixel.
- GIF export (48 frames at 480 × 600, then the worker's encode): 1.33 → 1.37 s, 1.45 → 1.48 s,
  2.02 → 2.10 s — encoding dominates.
- On a device that can't keep up, the stage's quality governor (`src/quality.ts`) steps the
  drawing resolution down as it does for any heavy finish; exports are always at full quality.
  Nothing is dropped to save time: both layers always show.
- Compiling: each pack's program compiles in the background the first time it is needed (on this
  machine Metal 2.1 s, Light 4.0 s, Nature 2.2 s, Studio 4.7 s, Supporter 12.1 s). Until layer 2's
  is ready its row says "Getting ready…" and the card shows layer 1 alone.

`node scripts/layering-check.mjs --ref <v0.12.0 server>`: all 33 single finishes draw pixel for
pixel as in v0.12.0 (SwiftShader), except the two that already differ from one run to the next on
v0.12.0 itself (Stained Glass by one level on a few pixels, Snow Globe's glitter), which are
reported and skipped.
