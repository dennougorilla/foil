# The trading-card layout

How FOIL's "Trading card" layout is built, and why. The product summary is in `README.md`; this
note is the research behind it and the direction chosen. No real game's logo, frame art or
typeface is used: only the structure and the conventions every card game shares.

## How real trading cards are built

**Magic: The Gathering** (modern frame). From the top: the title bar (name at the left, mana cost
at the right), the illustration, the type line with the expansion symbol at its right end
(coloured by rarity: black, silver, gold, orange-red), the text box (rules text, then flavour text
in italics), the power/toughness box, and a bottom line with the collector number, rarity letter,
set code and artist credit, small, in the black border. The frame is a coloured, textured
material (white, blue, black, red, green, gold, artifact grey); the title bar and type line are
lighter plates set into it with a bevelled edge; the text box is a pale, parchment-like tone of
the frame's colour; the art sits behind a thin dark line, a step below the frame.

**Pokémon TCG** (Scarlet & Violet era). Name large at the top left with the stage above it and HP
plus the type symbol at the top right; the illustration in a thin metallic frame; attacks and
abilities on a light area under the art; weakness / resistance / retreat in a row near the
bottom; illustrator, set code, collector number, regulation mark and rarity symbol in fine print
at the bottom edge. The card body takes the colour of the Pokémon's type.

**Yu-Gi-Oh!** The frame colour says the card type (orange normal, brown effect, teal spell,
magenta trap…). The name sits in a bevelled box at the top with the attribute disc at its right,
a row of level stars under it, the art in a bevelled square frame, the set number at the right
under the art, then a cream text box with a thin border: the monster type in brackets, the
effect text, and an ATK/DEF line. Passcode and copyright in fine print at the bottom.

**Disney Lorcana.** The art fills most of the card; the ink cost in a hexagon at the top left;
the name (and the version under it) on a banner across the middle; the classification line under
that; a parchment text box with the ink colour along its edge; gold filigree around the frame;
rarity, set and card number small at the bottom.

**ONE PIECE Card Game.** The art fills the card; cost at the top left, power at the top right;
the effect text on a lightly tinted panel over the lower art; the name on a banner near the
bottom with the traits (e.g. "Straw Hat Crew") small under it; the colour bar, rarity and card
number in fine print at the bottom.

**Balatro's jokers** (the game FOIL is modelled on). The card is pixel art in a light border with
stepped corners; the joker is drawn on a cream card inside it. The name and effect are not on the
face: they show in a tooltip, a dark rounded box holding a white box with the effect text
(keywords coloured) and a rarity tag (Common, Uncommon, Rare, Legendary).

Sources: [MTG Wiki: Parts of a card](https://mtg.wiki/page/Parts_of_a_card),
[Pokémon TCG rulebook (pokemon.com)](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/par_rulebook_en.pdf),
[Yu-Gi-Oh! official rulebook](https://www.yugioh-card.com/en/rulebook/),
[Mushu Report: Ink (Lorcana)](https://wiki.mushureport.com/wiki/Ink),
[How to read a One Piece TCG card](https://www.shonentcg.com/blog/one-piece-tcg-how-to-read-a-card),
and the cards themselves.

### What they share

- **The frame is the material.** A coloured, textured border whose colour carries meaning (colour,
  type or rarity). It is never a UI panel.
- **Plates set into it.** The name box, the type line and the text box are lighter plates (paper,
  parchment, stone) inset in the frame: a bevel or a thin keyline round them, a faint shadow
  where they meet the frame, dark ink on them.
- **The art is a step down.** A thin dark line or a bevel round the illustration makes it sit
  below the frame.
- **A clear order of reading:** name (large, bold) > art > rules / effect text (a readable book
  face, flavour in italics) > the type line (small) > fine print.
- **Fine print at the edges:** the set symbol (often coloured by rarity), card number, artist,
  set code, small and out of the way.

## FOIL's version

FOIL builds the same structure from its own frames (Paper, Ink, Brass, By rarity, or any colour)
and its own type (DotGothic16 for the name, the message's typeface for the card text). Three
directions were drawn and judged side by side by a juror who did not know which was FOIL's
favourite:

| | Direction | Plates | Art |
|---|---|---|---|
| A | **Classic** | Parchment plates inset in the frame with a bevel, a keyline and a faint shadow | A thin ink line with an inner shadow, a step below the frame |
| B | **Modern** | The name printed straight on the frame; a parchment ribbon for the type line over the art's foot; a frosted panel for the text | Large, under a thin line |
| C | **Pixel classic** | As A, but cut in pixels: stepped corners, hard two-tone bevels, dithered shadows | Stepped corners and a hard pixel bevel |

**Chosen: C, pixel classic.** Two jurors who did not know the work scored each direction for
"looks like a real card and not cheap"; with two jurors the lower score counts. Round 1: A 4,
B 3, C 5 (the other juror: A 7.4, B 5.8, C 6.9). B's pill ribbon and frosted panel read as web UI
to both. C's plates feel like physical objects set into the frame, and its pixel build belongs to
FOIL (and Balatro), where A's soft bevels read as boxes on a page. Only C is in the code.

What C is now (after three rounds; the jurors' notes in brackets):

- **The frame is printed stock:** the frame's own colour under a fine ordered dither, deeper
  towards the card's edge, with a stepped rule inside it. Under the Paper frame the stock is a
  warm tan, so the parchment plates stand off it ("cream plates vanish on a cream frame").
- **Plates** (name, type line, text): parchment set into the stock with stepped pixel corners, a
  thin dark keyline, a shallow hard drop, and two hard tones (a narrow lit top and left edge, a
  shaded foot and right edge). On a dark frame the parchment is a step dimmer so it doesn't glare.
- **The art sinks below the frame:** a thin ink line with stepped corners, a lit lip under its
  foot, and its own top and left edges in pixel shadow.
- **Type:** the name in the pixel face set bold and large; the type line small; the card text in
  the message's typeface, centred, wrapped evenly and as large as its box allows.
- **Marks:** the rarity diamonds on the name plate (always in the rarity's colour); FOIL's set
  emblem, a pixel star in the rarity's colour, at the end of the type line; fine print at the
  foot in the frame's ink: the emblem, "FOIL" and the year, and "No. 1/1" (every FOIL card is a
  one-off).

Scores, C only (lower of the two jurors): round 1: 5, round 2: 5 (other juror 7.2), round 3:
5.5 (other juror 7.2). Open points from the jurors: the outer black rim and the stage's drop
shadow make the card look thick (that is the stage, shared by every layout); the purple rarity
stock reads as a skin rather than a premium material; the diamonds and the set emblem are two
rarity signals (the diamonds stay: the name plate carries the rarity, as asked); a juror would
like a true bitmap Japanese face with no smoothing for every line of text.

## On a wide card

The stack above is made for an upright card. Laid on its side (Wide, the postcard on its side, the
business card) the same stack squeezed every plate into a thin strip under a short, wide picture.
A wide card puts the picture and the words side by side instead, keeping the conventions above (a
name plate across the top, the art a step below the frame, the words on parchment plates, the fine
print across the foot): the picture takes the left of the card and the type line and the text box
stand beside it as a column on the right, the text box filling the column's height. The plates
keep the trading card's own heights (the face's short side is 900 px on every shape), so the name
and the type line read at the same size as on an upright card. The card text is set at the top of
its box, under the type line, in a band as tall as an upright card's box for the same lines, so it
reads at the same size as there (real cards leave short rules text the rest of the box too); where a
line would wrap in the narrower column the text gives way, down to a fifteenth of the column's
width, before it wraps. Without card text there is no column: the type line
runs under the picture as on an upright card, and with neither the card is full-art. Square and
upright shapes are unchanged.

Judged by a juror who did not know the work (strict, three rounds at most): with the text centred
in the tall box, 7 / 7.5 / 7 / 7.5 (design, usability, creativity, content); set under the type
line as now, about 7 / 7.3 / 7.5 / 7.5. Open points: a one-line message leaves most of the box
empty (weakest on a card without a type line), English rules text wraps into a narrow three-line
stack, and the juror would quieten the box's border and paper texture so the words lead.

## The finish area's text region

The Layers tab's "text" region is found by drawing the face again with its words blanked and keeping
what changed. On a trading card the parts follow the words (no card text, no text box), so blanking
them used to change the card itself: the picture grew into the empty room and the whole picture
counted as text. The blank face keeps the parts the card has and leaves only the words out, so the
region is the lettering alone.
