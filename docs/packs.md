# Packs

How finishes beyond the first seven reach the hand, and how a pack is opened. The product
summary is in `README.md`; this note is the design behind it.

## Shape

- The hand always starts with seven hand-picked finishes (`OPEN_EDITIONS` in `src/packs.ts`):
  Base, Foil, Holographic, Polychrome, Negative, Glitch and Prism. Someone who only wants a quick
  try never downloads or compiles anything else.
- Every other finish sits in a **theme pack**. A pack holds every finish of its theme, so its size
  is the size of the theme. It is opened **once**, and opening it shows everything inside — there
  is no random draw. The excitement comes from the order: the rarest finish waits until last.
- The **hand** holds up to seven cards (at least Base, which never leaves it); it starts as the seven
  above. Every finish owned that is not in the hand is in the **deck**, which sits at the hand's
  right end like a draw pile: a few face-down card backs (the card's own back, drawn by the page from the same pixels) (a couple of steps of thickness at
  most) and the count. Opening a pack adds its finishes to the deck; at the end of an opening the
  cards fly into it and "+5" floats up from it.
- Pressing the deck opens the **deck builder** ("デッキを編成 / Edit deck"), laid out like a card game's deck-editing screen
  (Slay the Spire, Hearthstone, Marvel Snap): the hand's seven slots across the top with "6 / 7",
  and below every finish owned as a grid of the same mini cards as the hand (the person's own
  picture in that finish), with tabs for All, the starters and each pack. **All** (where it opens)
  is one list with no breaks between packs: the hand first, in its order as the builder opened,
  then everything else by family (the starters, then each pack's in pack order); a small
  pack-shaped pip in its pack's colors before each name says where it is from. The order is set
  when the builder opens, so a card never jumps away as it moves; a pack's tab shows just that
  pack, in its reveal order. A card that is in
  the hand is lifted in the grid with a gold edge and a "手札 / In hand" tag.
  - One tap moves a card: a grid card goes into the hand (into the slot last emptied, else the end);
    tapping it again, or tapping it in the hand, sends it back to the deck and leaves its slot empty
    for the next card. With the hand full, a grid card takes the place of the hand card tagged "次に外れる /
    Next out" (at first the last card that is not Base), and the tag steps to the card before it,
    so several taps swap several different cards; to choose the card yourself, tap it first (it
    goes back and its slot says "次はここ / Next here"). Dragging a grid card onto a hand slot swaps it into exactly that slot; dragging a hand card
    down to the grid sends it back. Cards fly between the two as they move.
  - Changes apply at once (closing just closes). Undo steps back one move; "初期の7枚に戻す / Reset to starters"
    puts the seven starters back. Base shows a lock in the hand and in the grid. The card's finish stays unless it was taken out of the hand, then the card
    shows Base.
  - Putting a deck finish on the card any other way (a pick in the haul, a saved card) adds it to
    the hand, taking the last place that is not Base when the hand is full.
- The mini cards are still pictures, drawn one by one with a single WebGL context when the builder
  opens and kept until the picture, the frame or the light changes; nothing in the grid animates.
- From the earlier "drawn card" slot (saved as `drawn`): that finish takes the hand's last place,
  so nobody loses the card they had out.
- The way to new packs is a small pixel pack beside the deck. It glows gently while a pack is still
  sealed (with the number sealed) and opens the **pack shop**, which holds every pack; an opened one
  offers "Watch again" there. **Open all** in the shop opens every sealed pack at once, without
  the openings (see "Open all" below). (Earlier versions had folders and a shelf of chips under the hand;
  both are gone, and a saved folder choice is ignored.)
- The **Supporter pack** replaces the old hidden-finish unlocks. It does not exist in the UI until
  one of the support links (GitHub Sponsors, Buy Me a Coffee) is opened once; then it joins the
  shop, sealed, and opens like any pack, with a richer wrapper and opening. Honor system: no
  server, nothing checks a payment.

## Themes

Grouped by what the finish *is* (its material, its source of light, the craft behind it), so a
new finish has an obvious home and a pack's theme reads at a glance from its name and wrapper.
Inside a pack the order is the reveal order; the last one is the showpiece, the finish that makes
the strongest first impression on most pictures. A theme pack holds four to six finishes (a haul
draws at most six cards at once, see the frame budget below); the Supporter pack is the one small
pack, three celebrations.

| Pack | 日本語 | Reveal order (last = showpiece) | Wrapper finish | Wrapper art |
|---|---|---|---|---|
| `metal` Metal | 金属 | Platinum → Gold → Relief → Chameleon → **Cosmo Holo** | Gold | a gold coin on a platinum ingot |
| `jewel` Jewel | 宝飾 | Crystal → Opal → Raden → **Kintsugi** | Opal | a brilliant-cut gem, a pearl, a seam of gold, on lacquer red |
| `light` Light | 光 | Galaxy → Aurora → Glow → Blacklight → **Shallows** | Holographic | a star and a planet |
| `nature` Nature | 自然 | Sakura → Frost → Stardust → Rainy Window → Marble → **Magma** | Sakura | a blossom branch |
| `studio` Studio | 工房 | Halftone → Warmth → Stained Glass → Flip Lenticular → 3D Lenticular → **Shadowbox** | Halftone | a palette and brush |
| `supporter` Supporter (celebrations) | サポーター限定 | Confetti → Snow Globe → **Fireworks** | Prism (rainbow shards on a silver-white body) | a crowned heart among fireworks |

Why each finish is where it is (reorganized after v0.13.1, when the owner asked for the Supporter
pack to be the celebrations and the rest to be tidied):

| Finish | Pack | Why |
|---|---|---|
| Platinum, Gold | Metal | Metals themselves. |
| Relief | Metal | The picture struck into a metal medal. |
| Chameleon | Metal | Color-shift car paint: a coat over metal, the card before the showpiece (added in v0.15). |
| Cosmo Holo | Metal (showpiece) | A printed metal foil, and the most striking of the four at first sight (Relief is subtle until tilted). |
| Crystal | Jewel | A cut stone: it was Metal's showpiece while Metal was "Metal & Gem"; gems now have their own pack. |
| Opal | Jewel | A precious stone. |
| Raden | Jewel | Mother-of-pearl inlaid in lacquer: a precious material worked by hand. |
| Kintsugi | Jewel (showpiece) | Gold-mended lacquer, one of a kind: the rarest-looking of the four, the old Supporter showpiece. |
| Galaxy, Aurora, Glow, Blacklight, Shallows | Light | Each is about a source of light (the night sky, a curtain of light, glow ink, a UV lamp, light under water). Unchanged. |
| Sakura, Frost, Stardust, Magma | Nature | Seasons, weather, sky and earth. Snow Globe left for the celebrations. |
| Rainy Window | Nature | Rain running down a fogged pane: weather, before the showpiece (added in v0.15). |
| Marble | Nature | Ink floating on water (suminagashi): the element water, the card before the showpiece (added in v0.15). |
| Halftone, Warmth, Stained Glass, the two lenticulars, Shadowbox | Studio | Crafts of the print shop. Unchanged. |
| Confetti, Snow Globe, Fireworks | Supporter | Celebrations, for birthday and greeting cards: confetti thrown, a globe shaken, fireworks to finish (the showpiece, the biggest show). |

Why Jewel and not a 和 (Japanese) pack for Raden and Kintsugi: with Sakura it would make three
Japanese finishes, but Sakura belongs with the seasons, and Crystal and Opal would still need a
home; precious things worked by hand hold all four together. Why no pack of three besides the
Supporter pack: a theme pack with fewer than four has little build-up before its showpiece.

### Adding a finish or a pack

1. Write the finish's GLSL in its pack's module under `src/gl/finishes/` (the module's `glsl`
   and one `dispatch` line), add the edition to `src/editions.ts`, its names to `src/i18n.ts`,
   and its id to the pack's `finishes` in `src/packs.ts` (before the showpiece, or as the new
   showpiece).
   The card can be any shape (`src/card/shape.ts`), so the finish takes the card's proportions
   from `uCardK` (the face in units of its short side; multiply a uv by it for round dots and
   square cells) and the art window from `uArt`, never from literals such as `vec2(1.0, 1.4)`;
   `tests/shape.test.ts` fails on those.
   showpiece). A finish that needs the card to itself beyond touch, a lamp or depth (a second
   picture, particles drawn over the art) gets `solo`, so it is never offered as layer 2
   (`docs/layering.md`).
2. A new pack is one more entry in `PACKS` (id, finishes, wrapper, colors, `load`) plus a module
   file, its name in both `src/i18n/` files, its wrapper's look (`LOOKS` in
   `src/pack/packArt.ts`: body colors and a pixel illustration) and its particles (`STYLES` in
   `src/pack/opening.ts`). The types make each of these required.
3. Moving a finish to another pack takes nothing more: what is owned is kept by finish, so it stays
   owned. A pack that gains a finish is sealed again for someone who opened it (see Storage).

## Storage

- `localStorage['foil:packs']` = `{"owned": ["platinum", "gold", …], "supporter": true}`: the
  pack finishes owned, not the packs, so a finish keeps being owned whichever pack it moves to.
  A pack counts as opened when every finish in it is owned. Anything that does not parse, or
  unknown ids, counts as nothing owned. Other tabs follow through the `storage` event; two tabs
  opening at once keep the union. Open all writes its packs in one save.
- **A pack that gains a finish** (a new finish, or one moved in, like Snow Globe into the
  Supporter pack) is sealed again for someone who opened it: nothing they own goes, the pack
  button counts it sealed, and the shop says "うち3種は所持済み。開けると残りの1種が入ります /
  You have 3 of them; opening it adds the other 1". Opening it again is the whole opening (a
  second go at the tear is the fun part), and only the new finishes count into the deck. Chosen
  over a "new arrivals" opening of just the new cards: one rule, nothing new to learn, and a
  one-card opening has no build-up.
- A saved card on a finish not owned (site data cleared) goes back to Holographic.
- **From earlier saves** (read once, then written over in today's shape): up to v0.13 `foil:packs`
  kept the ids of the packs opened, `{"opened": ["metal", …]}`, and before that (v0.9.0 to v0.9.3)
  `foil:secrets` the finishes unlocked by support links (each pack holding one counted as opened,
  and any unlock means a support link was opened). Both become the finishes those packs held then
  (the v0.13 table is kept in `src/packs.ts` for this alone), so the reorganization takes no finish
  from anyone: someone who opened the old Supporter pack keeps Opal, Raden and Kintsugi (Jewel then
  lacks only Crystal) and Confetti and Fireworks (the Supporter pack then lacks only Snow Globe).
  The owner asked that no owned finish be lost, so this conversion stays until those saves are gone.

## Loading (weight budget)

Nothing of a pack loads before the shop or View deck is opened, or a pack finish is in the hand
(or layer 2 on the card, `docs/layering.md`):

- `src/packs.ts` is plain data (ids, order, colors, a `load()` that dynamic-imports the module).
- Each pack module (`src/gl/finishes/<pack>.ts`) carries its finishes' GLSL and their helpers
  (Relief's map, Warmth's heat texture). The card shader is assembled per program: the core
  (common helpers, tune, range, lettering, the seven open finishes) plus one pack's finishes, so
  a pack's program is compiled only when that pack is needed, with `KHR_parallel_shader_compile`
  when available so the frame never stalls. Cards whose program is still compiling wait (hand
  cards deal in when ready; the main card arrives with its deal-in).
- Shadowbox's depth code (worker, model, pill) loads when Shadowbox is first put on the card.
- The shop and the opening (`src/pack/`: overlay, pack art, the pack mesh, motion, sounds, CSS)
  are one chunk, fetched when the pack button beside the deck is pressed. View deck is its own small chunk; its
  thumbnails are drawn once, when it opens, with the packs of the finishes in the deck. The shop then loads
  the modules of the packs on its tray for their wrappers.
- The support links only flip a flag; the Supporter pack module loads on opening.

Measured in the PR: the first-load JS (gzip) and the time to the first card frame must not get
worse; the budget and the latest numbers are in [`performance.md`](performance.md).

## The shop and the pack — measured against Balatro

The first version opened straight onto one pack hanging in an empty room, printed as smooth vector
art on a single flat quad. Next to Balatro's booster packs it read as a paper flyer. What was
missing, compared with Balatro's shop and its packs (from the game's trailers and screenshots; no
art, sprite or font from the game is used — only the grammar):

| Balatro | FOIL before | FOIL now |
|---|---|---|
| Packs are pixel art: a coarse grid scaled up, hard edges, dithered shading. | Smooth vector art at full resolution. | Each wrapper is drawn on a 128 × 208 pixel grid (about 1 : 1.6, the proportions of a real booster pack); its outline is nearly rectangular and the seals are as wide as the body or a pixel wider — no waist and scaled up with hard pixels; the wrapper finish is computed on the same grid, so its sheen moves in blocks. |
| A pack holds a stack of cards: silver crimp seals top and bottom with ridges that catch the light, a face kept flat by the cards inside, only the very edges rounding off, darker left and right edges, a slightly wavy outline. | A flat rectangle with grey stripes for seals. | Silver seals with zig-zag teeth and ridge highlights; the body is a mesh that stays flat across the face and rounds off only in a narrow band at its edges (it holds a stack of cards; it is not inflated), lit per pixel: dark rolled edges, the seals' step, foil wrinkles and a highlight that runs along them as it tilts; a back sheet shows the pack's thickness at the edges in perspective. |
| Each pack has its own big illustration on a theme color, and a huge white outlined title in an arc or a speech bubble. Higher tiers get a wavy word on top and a silver-white holo body. | The same fan of cards on every pack; a small title. | A big pixel illustration per theme (coin and ingot, cut gem and pearl, star, blossom branch, palette and brush, crowned heart among fireworks) on its color, the title in an arc of outlined letters and "ALL 5 INSIDE" / 「全5種入り」 (the pack's own count) under it; the Supporter pack is the top tier: silver-white body in a pastel rainbow, a wavy THANK YOU on top and SUPPORT as its title. |
| Thick dark outline, a hard dark drop shadow. | No outline; a faint soft shadow. | A 2-pixel ink outline in the art, a hard offset shadow under every pack, and a dark back sheet behind the bulge so tilting shows the bag's thickness; once torn, the bag shows a dark mouth under a silver lip. |
| The shop: items sit on a dark rounded tray with a thin light rim, each bobbing and slightly tilted; hovering springs it up with a wobble and leans it to the pointer. | One pack in an empty room. | The pack button at the end of the hand opens the **pack shop** (the first sealed pack chosen): every pack on a dark rounded tray, tilted a little, bobbing; hover or focus springs one up with a wobble and leans it to the pointer; the chosen one is lifted and stands in a pool of gold light. Four packs make a 2 × 2 square on a phone, five go three over two, six three over three. |
| Descriptions in a dark rounded panel with a colored title band; keywords colored. | Small grey text in a corner. | The tray and the chosen pack's panel are one chunky rounded object: under the packs, a band in the pack's color with its name, what is inside ("全5種入り" / "Includes all 5 … finishes") and the big button. Each pack's name tag says "✓ opened" beside the name once it is. |
| Fat rounded buttons, saturated, a thick dark lip that disappears when pressed. | A cream generic button. | "Open pack" is a fat red button with a dark lip that sinks when pressed (blue "Watch again" for an opened pack); the big pack's own button says "Tear open". |
| A swirling psychedelic backdrop in the current colors, CRT scanlines and grain. | The swirl, low contrast; no grain. | FOIL's swirl, faster and in the chosen pack's colors (it eases over when the choice changes), a faint grain over everything; the CRT filter, when on, covers it as it does the page. |

The shop leads into the opening: **Open** (or a click on the lifted pack, or Enter) flies the chosen
pack from the tray to the middle, big, and the tray and panel sink away; from there the beats below
run as before. Opened packs sit on the tray too, stamped "opened", and offer a replay instead. Showing
the wrappers on the tray loads the finishes of the packs on display (only once the shop is open, a
step the person asked for); until a wrapper's finish is compiled, that pack is printed in Foil.

## Open all

For someone who wants every finish now rather than the openings (the user's words: "open every
pack I can, skip, and have them"). Balatro's shop has a second fat button under the main one
(Reroll, green); the shop's panel has the same: under Open pack, a smaller green button
"全部開ける 4パック・演出なし / Open all 4 packs · no intros", the number being the sealed packs on
the tray, and the pill saying up front that the openings are skipped.

- It is there only while a pack on the tray is sealed. The Supporter pack counts only once it is on
  the tray (a support link was opened), so the button never hints at it: before that the count
  leaves it out, after it the Supporter pack is opened with the rest.
- **One extra tap, no dialog.** The first tap arms it: it turns gold, gives a wobble and a click,
  and says "もう一度で開封 / Tap again to open" for 3 s, the time left running out as a bar
  along its bottom edge; a second tap goes, the time running out (or choosing another pack)
  disarms it. Enough that a stray tap never spends the openings,
  light enough not to slow someone who wants them all; the openings stay watchable anyway.
- The second tap marks every sealed pack on the tray opened at once (one save), skips their
  openings and puts all their finishes in the deck; the hand stays as it is.
- The tray and panel sink away as for an opening and **the list** comes up in the room, the haul's
  way of showing a pack, once per pack: a title ("4パック・21種がデッキに入りました / 21 new
  finishes from 4 packs", and under it that they are in the deck and the hand is chosen in Edit
  deck), then one row per pack in shop order, headed by the pack's name on its color and "新規 +5 / +5 new", its
  cards in a row with the showpiece in the middle (a size up, ringed in gold, "★ 大トリ / Grand
  finale" on its lower edge, just ★ on small cards, its name in gold), names under the cards. Rows
  go one or two columns, whichever shows every row on the screen, then whichever has the bigger
  cards. The rows deal in one after another, Balatro-quick: each card flips up off the card back
  (40 ms apart, one rising click per row) and the room takes each row's pack colors as it lands.
  Everything is in place within about a second, and the buttons work from the first frame.
  In a pack sealed again after it gained a finish, the ones owned before keep their place but sit
  quieter (desaturated, tagged "所持済み / Owned"), and "+n" and the title count only the new ones.
- The cards in the list are not drawn with their finishes: that would compile every pack's shader
  at once, for a list. Each is the person's card face as it is, washed in its finish's own colors
  with a passing sheen — a swatch, labeled by name. The finishes compile when they are used (the
  deck builder, the hand, a replay).
- Under it: "閉じる / Close" (quiet) — the cards fly into the deck, which counts up, with a toast —
  and "デッキを編成 / Edit deck" (primary), which closes and opens the deck builder over
  everything owned. Escape and × close as Close does.
- Every pack opened this way offers "Watch again" in the shop, like any opened pack.
- Held still (reduced motion), the rows fade in without flips and nothing flies into the deck.
- The swirl dims behind the list so the names stay readable. In two columns a last row on its
  own takes the middle.
- On a phone the rows take the width (up to five cards across; a pack of six goes three over
  three, the showpiece in the middle of the top line), and the list scrolls between the title and
  the buttons when it is taller than the screen, fading at its bottom edge while more is below.

## Opening — what makes the references feel good

Studied: Pokémon TCG Pocket's pack opening (phone) and Balatro's booster packs (PC/phone).

**Pokémon TCG Pocket, beat by beat**

1. The chosen pack grows to the middle and hangs there, swaying a little; its foil catches the
   light as the phone tilts. Nothing happens until you act — the pack waits for you.
2. A thin guide across the top: you trace it with a finger. A line of light follows the finger
   exactly, with a spark at the tip and a rising "riiip" that you produce yourself. Lift early
   and the line fades; nothing is lost.
3. Finish the line and the top tears away; light spills out of the opening.
4. The pack drops away and the cards rise out as a face-up stack.
5. You swipe the top card off; it follows the finger, leans, and flies off past a small
   threshold (or snaps back). The next card pops forward. Rhythm: one swipe per card, quick.
6. The rare slot breaks the rhythm: a glow, a pause, a flip with a burst and a shake that grows
   with rarity — the build-up is longer than the reveal.
7. Finally all cards are laid out together, dealt in one by one, so you see the whole haul.

**Balatro**

1. The pack jiggles (a decaying rotational wobble) and pops; the background swirl changes to the
   pack's color — the room changes, not just the object.
2. Cards are dealt along an arc with springy overshoot, staggered, each with a click whose pitch
   rises (C, D, E, G…).
3. Flips are a squash on one axis with a bounce at the end; every impact gets a small shake, a
   flash and chunky pixel particles.
4. Everything idles: cards float and lean toward the pointer, so the scene never freezes.
5. All of it can be turned down (shake, CRT), and nothing ever blocks input for long.

What we take: the **self-made tear** (Pocket 2), the **swipe rhythm broken by a charged
showpiece** (Pocket 5–6), the **haul shown together** (Pocket 7), and Balatro's **springs,
wobble, rising pitch, pixel particles and the room changing color**. Skippable everywhere.

## Opening — our beats

Times in ms. Springs are `k / d` (stiffness / damping, as in `src/stage.ts`). Sounds are
synthesised (`src/audio.ts` primitives); vibration only where `navigator.vibrate` exists and
follows the sound toggle.

| # | Beat | Motion | Light / particles | Sound | Vibrate |
|---|---|---|---|---|---|
| 0 | **Summon** (0–520) | Overlay fades in (220, ease-out). The pack flies from its place on the shop's tray to the centre: scale 0.3 → 1 on a spring 170/13 (one overshoot), a decaying wobble ±0.22 rad. Title drops in (200, delay 220). | The room becomes FOIL's swirl in the pack's colors. | Whoosh (noise 400 → 2400 Hz, 280) | 8 |
| 1 | **Invite** (until touched) | Pack floats (±6 px, 0.5 Hz) and leans to the pointer or gyro (spring 210/17, ±0.3 rad); its foil follows the tilt. | The perforation glows softly, pulsing. | — | — |
| 2 | **Trace** (finger) | Press in the top band (top 24 % of the pack, generous) and slide: progress = furthest x reached, never goes back. The pack leans toward the finger (≤0.1 rad) and trembles with finger speed. Release before 82 % → the line drains back (260, ease-in). Tap the pack, Enter/Space or the one short line under it ("なぞって開封 →", a button) → an automatic trace (480, ease-in-out). The perforation glows and a gold arrow nudges at its left end; nothing else sits under the pack, and Skip / × are small in the top corner. The line appears once the pack has landed. | A white-hot line from the left edge to the finger, with bloom; 2–3 sparks per frame from the tip (gravity). | A noise tick every 4 % with pitch rising with progress ("riiip"); a fizzle on cancel. | 6 every 12 % |
| 3 | **Rip** (0–350) | The top strip flies off (up and to the side, spin, gravity, fades by 700). The body punches 1 → 1.06 → 1 (spring 320/14). Screen shake 220, 10 px, exponential decay. | White flash on the pack (0.6, gone in about 0.12 s), light pours from the opening, 40 sparks upward. | Rip (noise 700 → 5000 Hz, 320) + low thump (90 Hz) | 18, 30, 40 |
| 4 | **Draw** (350–1250) | The stack rises out of the pack while the pack slides down (both springs), so the cards come up in full view, never past the top of the screen; at 420 the pack lets go and falls away under gravity with a little spin, and 100 later the stack settles where it was, landing at 900. | Pack flash fades; background deepens. | Slide + thock (140 Hz) | 10 |
| 5 | **Swipe** (per card) | Face-up stack; the top card follows the finger (rubber band, leans rz = dx·0.0012). Past 28 % of its width or a flick > 800 px/s it flies off that way (260, ease-in); else it snaps back (spring 260/18). The next card pops (scale 0.94 → 1, spring 320/14). Tap / → / Enter sends it off automatically. | Name and line of the finish under the stack, swapped with a short pop; "1 / 5" above the name says how far along it is. Second-to-last card (rare): a light sweep across it and 18 sparkles when it surfaces. | Swish per card; pop on the next; rare: two-note chime | 8 (rare: 14) |
| 6 | **Showpiece** | The last card comes face-down on the card back every card wears (src/card/back.ts), edges glowing, trembling, sparks rising off it. Press (or →/Enter): "Revealing…" — it charges 900 — scale 1 → 1.08, tremble 0 → 6 px, the room darkens — then flips (420, ease-out-back) with a punch 1.08 → 1.18 → 1. | Rays rotate in behind it, at the flip: flash 0.9, 70 particles in its colors and white, shake 360 at 16 px. The banner "★ name" lands with overshoot. Then, held a little larger, a light sweeps across it once (1.6 s) while the rays hold back to a third, so its own finish is the peak; then the rays come up and it keeps rocking slowly. | Rising charge (180 → 720 Hz), then a boom + a four-note chord + a sparkle arpeggio | 10 pulses quickening, then 40, 40, 80 |
| 7 | **Haul** | All cards deal into a row from the stack (staggered 90, spring 170/13, a little fan), each live on the person's own picture, floating and leaning to the pointer. Names under them. | Rays settle to a slow glow behind the showpiece. | Deal clicks with rising pitch | — |
| 8 | **Try it** | The title says what happened ("You have all 5 Nature finishes"), the line under it what to do ("Pick one to try on your picture"); once the showpiece is up, its hint says "See all 5". Primary: "Use Magma" (the showpiece by name) — closes, sends the other cards into the deck and swaps this one into the hand for its last card that is not Base, and onto the card (the card's own flip). Tapping any card in the haul picks that finish instead. Secondary: "To the deck". Back on the page, the new folder pops on the shelf and a toast says where it is and what picking it does. | — | Select chime (existing) | — |

**The card's shape** — every card in the opening, the haul and the deck builder is drawn in the
card's own shape (README): the stack at the trading card's area, the haul and the deck builder's
mini cards fitted into the trading card's room, so a wide or square card never stretches; the pack
and its wrapper stay as they are.

**Under a card** (beats 5–6) the words stand in one column, never overlapping: progress and tag,
the finish's name, its line (one line, cut with … when long), then the next-step button. The card
is sized to leave room for that column; on a low screen (664 px, a phone on its side) the card gets
smaller instead of the words moving onto each other.

**Skip** (「結果へ」, small in the top corner, from beat 0) jumps to the haul (the cards deal in); **×** beside it closes.
A replay starts at beat 0 too. Escape closes from the shop, while the pack loads and from the haul, and skips the reveal from anywhere else (Skip while loading goes to the haul once the pack can be drawn); the
pack counts as opened from the rip (or Skip) on, so closing before the rip leaves it sealed.
With a keyboard at hand, each hint shows its key (Enter, →).

**Each theme's particles** are its own: Metal throws hot sparks that fall fast, Light lets star
motes float up, Nature's are petals that drift and sway, Studio's are print dots in cyan, magenta,
yellow and paper, Jewel's gem glints in white, pearl, pink and ice, the Supporter pack's confetti in gold and bright colors. The haul is calmer than the reveal: the room dims
and the rays drop to 40 %. When it closes, the cards fly from the haul into the deck, which bumps and counts up; a toast says
how many went in.

**Supporter pack** — everything above, one step richer: the top-tier wrapper (silver-white body in
a pastel rainbow printed in Prism, a wavy THANK YOU on top), gold dust drifting in the room the whole time, a golden shower at the rip, every card
gets the next tier's entrance (the first already chimes), the showpiece gets a double ray set, gold
confetti and a lower boom, and the room takes the pack's colors.

**Reduced motion** — a different, still opening: the overlay fades; the pack stands still (no
float, no lean, no shake, no particles). Tracing still works and draws the line, Open is a button.
After the tear the haul appears directly: the cards fade in one after another (200 each, 150
apart), the showpiece last with a steady glow ring and its ★ banner. Sound and vibration stay
(they are not motion).

**Frame budget** — 60 fps on a mid-range phone: the stage underneath stops drawing while the
overlay is open, the overlay's canvas caps its pixel ratio like the stage (1.5 on phones), at most
6 cards are drawn at once, particles are capped at 512, and the overlay's WebGL context is let go
when it closes.
