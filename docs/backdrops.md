# Backdrops

What sits behind the card, on the stage and in every moving file (issue #44). The swirl stays the
default; eight more are there to make a card look its best in a GIF, an APNG or a video.

## The list

The card is the subject: every backdrop stays darker and calmer than the card, keeps its detail away
from the card's middle, and leaves the brightest light to the foil. Each is drawn at a quarter of the
frame's size and scaled up pixelated, like the swirl, so it belongs to the same pixel world as the card.

| Backdrop (en) | (ja) | Look | Motion in one loop |
| --- | --- | --- | --- |
| Swirl | うずまき | Poster-paint arms in the finish's own colors (the default) | Breathes out and back |
| Felt | フェルト | A green felt card table under a lamp, the pool of light round the card, darker towards the rails (the game FOIL is modelled on) | Still |
| Studio | スタジオ | A photo studio's seamless paper sweep in deep grey, a soft spotlight behind the card and a glossy floor | Still |
| Velvet | ベルベット | Wine-red velvet in soft folds lit from above, like a jeweller's showcase | Still |
| Bokeh | ボケ | A dark room full of soft out-of-focus lights in the finish's colors | Each light circles once |
| Stars | 星空 | A night sky with a faint band of the Milky Way, pixel stars twinkling | Twinkles; one shooting star |
| Confetti | 紙吹雪 | Confetti in party colors falling and fluttering on a dark wall | Falls one frame's height |
| Plain | 無地 | One flat color, picked with the color picker | Still |
| Clear | 透明 | No backdrop in a file: GIF and APNG are transparent (the stage shows a dark checkerboard) | Still |

Considered and left out: a neon night (its saturated tubes fight the finishes' own colors for the eye),
a synthwave grid (reads as a template).

## Rules

- **The stage is the preview.** The stage and every file draw the same backdrop at the same moment of
  the loop: its place in the loop is the motion's (`backdropPhase` in `src/backdrop.ts`: the idle clock
  over the loop's length, see [`motion.md`](motion.md)). Every moving backdrop goes round a whole
  number of times in one loop, so a file closes without a seam. At speed zero and under reduced motion
  nothing moves on its own, so the backdrop holds still on the stage too (a file still moves).
- **Framed on the card.** A backdrop is laid out in units of the card's height round the card's middle
  (`uFocus`, `uCard`), so the lamp, the spotlight or the stars sit round the card the same way on a
  wide screen, a phone and in a 4 : 5 file. Only how many backdrop pixels there are differs.
- **The light motions' dim room** darkens every backdrop alike (`.room` on the stage, the same shade in
  a file), and the pointer's small parallax on the stage is a hand, like tilting the card: a file has
  none.
- **Clear** follows the transparency the files already had: a GIF keeps one fully clear color, so it
  drops the shadow and its edge pixels keep the card's border color or blend into the matte you pick
  (GIF and APNG options); an APNG keeps the soft shadow and every color. The PNG is always the card
  alone on a clear background, whatever the backdrop.
- **Drawing less on slow devices** is not each backdrop's business. The drawing level
  (`src/quality.ts`) applies to whichever backdrop is drawn: the backdrop renderer is the one place it
  is sized and, on slow levels, held still. No backdrop has a light version of its own.

## Where it is chosen

Fine-tune → **Card**, under the card's frame, shape and layout: one tile per backdrop with a small
picture of it and its name, and a color button while Plain is picked. The GIF and APNG options name
the backdrop beside the motion, with a link to the tiles.

There is no quick switch on the stage. The stage already carries the motion button by the deck, and on
a phone the hand fills the width; a second button there would compete with the card for a setting
that is picked once per card, not tried again and again like the motion. Fine-tune opens on the Card
tab, so the tiles are two taps away.

## Code

- `src/backdrop.ts` (first load, small): the list, the saved choice's checks and `backdropPhase`.
- `src/gl/backdrops.ts` (on demand): every backdrop but the swirl as a fragment shader on the swirl's
  quad, fetched when one is picked (at once if one was left picked) or the pointer reaches the tiles.
  The swirl stays in `src/gl/shaders.ts`, so a first visit loads nothing new.
- `BackgroundRenderer` (`src/gl/renderers.ts`) takes a backdrop's shader with `use()`, compiling it in
  the background on the stage and keeping the old one on screen until it is ready.
- `createScene` (`src/exporter.ts`) draws the backdrop of `ExportInput.backdrop` under every file's
  frames; GIF, APNG and anything else made from the scene get it from there.

To add a backdrop: add its id to `BACKDROPS` and its names to both languages, write its shader in
`src/gl/backdrops.ts` (it reads `uPhase` as the loop's place, whole turns only, and `uCard`/`uFocus`
for where the card is), give its tile a picture in `features.css`, and list it above.
