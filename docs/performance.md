# Performance

What the page loads up front, what waits until it is used, and how the boot is kept short. The
measurements behind it are at the end. `tests/lazy-load.test.ts` keeps the split honest: it walks the
static imports from `src/main.ts` and fails when one of the on-demand modules below is reached.

## The first load

The first load carries what the first view shows and what a first tap needs at once:

- the stage (the card, the hand, the backdrop) and the core card shader with the seven open finishes;
- the card face (picture, frame, nameplate, message, trading-card layout) and the card back;
- the side panel's three steps (picture and crop, finish, Save and its format), the Fine-tune toggle and
  the Card tab, the motion button above the deck, the name tag with its message field;
- the texts of **one** language (the one the page opens in);
- the share code (the Share button's tap must reach the share sheet without a network request).

## On demand

Each of these is its own chunk (with its styles), fetched the first time it is used. Every chunk is also
fetched ahead: when the page is idle after the first card is drawn, and the moment the pointer or focus
reaches the control that opens it, so opening it does not wait.

| Chunk | Fetched when |
| --- | --- |
| Fine-tune's tabs: Shine, Lettering (message, nameplate, print, placement), Layers (area, brush, layer 2, mini preview), the frame's custom colors | Fine-tune is opened (or was left open last visit) |
| The print menu of one piece of text | a word on the card is tapped, or the menu is opened from Lettering |
| Free placement on the card | the message or the name is set to Free (or was left so) |
| The motion tray above the deck | the motion button is pressed |
| Making a file: PNG, GIF and APNG encoders, the 13 export motions | Save or Share is pressed |
| Reading an animated GIF / APNG / WebP | such a picture is opened (or comes back from last visit) |
| The other language's texts | the language button is pressed |
| The binder, the pack shop and its opening, View deck, a pack's finishes, Shadowbox's depth model | as before (see `binder.md`, `packs.md`) |

Until a Fine-tune tab's chunk has arrived, Fine-tune stays shut (its toggle shows it is busy), so a tab
never opens empty. A language switch waits for its texts the same way, then changes everything at once.

## The boot

- The card's region masks (art, frame, text) are read from the face only when an area or a coverage
  figure needs them; a card whose finish covers the whole card skips them.
- Whether a brush layer holds any paint is remembered, not counted again pixel by pixel on every change.
- A program that is still compiling is asked once per frame whether it is done; each question is a
  round trip to the GPU process.
- The backdrop's shader compiles in the background like the card's.
- The card back and the sample thumbnails are encoded off the main thread.
- Loops that only move something on screen (an animated picture's frames, free placement's outlines)
  run only while there is something to move.

## Measurements

Filled in with the numbers of this change: first-load bytes (gzip) per kind, time to the first card
frame and frame times (desktop GPU and software rendering), and memory, against v0.13.0 (and the first
load of v0.9.3 and v0.12.0 for reference).
