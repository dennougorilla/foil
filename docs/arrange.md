# Free placement of the card's words

The Lettering tab's **Placement: Auto / Free** (配置: おまかせ / 自由). Auto (the default) is the
preset places: the message at the top, middle or bottom of the picture, the name on its plate,
and on a trading card the plates' own places. Free lets the words be dragged, sized and turned
on the card itself. This note is what may move and how it feels; `README.md` has the summary.

## What may move

The card's structure never breaks: a frame, a plate or a box never moves, only words laid over
the card.

| | Classic card | Trading card |
|---|---|---|
| Message | Free: anywhere inside the frame | Free: it leaves its text box and lies over the card like the classic card's message (the box goes, and the picture grows into its room, as when there is no message) |
| Name | Free: it leaves the nameplate (the rarity diamonds stay on the plate) and is printed like the message, with an outline, so it reads on the picture | Fixed on the name plate |
| Type line | — | Fixed on its plate |

A free piece keeps its own print (ink, foil…), its typeface and its words; only where it sits,
its size and its turn are free.

## How it feels

- **A short tap** on words opens their print popover, as in Auto. **Moving** the finger or the
  mouse more than a few pixels drags them instead, so the two never collide.
- Words being dragged are **selected**: a dashed gold box on a dark keyline round them, a
  square handle at its corner that sizes them, and a round handle on a short stalk above them
  that turns them (up to ±15°; within ±3° of level they settle level, with a click). Two fingers
  pinch to size and turn. A readout over the turn handle shows only what is changing (the turn,
  naming level and the 15° limit; the size against where the gesture began). A press anywhere
  but the words, their handles, their bar and their print menu (elsewhere on the card, the
  panel, the page), Esc, **Done**, scrolling the page, switching finishes or leaving the tab
  lets go. Letting go also closes the print menu, and nothing of the selection stays on screen.
- A small **bar under the card** names the selected piece and offers **Print** (its print
  menu), **Straighten**, **Back to Auto** and **Done**; on a phone it wraps to fit the screen.
  The box, its handles and the bar follow the card on screen; the print menu sits on the page
  beside what opened it and closes when the page (or the box holding what opened it) scrolls.
- While Free is on and nothing is selected, a faint dashed outline marks the words that can be
  picked up, and the hint beside the card says how.
- While words are selected the card **holds still** and faces the viewer (as while painting the
  finish area), and a finger flick on the card does not switch finishes. Tossing and flicking
  come back when nothing is selected.
- **Guides:** while dragging, the words snap to the card's centre lines, the picture's edges and
  the frame's inner edge (with a click), and a guide on a dark keyline shows the line they
  snapped to. A guide shows only while the words are held: lifting the finger or the mouse (or
  the press being cancelled or lost) takes it away. They stop at the frame's inner edge; sizing or turning past it shrinks them to
  fit. They never leave the card.
- **Keyboard:** with words selected, the arrow keys move them (Shift for bigger steps), + and −
  size them, [ and ] turn them. "Back to Auto" (おまかせに戻す) in the tab returns every word to
  its preset place.

## Saved as shares of the card

A free piece is saved as its centre (x, y as shares of the face's width and height), its size
(the type size as a share of the face's short side) and its turn (radians). The face painter
lays the words from these numbers, so the live card, PNG / GIF / APNG exports, the hand and the
deck's mini cards all show the same placement, and a card of another shape keeps the words in
the same place relative to it. Switching to Free starts every piece where Auto had it.
