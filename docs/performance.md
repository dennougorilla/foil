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

- the stage (the card, the hand, the backdrop) and the core card shader with the seven open finishes;
- the classic card face (picture, frame, nameplate, message) and the card back;
- where the finish lands on the card (`areas.ts`: regions, brightness, saved brush strokes);
- the side panel's three steps (picture and crop, finish, Save and its format, the APNG size note),
  the Fine-tune toggle and its Card tab, the motion button above the deck, the name tag with its
  message field and the Lettering shortcut (`letteringJump.ts`);
- the share code (the Share button's tap must reach the share sheet without a network request).

## On demand

Each of these is its own chunk (with its styles), fetched the first time it is used. Most are also
fetched ahead: once the page has loaded and is idle (not under a data saver), and the moment the
pointer or focus reaches the control that opens them, so opening one does not wait.

| Chunk | Fetched when | Ahead |
| --- | --- | --- |
| Fine-tune's tabs: Shine, Lettering (message, nameplate, print), Layers (area, brush, layer 2, mini preview), the frame's own colors (`adjust.ts`) | Fine-tune is opened, or the Lettering shortcut is pressed (at once if Fine-tune was left open) | idle, pointing at Fine-tune |
| The print menu of one piece of text (`printPop.ts`) | a word on the card is tapped, or Fine-tune loads | idle |
| Free placement on the card (`arrangeEdit.ts`) | a piece is set to Free (at once if it was left so) | — |
| The trading-card layout's painter (`card/tcgFace.ts`) | the card is set to the trading-card layout (at once if it was left so) | idle, pointing at Layout |
| The motion tray above the deck (`tune/quickTray.ts`) | the motion button is pressed | idle, pointing at the button |
| Making a file: PNG and GIF (`exporter.ts`), APNG (`anim/apngExport.ts`), the 13 export motions | Save or Share is pressed | idle, pointing at Save, Share or the formats |
| Reading an animated GIF, APNG or WebP (`gifDecode.ts`, `anim/apngDecode.ts`) | a picture is opened | pointing at Open, dragging a file in, or a picture from last visit |
| The other language's texts (`i18n/ja.ts`, `i18n/en.ts`) | the language button is pressed | pointing at the button |
| The binder, the pack shop and its opening, View deck, a pack's finishes, Shadowbox's depth model | as before (see `binder.md`, `packs.md`) | as before |

Fine-tune opens only once its tabs are there, so a tab never opens empty; a language switch waits for
its texts, then changes everything at once. A trading card's face is painted once its painter is there.
A chunk that can't be fetched (offline) is tried again on the next use; Fine-tune, the print menu, free
placement, the trading card and the language say so in a toast, Save and Share as a failed file.

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
- Loops that only move something on screen (an animated picture's frames, free placement's outlines)
  run only while there is something to move.

## Measurements

Filled in with the numbers of this change.
