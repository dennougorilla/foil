# Integrating v0.13

v0.13 brings together nine branches that were built side by side from v0.12.0. This note
records what each one brought and how the places where they met were settled, so later work
knows which design won and why. The branches were merged in this order, each with a merge
commit on `dennougorilla/integrate-v013`:

| Branch | What it brings |
| --- | --- |
| `foil-motion` (93190bc) | The pixel card back (`src/card/back.ts`), ten idle motions on one idle clock shared by the stage and the exports, the motion button above the deck with speed and size sliders, export motions (Showcase = v0.12's export orbit, Sweep, Figure 8, Moment) |
| `foil-gifm-tilt` (4bcc7d5) | Gyre, Jelly, Lean |
| `foil-gifm-show` (72109b2) | Reveal, Push in, Heartbeat |
| `foil-gifm-light` (e21117f) | Light bar (was Sweep), Spotlight, Flare: the light moves, not the card |
| `foil-layout` (609f065) | Card shapes (trading card, wide, square, postcard upright and on its side, business card) and the Gold rim / Ribbon frames |
| `foil-binder` (60cccfb) | The binder (keep, play, discard with Undo, pockets you drag cards between, pages that turn) and Share (a GIF to the share sheet) |
| `foil-message` (95cb02e) | The message on the card, the trading-card layout, per-piece prints, free placement of the words |
| `foil-layering` (43e1abd) | Layers: a second finish, each finish with its own area, overlaps that add light or lay over |
| `foil-phone-stage` (a4ccd71) | Phone held upright: the card fills the screen, a slim header, the Save bar below |

## Decisions

### The GIF motions are export motions

The three GIF-motion studies were written as idle motions (each added three to the stage's
motion tray) with their own way of making a loop shorter than the idle cycle: `loopCycle` in
the tilt and show branches, `idleCycle` in the light branch. Meanwhile `foil-motion` had made
the export's motion a choice of its own (`state.exportMotion`), separate from the stage's idle
motion. The owner asked for all nine as choices for the export's motion, to narrow them down
after trying them, with the default left as it is (As on screen). So:

- The nine are export motions beside Showcase, Sweep, Figure 8 and Moment. The motion tray on
  the stage keeps foil-motion's ten idle motions.
- One way to time them: every motion made for exports has its own fixed length in `SHOW_MS`
  (Gyre, Jelly, Lean, Reveal, Push in, Light bar, Spotlight: 3 s; Heartbeat, Flare: 2 s).
  `loopCycle` and `idleCycle` are gone. Only As on screen is timed by the idle clock (one idle
  cycle, 6 s at speed 1). The speed setting does not change an export motion's length, as with
  foil-motion's Sweep, Figure 8 and Moment.
- Lights: Gyre, Jelly, Lean, Reveal, Push in and Heartbeat put the light opposite the card's lean,
  or where a fixed light is; an orbiting light is not followed (it would need the whole 6 s
  cycle to close the loop). Light bar, Spotlight and Flare move the light themselves, whatever
  the light setting. Blacklight's lamp sweeps once per loop in all of them.
- The light motions' band, spot, shade and star are fields of `ExportView` (not of the idle pose),
  passed to the card shader as `uBeam`, `uSpot`, `uDim`, `uStar`; the exporter dims the backdrop
  with `dim`.
- Order: As on screen, then **Gyre** (the owner liked it: smooth; the candidate for the default),
  Jelly, Lean, Showcase, Sweep, Figure 8, Moment, Reveal, Push in, Heartbeat, Light bar,
  Spotlight, Flare. In the panel they sit in a three-column grid under As on screen.
- Names: the light branch's Spotlight was ぐるり in Japanese, the same as Gyre; it is スポット.
  Its Sweep (id `beam` now) is Light bar / すーっ, since foil-motion already has a Sweep.
- Their tests moved from `tests/motion.test.ts` to `tests/export-motion.test.ts`.

### Card back × shapes

foil-layout redrew the old teal back for every shape; foil-motion replaced that back with the
pixel back in `src/card/back.ts`. The pixel back is kept and now takes the shape: one back
pixel per 10 face pixels (90 × 126 on the trading card, 126 × 90 on the wide card, …), the
lattice and the cartouche laid out from the grid's own size. The back's glint in the card shader
counts cells with `uCardK`, as do the glint streak and the light motions' star and band, so
nothing assumes 5 : 7 (`tests/shape.test.ts`).

### Art window: shape × layout

foil-layout made the art window follow the shape (`artWindow(w, h)` in `shape.ts`); foil-message
made it follow the layout (the trading card's parts take room from the art) and remembered it per
painted face (`artOf(face)`). Both meant the same `uArt` uniform. Now:

- `faceArt(spec)` in `face.ts`: the trading card's art window for the shape's size when the layout
  is the trading card, otherwise the shape's classic window. `artOf(face)` returns what a face was
  painted with, and falls back to its shape's classic window (a pack's wrapper).
- The renderer sets `uArt` from `artOf(face)` and `uCardK` from the face's size. Snow Globe takes
  both from `setFace`. The trading-card face (`tcgFace.ts`) and free placement (`arrangeEdit.ts`)
  read the face's own size instead of 900 × 1260.
- The Gold rim's inner rule and the Ribbon belong to the classic card. The trading card paints its
  own frame stock, plates and rule, so on it those two frames give their colours only.
- Hand-sized cards blank the classic nameplate (it is noise at that size); a trading card keeps
  its bars. The test is the art window's top (`uArt.y * uCardK.y < 0.1`), which works on every shape.

### Exports and Share

foil-binder gave GIFs a size option (`GifSize`) for the share sheet; foil-motion gave them
per-frame delays (`framePlan`); foil-layout gave them a frame that turns with the shape
(`exportFrame`). Together: `GIF_SAVE` is 480 × 600, at most 90 frames, at least 50 ms each;
`GIF_SHARE` is 360 × 450, at most 50 frames, at least 60 ms each; both get the shape's frame and
the export's motion. With As on screen (6 s) the shared GIF has 50 frames of 120 ms.

### Saved settings

foil-binder split the store into `defaults()`, `sanitize()` and card keys vs app keys (a kept
card carries the card keys only). The other branches' settings were sorted into it:

- Card keys: `shape`, `message`, `plate`, `layout`, `cardType`, `prints`, `arrange`, `placements`, `layer2`.
- App keys: `exportMotion` (how you like to export, like the format), `flicked`.
- `areaLayer` is not saved.
- foil-layering's one-time reading of its first design's `outside` into `layer2` is removed
  (the Codex review pointed at AGENTS.md: no migrations; that design was never released).

### The phone's Save bar

foil-phone-stage folds the Save box on a phone held upright into one slim bar (the pick button,
the formats, Save; at most 80 px, so the card can fill the screen) and hides step 3's title row.
foil-binder put Keep and Share in that title row, so they fell into a second row and the bar grew
to 125 px. They now sit in the bar itself, as icon slabs between the formats and Save (their names
stay for screen readers; Share spells out its second tap), and Save says just Save there, since
the format is chosen right beside it. The bar stays one row from 360 px up.

### Smaller meeting points

- Card shader: the light motions' local values are `beamLit` and `dark`, so they sit beside layer
  2's `lit` (the light layer 2 adds) and the tilt `shade`.
- The brush keeps foil-layout's round dab on any shape: `cellAspect` moved onto each layer's `Paint`.
- The card hint (`cardHint`) keeps foil-message's wording; foil-phone-stage's `flickHint` joins it.
- e2e: every branch's steps are kept; foil-layering's PNG helper is `savePngPath`, beside the
  older `savePng` that returns the bytes.
