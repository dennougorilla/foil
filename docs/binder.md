# Binder and sharing

How finished cards are kept in the browser and sent to other apps. The product summary is in
`README.md`; this note is the design behind it. The worry it answers is weight: a binder of dozens
of cards must not slow the page down, so nothing is read or drawn before it is looked at.

## What a kept card is

- **Its settings**: every saved setting that belongs to the card (`CARD_KEYS` in `src/state.ts`):
  the finish, rarity, frame and frame color, strength, pixelation, name, line, crop, Shine,
  lettering, the finish area's region and band, and which picture (`sample`). The rest of the
  saved state (language, sound, the hand, which panel tab is open, the export format, the brush,
  the swatches) is about the app, not the card, and stays out. A setting added to the store later
  joins the card unless it is listed as an app setting. The brush strokes of the finish area are
  not kept (they are not kept across reloads either).
- **Its picture**: a sample is kept as its number. The person's own picture is kept shrunk to
  1280 px on its long side as WebP; an animated picture keeps its own file when it is 8 MB or less
  (so it still moves), and its first frame otherwise. Flip Lenticular's other picture is not kept.
- **A thumbnail**: the card drawn once, at the moment it is kept, by the same still renderer as the
  PNG export, shrunk to 250ﾃ・50 and kept as WebP where the browser can write it (20窶・0 KB). The binder shows only these, as
  plain `<img>` elements: no WebGL context, no shader, nothing animating.

## Storage

A database of its own, `foil-binder` (the `foil` database keeps the picture on the card now), with
three stores so each can be read on its own:

| Store | Key | Holds | Read when |
|---|---|---|---|
| `meta` | id | when it was kept, its name, finish and size in bytes | the binder opens (a few hundred bytes a card) |
| `thumbs` | id | the thumbnail | its page is shown |
| `cards` | id | the settings and the picture | the card is played |

The binder's count is mirrored in `localStorage` (`foil:binder`) so the header chip shows it
without opening the database or loading the binder's code. As everywhere in FOIL (see
`AGENTS.md`), a stored card that no longer fits the current shape is dropped, not migrated; a
setting that is out of range falls back to its default, the same way a saved setting does.

**Limits**: 54 cards (six pages of nine) and 60 MB in all. A card that would go past either is
refused with a note saying which, and the binder opens so one can be discarded. Its head shows
the count (11 / 54) and, as a bar, how much of the 60 MB is used; whichever ran out turns red.
A thumbnail that can't be read shows as a card back with the card's name and finish, saying it
can still go on the stage. When full, the note leads with the limit reached and still names
what is picked.

## The binder

- Pages of nine pockets, three by three, like a real binder; two pages side by side where there
  is room (wide screens), one on phones. Newest first. While it is not full, the first pocket
  offers to keep the card on the stage now.
- Tapping a card picks it (it lifts with a gold edge, like a card picked in a hand); tapping again
  puts it down. The line under the head names the picked card, its finish and the day it was kept (or how
  many are picked). Two buttons, blue and red as in the game FOIL is modelled on: **To stage**
  puts the one picked card back on the stage; **Discard** throws away every picked card, and asks
  "Discard 2?" first. Double-clicking a card puts it on the stage at once. Keeping and discarding
  are said to screen readers, not in a toast: the pockets and the chip already show them.
- Putting a card on the stage replaces the picture and settings on the stage with the card's (the hand takes
  its finish in if it is not there; a finish whose pack is sealed falls back to Holographic).
  It is the only card drawn live.
- The binder's code, its styles and its texts load the first time Keep or the binder chip is
  used. The page's first load carries only the two buttons, the chip and the share code.

## Sharing

- **Share** sits beside Keep and shows only where `navigator.canShare({ files })` accepts an image
  file (most phones; most desktop browsers have no such share sheet, and Save is the way out there).
- It always sends a moving GIF, whatever format Save is set to: X plays a GIF, and most apps won't
  play an APNG. The GIF is made on the press, counting up on Share and on the Save button as Save shows
  it, and keeps the GIF options (backdrop, edge). It is smaller than a saved GIF, 360ﾃ・50 and at
  most 50 frames (a long animated loop keeps its length with longer frames), so even a noisy
  picture stays well under the 15 MB X takes: 50 frames of 360ﾃ・50 are 8.1 MB before compression.
- It goes with a short line and the site's address (`text`); where `canShare` refuses text along
  with files, the GIF goes alone. The card is never put in a link, and nothing is sent to a server.
- The share sheet only opens while the browser still counts the tap that asked for it. Making a
  GIF can take longer than that; then `share()` fails with `NotAllowedError`, and the button turns
  into **Send** with the file ready: the next tap opens the sheet at once. The ready file is
  dropped as soon as the card changes. Cancelling the sheet is not an error.
- The share code is on the first load (it is small): loading it on demand would spend the tap's
  time on a network request.
