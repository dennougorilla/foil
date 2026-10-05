# Performance

What the page loads up front, what waits until it is used, and how the boot is kept short. The
measurements behind it are at the end. `tests/lazy-load.test.ts` keeps the split honest: it walks the
static imports from `src/main.ts` and fails when one of the on-demand modules below is reached (or
when one of them is no longer loaded from anywhere).

Budget: the first-load JavaScript (gzip, with the page's language) stays at or under 77 kB, and the
time to the first card frame does not get worse.

## The first load

One script, one stylesheet and the texts of one language. Everything the entry reaches through static
imports is bundled into the one entry chunk (`vite.config.ts`, `firstLoad`), and `index.html` fetches
the language the page opens in (saved choice, then `?lang=`) beside it. It carries what the first view
shows and what a first tap needs at once:

- the stage (the card, the hand, the swirl backdrop) and the core card shader with the seven open finishes;
- the classic card face (picture, frame, nameplate, message) and the card back;
- where the finish lands on the card (`areas.ts`: regions, brightness, saved brush strokes);
- the side panel's three steps (picture and crop, finish, Save and its format, the APNG size note),
  the Fine-tune toggle and its Card tab, the motion button above the deck, the name tag with its
  message field and the Lettering shortcut (`letteringJump.ts`);
- the share code (the Share button's tap must reach the share sheet without a network request).

## On demand

Each of these is its own chunk (with its styles), fetched the first time it is used. Most are also
fetched ahead: once the page has loaded and is idle (not under a data saver), and the moment the
pointer or focus reaches the control that opens them, so opening one does not wait. (The page's
script waits for its texts before it gets there, so it checks whether the page has loaded already;
in v0.13 a quick load, such as one from a cache, skipped the fetching ahead.)

| Chunk | Fetched when | Ahead |
| --- | --- | --- |
| Fine-tune's tabs: Shine, Lettering (message, nameplate, print), Layers (area, brush, layer 2, mini preview), the frame's own colors (`adjust.ts`) | Fine-tune is opened, or the Lettering shortcut is pressed (at once if Fine-tune was left open) | idle, pointing at Fine-tune |
| The print menu of one piece of text (`printPop.ts`) | a word on the card is tapped, or Fine-tune loads | idle |
| Free placement on the card (`arrangeEdit.ts`) | a piece is set to Free (at once if it was left so) | — |
| The trading-card layout's painter (`card/tcgFace.ts`) and the layout of its card text (`card/effect.ts`) | the card is set to the trading-card layout (at once if it was left so) | idle, pointing at Layout |
| The motion tray above the deck (`tune/quickTray.ts`) | the motion button is pressed | idle, pointing at the button |
| Making a file: GIF (`exporter.ts`), APNG (`anim/apngExport.ts`), MP4 and its muxer (`anim/mp4Export.ts`, `mp4-muxer`) | Save or Share is pressed | idle, pointing at Save, Share or the formats |
| The motions other than Sway and None (`tune/moves.ts`; the card rests until they arrive) and their icons (`tune/motionIcons.ts`, also with the tray and Fine-tune) | another motion is picked, or was left picked | idle |
| Reading an animated GIF, APNG or WebP (`gifDecode.ts`, `anim/apngDecode.ts`) | a picture is opened | pointing at Open, dragging a file in, or a picture from last visit |
| The backdrops other than the swirl (`gl/backdrops.ts`; the stage keeps the old one until the new one is ready) | another backdrop is picked, or was left picked | pointing at the backdrop tiles |
| The other language's texts (`i18n/ja.ts`, `i18n/en.ts`) | the language button is pressed | pointing at the button |
| Touch: the heat a finger leaves and the preview's own strokes (`touch/heat.ts`), for Warmth and Glow only | a touch finish is in the hand or on the card (until it arrives the card draws cold) | — |
| The frame-rate meter (`fpsMeter.ts`) | the address has `?fps=1` | — |
| The binder, the pack shop and its opening, View deck, a pack's finishes, Shadowbox's depth model | as before (see `binder.md`, `packs.md`) | as before |
| Registering the service worker, the Update chip, a picture shared to FOIL (`pwa.ts`, see `pwa.md`) | the page has loaded and is idle (also under a data saver), or at once when a picture was shared to it | — |

Fine-tune opens only once its tabs are there, so a tab never opens empty; a language switch waits for
its texts, then changes everything at once. A trading card's face is painted once its painter is there.
Once the service worker holds the app (`pwa.md`), every chunk is there offline too. A chunk that
can't be fetched (offline before that) is tried again on the next use; Fine-tune, the print menu,
free placement, the trading card and the language say so in a toast, Save and Share as a failed file.

Styles that the first view uses stay in the first stylesheet even when the module that used to carry
them now loads later: the tag's (`tag.css`) and the print chips' look with the Lettering shortcut
(`letteringJump.css`).

## The boot

- The stage is created first, so the card's program starts compiling while the rest of the page is
  built. The interface fonts' stylesheet holds the first paint but not the script (`index.html`); the
  face waits for that stylesheet before it waits for the fonts.
- The card's region masks (art, frame, text) are read from the face only when an area or a coverage
  figure needs them, and a card whose finish covers the whole card sends no range texture at all.
- Whether a brush layer holds any paint is remembered, not counted again pixel by pixel on every change.
- While a program compiles, the cards of a frame share one "is it done?" question: each question is a
  round trip to the GPU process, which answers nothing else while it compiles.
- The backdrop's and the sparks' programs compile in the background like the cards'.
- The card back for the deck's pile (a CSS image) is encoded off the main thread (`toBlob`); once
  the interface fonts arrive only the face is painted again, not the crop preview.
- Loops that only move something on screen (an animated picture's frames, free placement's outlines)
  run only while there is something to move.

## Slow phones

Low-priced Android phones (issue #31: an OPPO A55s, Snapdragon 480 with an Adreno 619 and 4 GB) are
slow in two places at once. The GPU has to fill much of a 720 × 1600 screen with the card's shader
on every frame, and the main thread, several times slower than a desktop's, runs the stage's frame,
the page's CSS loops and the style passes they bring.

**One mechanism for the whole page.** A new finish, backdrop or feature needs no light version of
its own: the drawing levels in `src/quality.ts` (`QUALITY_LEVELS`) are the one place where the page
draws less, and they reach everything through shared paths:

- the card canvases (the stage's and the pack opening's) draw at the level's resolution, so every
  finish gets cheaper at once;
- every backdrop is drawn through `BackgroundRenderer.draw`, which shrinks it and, at a still level,
  holds its moment and draws it again only when its size, colors or place change;
- bursts of sparks are scaled down;
- at a still level `<html data-still>` plays every endless CSS loop once, whatever it belongs to
  (what shows that something is loading, under `[aria-busy]` or `.is-waiting`, keeps moving);
  `<html data-no-crt>` hides the CRT lines.

| Level | Card canvases | Backdrop | Sparks | Still | CRT lines |
| --- | --- | --- | --- | --- | --- |
| 0 | full (at most 2×, 1.5× on phones) | ¼ of the window, moving | all | no | yes |
| 1 | 0.8 | ¼, still | all | yes | yes |
| 2 | 0.65 | ⅙, still | half | yes | no |
| 3 | 0.5 | ⅛, still | half | yes | no |

A branch for one finish is added only when the budget check below shows that finish is too heavy
even so. Exports are always made at full quality.

**Choosing the level.** The stage measures its frames over one-second windows, starting 1.5 s after
the page opens. Under 40 fps it steps down a level, under 20 fps two; four frames over 250 ms in a
row count as a device that slow once those first 1.5 s (programs compiling) are over, while a single
one is a stall and starts the window over. A step that doesn't cut the frame time by a tenth is
undone and not tried again (a capped device gains nothing from fewer pixels). A phone or tablet whose browser reports 4 GB of memory or less
(`navigator.deviceMemory`, Chrome) starts at level 1, 2 GB or less at level 2, so its first seconds
are smooth too; while its frames keep a 60 Hz pace (18 ms or less) it climbs back a level per
second, and a climb that brings it under 40 fps goes back and climbing stops, as it does after any
step down. A browser that doesn't say (Safari) starts at full quality.

**Less work on every frame, at every level** (the same pixels):

- The stage reads every box it needs (the canvas, the card slot, the hand, and the deck only while a
  card flies to or from it) before it writes any style, so a frame never forces a style pass.
- The proofs of the card (step 2, the folded recap) copy the stage canvas only while they are on
  screen: a copy reads the canvas back from the GPU, and on a phone they sit far below the card.
- The lettering's per-piece uniforms are worked out once per change, not for every card drawn.
- The CRT lines blend normally: the overlay is black, so plain blending darkens exactly as the former
  multiply did (to rounding), without a pass of its own over the whole screen.

**Checking a device by hand.** `?fps=1` shows a small meter over the logo: frames per second over the
last second, its slowest frame (ms), the level (0 of 3 is full), when the first card was drawn, the
last second's frames as pixel bars (green at a 60 Hz pace, gold down to 30 fps, red below, a dotted
line at 30 fps), and the GPU and memory the browser reports.

**The budget check.** `npm run perf` (with `npm run dev` or a `vite preview` running; `--url` for
another address, `--only holo,gold` for some finishes) puts every finish on the card in turn on a
phone-sized page at full quality and measures the stage twice: its frames with the GPU in software
(SwiftShader, where a shader's cost shows) and its main-thread work with the CPU slowed 4×. It lists
every finish and the backdrop, then only what is over budget: a frame over 3× the plain card's,
more than 15 ms of main-thread work a frame, or a backdrop over 30% of a frame. Run it after adding a
finish, a backdrop or anything drawn on every frame; measure what it flags again with `--only`
before acting, since a busy machine slows some runs.

The first full run (2026-10-05): the open finishes draw at 0.9–1.05× the plain card, most pack
finishes at 1.3–2.6×, and two are over: Confetti (3.1×) and Fireworks (4.1×), the candidates for a
lighter path of their own if a real phone shows they need one. No finish is over on the main thread
(4.4–9.4 ms a frame; Shadowbox 12.1 ms while its depth model loads), and the backdrop is under 1% of
a SwiftShader frame.

## Measurements

Measured on 2026-10-05 for this change (v0.13.0 → this branch), production builds served by `vite
preview`. Sizes come from the build (gzip of each file, as served); the first load is the entry and
everything it imports plus the language chunk (bytes after the review fixes; times measured just before them).

### Bytes on the first load (kB, gzip)

| | v0.9.3 | v0.12.0 | v0.13.0 | now |
| --- | ---: | ---: | ---: | ---: |
| JavaScript, English page | 97.6 | 84.6 | 118.4 | **75.0** |
| JavaScript, Japanese page | 97.6 | 84.6 | 118.4 | **76.5** |
| CSS | 16.0 | 19.2 | 25.2 | **14.6** |
| HTML | 3.9 | 4.2 | 4.7 | 5.1 |
| Scripts requested | 1 | 2 | 3 | 2 |
| JavaScript loaded on demand (all chunks) | 0 | 81.2 | 90.0 | 147.9 |

(v0.12.0's often-quoted 77 kB is its entry chunk alone; its lettering chunk was imported up front too.)

Where v0.13.0's 118 kB went: the other language (about 7 kB), Fine-tune's tabs (adjust, 19.6 kB on
its own), the exporters and export motions (5.5 kB), the picture decoders (5.0 kB), free placement
(3.9 kB), the motion tray and the print menu (1.9 kB each), the trading-card painter (1.7 kB), the
modulepreload polyfill (0.5 kB), and one chunk instead of three compressing better. Shader source on
the first load is unchanged (the core card program; packs still bring their own).

Fonts are unchanged: Google Fonts' stylesheet (about 30 kB) and the slices the page's text uses
(about 27 kB for an English page, about 150 kB for a Japanese one, which Google already splits by
character range). The page itself loads no images; `og.png` (592 → 540 kB) and
`apple-touch-icon.png` (8.6 → 5.9 kB) were re-encoded losslessly for the crawlers and home screens
that fetch them.

### Time and memory

Headless Chromium, 1440×900, a fresh browser per run, base and branch runs alternating; medians
(ms from navigation). GPU is the desktop RTX through ANGLE/D3D11; software is SwiftShader. "Slow
4G" is 150 ms round trips, 1.6 Mbps down and the CPU slowed 4×. The first card frame is the first draw
on the cards' canvas.

| | v0.13.0 | now |
| --- | ---: | ---: |
| GPU: first contentful paint | 1024 | 740 |
| GPU: DOMContentLoaded | 706 | 149 |
| GPU: card program starts linking | 215 | 143 |
| GPU: first card frame | 1031 | 937 |
| Software: first contentful paint | 1236 | 808 |
| Software: first card frame | 807 | 373 |
| Slow 4G + CPU 4×, GPU: first contentful paint | 1240 | 1124 |
| Slow 4G + CPU 4×, GPU: DOMContentLoaded | 2511 | 1143 |
| Slow 4G + CPU 4×, GPU: first card frame | 2581 | 1858 |
| JS heap after load (MB) | 3.8 | 2.9 |
| JS heap with Fine-tune's four tabs opened (MB) | 4.5 | 3.6 |
| Opening the Shine tab, click to filled (ms) | 120 | 85 |

Frame times are unchanged: on the GPU every frame is 16.7 ms idle and while the pointer tilts the
card (p95 16.8 ms both). With software rendering the quality governor is still stepping down during a
short run, so the levels were pinned (`?quality=`): level 3 is 28.0 ms (v0.13.0) and 28.2 ms (now) per
frame idle, 28.0 / 28.2 ms while tilting; level 0 is 60.1 / 59.6 ms idle and 61.9 / 61.2 ms tilting.

Every one of the 33 finishes, the first view (English, Japanese, phone), Fine-tune's four tabs, the
motion tray, the GIF options, APNG, a card with an area and with layer 2 were compared pixel by pixel
with v0.13.0 (time held still, reduced motion): identical, apart from a one-pixel column of the
backdrop and the hint beside the tag on a card left in Free placement, which now says what Free does
from the first view (v0.13.0 showed the general hint until the language was switched).

When the stage's motions and the export motions became one list (docs/motion.md), the first load
stayed under the numbers above: 74.8 kB for an English page and 76.3 kB for a Japanese one. Only
Sway (the default) and None are in it; the other nineteen motions (2.1 kB) and their pixel icons
come in their own chunks.

With the home-screen app (`pwa.md`, measured 2026-10-05 against v0.13.1, gzip -9 of the built files):
the first load grew by the few lines that fetch `pwa.ts` (and check whether the page has loaded),
126 bytes for either language (75 265 → 75 391 bytes English, 76 796 → 76 922 Japanese); the CSS and
the rest of the page are unchanged, and the page shows exactly the same pixels (every finish, a
phone and a tablet, time held still). `pwa.ts` and its styles are about 1.2 kB on their own. Once the page
is idle, the service worker keeps 50 files (about 1.2 MB, about 510 kB as sent); a new version copies
the files whose names carry an unchanged hash from the old one instead of downloading them again.

### Slow phones (issue #31)

Measured on 2026-10-05, v0.13.1 → this branch, production builds served by `vite preview`, headless
Chromium as a phone (360 × 800 at 2×, touch, reporting 4 GB of memory), a fresh browser per run,
base and branch runs alternating; the means of the runs. The machine was shared with other work, so
single numbers move by several fps; the direction held in every pair. "CPU 10×" is the real GPU with
the main thread slowed tenfold (a slow phone's main thread); "SwiftShader" draws in software on eight
cores with the CPU slowed 4× (a GPU far weaker than the phone's, so its fps are a floor, not a forecast).

| | v0.13.1 | now |
| --- | ---: | ---: |
| CPU 10×: frames per second, idle (after 14 s) | 47.7 | **55.0** |
| CPU 10×: frames per second, a finger circling over the card | 45.6 | **54.3** |
| CPU 10×: frames per second, 2.5–5.5 s after opening | 40.3 | 31.0 |
| CPU 10×: main thread busy (ms per second, idle) | 1002 | **800** |
| CPU 10×: of which style passes (ms per second) | 204 | **125** |
| CPU 10×: first card frame (ms) | 2275 | **1619** |
| SwiftShader: frames per second, idle | 6.3 | **17.3** |
| SwiftShader: frames per second, a finger circling | 9.7 | **17.0** |
| SwiftShader: level reached (after 2.5 s / 14 s) | 0 / 1 | **3 / 3** |
| CPU 6×: main thread busy (ms per second, idle) | 595 | **504** |
| CPU 6×: View deck shown (ms) / pack shop shown (ms) | 681 / 2207 | 675 / 2282 |

Both builds keep 60 fps idle, tilting, in View deck and in the pack opening with the CPU slowed 6×
when nothing else runs; the differences show once the device is slower than that. The early seconds
on the CPU 10× row are lower now because the phone starts at level 1 and is judged within 2.5 s: one
run stepped down to level 2 there, the other climbed back to full quality. The pack opening and View
deck were not slowed by the change (within noise).

Pixels: on a phone page at full quality the 7 open finishes, Gold, Warmth and Glow match v0.13.1 to
one level of 255 (the CRT lines' plain blending instead of multiply; with the CRT off they are
identical). Warmth and Glow differ between two runs of the same build (the unseen finger's timing), so
they were checked to within that. Bytes: first-load JavaScript 75.33 → 74.66 kB (English) and
76.86 → 76.18 kB (Japanese), gzip of the entry and the language chunk measured the same way for
both: touch (`touch/heat.ts`) left the first load and outweighs what was added.
