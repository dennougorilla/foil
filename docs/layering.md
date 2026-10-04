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
- Some finishes cover the frame in full (Gold, Halftone, Platinum, Stained Glass, Blacklight,
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

**Chosen: (b), with the Finish area as the split.** It is the only option that adds no shader
combinations and leaves the pack loading as it is, its cost is bounded by the size of the second
area, and it reuses the tool people already have for "where": choose the area for the main
finish, and pick a finish for what it leaves out. "Art: Sakura, frame: Kintsugi" is region *Art*
plus Kintsugi outside; the brush, a brightness band (highlights in Gold, shadows in Holographic)
or invert make any other split.

## How it works

- **State**: `outside` in the saved settings: an edition id, or `null` (the default, and what a
  value that no longer fits becomes). It is cleared when its pack is sealed again (site data
  cleared), like the card's own finish.
- **Which finishes**: any owned finish (hand or deck) except Base (that is "none") and the ones
  that need the card to themselves (`layerable` in `src/editions.ts`: touch, a lamp, depth, Flip
  Lenticular, Snow Globe). The card's own finish is not offered (it would change nothing).
- **Drawing** (`CardRenderer.drawCard`): the card is drawn as before; when `outside` is set and
  its program is ready, the quad is drawn again with that finish and `uOuter = 1`. In that pass
  the shader reads the Finish area first, discards pixels the main finish fully covers, applies
  the finish in full (no area, no softening by the area) and writes its alpha scaled by
  `1 − area`, so the two passes add up to `mix(main, outside, 1 − area)`. With `uOuter = 0` the
  main pass is unchanged, pixel for pixel (checked by `scripts/layering-check.mjs`). Glare and
  glitter belong to each finish, so each side gets its own.
- **Where it draws**: the card on the stage, the phone brush preview and every export (PNG, GIF,
  APNG; the GIF is dithered if either finish asks for it). The hand and View deck show single
  finishes, as before.
- **Loading**: choosing an outside finish (or starting with one saved) fetches its pack with the
  hand's; until its program is ready the card shows the main finish alone, so the frame never
  stalls. Exports wait for both packs.
- **The overlay** (Finish area shown on the card): the die line still traces the edge, but what
  the main finish leaves out shows the outside finish as itself instead of paper, so the split is
  seen as it will be; the legend's second swatch takes the outside finish's name and colour.
- **Kintsugi** is the one finish that knows it is outside: its seams skip bright parts so they
  never cut across the subject, which left nothing on the pale paper frame. In the outside pass,
  on the frame (outside the art window), its seams cross bright parts too and are a little bolder
  and deeper in colour. On its own it is unchanged.
- **UI**: in Fine-tune → Finish area, under the area controls, "Second finish, outside the area"
  (範囲の外に重ねる加工) shows the current one (or "None") in a pocket with a Change slab that
  opens the owned finishes as chips grouped like the deck (starters, then each pack), each with a
  swatch in that finish's colours and a tick on the chosen one; the list scrolls in its own
  pocket and the slab reads Done while it is open. The line under it says where the second finish
  lands ("the frame and name band" for Art). Picking one while the area is the whole card switches
  the area to Art, so the frame gets it at once. If the area later covers the whole card again,
  the tag says it is hidden and the line offers to keep the card's finish to the art. Reset area
  clears it. A green gem on the tab marks it, like any other change there.

## Measured

`node scripts/layering-check.mjs --measure` (headless Chromium on a desktop RTX GPU through ANGLE
D3D11, and on SwiftShader, which rasterises on the CPU and stands in for a weak phone GPU). The
card's own finish on the art, the outside finish on the rest (region Art); the GPU is waited on
every frame, best of three, interleaved.

| Pair (art + outside) | GPU, 720 × 1008 | SwiftShader, 360 × 504 |
|---|---|---|
| Sakura + Kintsugi | 0.56 → 0.66 ms (+17 %) | 32.9 → 78.5 ms (+139 %) |
| Confetti + Gold | 0.79 → 0.92 ms (+17 %) | 91.2 → 108.3 ms (+19 %) |
| Holographic + Negative | 0.61 → 0.59 ms (±0) | 16.2 → 27.7 ms (+71 %) |
| Fireworks + Platinum | 0.88 → 1.02 ms (+15 %) | 91.2 → 119.3 ms (+31 %) |

- The second pass costs what its finish costs over its own area plus a fixed part (the face,
  mask and area lookups over the whole card before the discard). A heavy outside finish next to a
  light one (Kintsugi's two cell noises next to Sakura's petals) is the worst case.
- GIF export (48 frames at 480 × 600, then the worker's encode): 1.56 → 1.49 s and
  1.47 → 1.48 s — no measurable change; encoding dominates.
- On a device that can't keep up, the stage's quality governor (`src/quality.ts`) steps the
  drawing resolution down as it does for any heavy finish; exports are always at full quality.
  Nothing is dropped to save time: both finishes always show.

`node scripts/layering-check.mjs --ref <v0.12.0 server>`: all 33 single finishes draw pixel for
pixel as in v0.12.0 (SwiftShader), except the two that already differ from one run to the next on
v0.12.0 itself (Stained Glass by one level on a few pixels, Snow Globe's glitter), which are
reported and skipped.
