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
- The hand never grows past the seven, plus one **drawn card**. Everything an opened pack holds
  goes into the **deck**, which sits at the right end of the hand like a draw pile: a stack of
  face-down pixel card backs that gets thicker with each finish in it, and its count. At the end of
  an opening the cards fly into it.
- Pressing the deck opens **View deck**: every finish owned, grouped pack by pack under a small
  mark in the pack's color, as small still thumbnails on the person's own picture (made only when
  the list is opened). Choosing one puts it in the hand's eighth slot — the drawn card — and onto
  the card; choosing another swaps it. The drawn card is remembered. Putting a pack finish on the
  card any other way (a pick in the haul, a saved card) also makes it the drawn card.
- The way to new packs is a small pixel pack beside the deck. It glows gently while a pack is still
  sealed (with the number sealed) and opens the **pack shop**, which holds every pack; an opened one
  offers "Watch again" there. (Earlier versions had folders and a shelf of chips under the hand;
  both are gone, and a saved folder choice is ignored.)
- The **Supporter pack** replaces the old hidden-finish unlocks. It does not exist in the UI until
  one of the support links (GitHub Sponsors, Buy Me a Coffee) is opened once; then it joins the
  shop, sealed, and opens like any pack, with a richer wrapper and opening. Honor system: no
  server, nothing checks a payment.

## Themes

Grouped by what the finish *is* (its material or source of light), so a new finish has an
obvious home. Inside a pack the order is the reveal order; the last one is the showpiece, the
finish that makes the strongest first impression on most pictures (so Crystal's facets close
Metal, not Relief, which is subtle until it is tilted).

| Pack | 日本語 | Reveal order (last = showpiece) | Wrapper finish | Room for (in progress elsewhere) |
|---|---|---|---|---|
| `metal` Metal & Gem | 金属 | Relief → Gold → **Crystal** | Gold | Platinum |
| `light` Light | 光 | Galaxy → Aurora → **Shallows** | Holographic | Cosmo Holo, Phosphor (蓄光), Blacklight |
| `nature` Nature | 自然 | Sakura → Frost → **Magma** | Sakura | — |
| `studio` Studio | 工房 | Halftone → Warmth → **Shadowbox** | Halftone | Stained Glass, Lenticular |
| `supporter` Supporter | サポーター限定 | Opal → Raden → **Kintsugi** | Opal (rainbow on a silver-white body) | — |

Why not a separate 和 (Japanese) pack: today only Sakura would be in it (Kintsugi and Raden are
supporter finishes), and a one-card pack has no build-up. Sakura sits with the other seasons and
elements in Nature; a 和 pack can be split off once it has three finishes.

### Adding a finish or a pack

1. Write the finish's GLSL in its pack's module under `src/gl/finishes/` (the module's `glsl`
   and one `dispatch` line), add the edition to `src/editions.ts`, its names to `src/i18n.ts`,
   and its id to the pack's `finishes` in `src/packs.ts` (before the showpiece, or as the new
   showpiece).
2. A new pack is one more entry in `PACKS` (id, finishes, wrapper, colors, `load`) plus a module
   file and its two names in `src/i18n.ts`. Nothing else lists packs.
3. Someone who already opened a pack finds a finish added to it later straight in the hand.

## Storage

- `localStorage['foil:packs']` = `{"opened": ["metal", …], "supporter": true}`. Anything that
  does not parse, or unknown ids, counts as nothing opened. Other tabs follow through the
  `storage` event; two tabs opening at once keep the union.
- A saved card on a finish whose pack is sealed (site data cleared) goes back to Holographic.
- **From the old unlocks** (`foil:secrets`, the list of finishes unlocked by support links, v0.9.0
  to v0.9.3): every pack holding an unlocked finish counts as opened, and any unlock at all means a
  support link was opened, so the Supporter pack shows (opened if one of its finishes was
  unlocked). The old key is then removed. Nobody loses a finish they had. This one conversion is
  the only migration and goes once v0.9 saves are no longer around.

## Loading (weight budget)

Nothing of a pack loads before the shop or View deck is opened, or a pack finish is the drawn card:

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

Measured in the PR: the first-load JS (gzip) and the time to the first card frame must not be
worse than v0.9.3.

## The shop and the pack — measured against Balatro

The first version opened straight onto one pack hanging in an empty room, printed as smooth vector
art on a single flat quad. Next to Balatro's booster packs it read as a paper flyer. What was
missing, compared with Balatro's shop and its packs (from the game's trailers and screenshots; no
art, sprite or font from the game is used — only the grammar):

| Balatro | FOIL before | FOIL now |
|---|---|---|
| Packs are pixel art: a coarse grid scaled up, hard edges, dithered shading. | Smooth vector art at full resolution. | Each wrapper is drawn on a 128 × 192 pixel grid (2 : 3) and scaled up with hard pixels; the wrapper finish is computed on the same grid, so its sheen moves in blocks. |
| A pack holds a stack of cards: silver crimp seals top and bottom with ridges that catch the light, a face kept nearly flat by the cards inside, only the edges and the ends near the seals rounding off, darker left and right edges, a slightly wavy outline. | A flat rectangle with grey stripes for seals. | Silver seals with zig-zag teeth and ridge highlights; the body is a mesh that stays flat across the face and rounds off only at its edges and toward the seals (it holds a stack of cards; it is not inflated), lit per pixel: dark rolled edges, the seals' step, foil wrinkles and a highlight that runs along them as it tilts; a back sheet shows the pack's thickness at the edges in perspective. |
| Each pack has its own big illustration on a theme color, and a huge white outlined title in an arc or a speech bubble. Higher tiers get a wavy word on top and a silver-white holo body. | The same fan of cards on every pack; a small title. | A big pixel illustration per theme (gem and coin, star, blossom branch, palette and brush, crowned heart) on its color, the title in an arc of outlined letters and "ALL 3 INSIDE" / 「全3種入り」 under it; the Supporter pack is the top tier: silver-white body in Opal's rainbow, a wavy THANK YOU on top and SUPPORT as its title. |
| Thick dark outline, a hard dark drop shadow. | No outline; a faint soft shadow. | A 2-pixel ink outline in the art, a hard offset shadow under every pack, and a dark back sheet behind the bulge so tilting shows the bag's thickness; once torn, the bag shows a dark mouth under a silver lip. |
| The shop: items sit on a dark rounded tray with a thin light rim, each bobbing and slightly tilted; hovering springs it up with a wobble and leans it to the pointer. | One pack in an empty room. | The pack button at the end of the hand opens the **pack shop** (the first sealed pack chosen): every pack on a dark rounded tray, tilted a little, bobbing; hover or focus springs one up with a wobble and leans it to the pointer; the chosen one is lifted and stands in a pool of gold light. Four packs make a 2 × 2 square on a phone, five go three over two. |
| Descriptions in a dark rounded panel with a colored title band; keywords colored. | Small grey text in a corner. | The tray and the chosen pack's panel are one chunky rounded object: under the packs, a band in the pack's color with its name, what is inside ("全3種入り" / "Includes all 3 … finishes") and the big button. Each pack's name tag says "✓ opened" beside the name once it is. |
| Fat rounded buttons, saturated, a thick dark lip that disappears when pressed. | A cream generic button. | "Open pack" is a fat red button with a dark lip that sinks when pressed (blue "Watch again" for an opened pack); the big pack's own button says "Tear open". |
| A swirling psychedelic backdrop in the current colors, CRT scanlines and grain. | The swirl, low contrast; no grain. | FOIL's swirl, faster and in the chosen pack's colors (it eases over when the choice changes), a faint grain over everything; the CRT switch adds scanlines as on the page. |

The shop leads into the opening: **Open** (or a click on the lifted pack, or Enter) flies the chosen
pack from the tray to the middle, big, and the tray and panel sink away; from there the beats below
run as before. Opened packs sit on the tray too, stamped "opened", and offer a replay instead. Showing
the wrappers on the tray loads the finishes of the packs on display (only once the shop is open, a
step the person asked for); until a wrapper's finish is compiled, that pack is printed in Foil.

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
| 1 | **Invite** (until touched) | Pack floats (±6 px, 0.5 Hz) and leans to the pointer or gyro (spring 210/17, ±0.3 rad); its foil follows the tilt. | A bead of light runs along the dotted cut guide every 1.6 s; after 2.2 s of nothing, a ghost finger traces it once. | — | — |
| 2 | **Trace** (finger) | Press in the top band (top 24 % of the pack, generous) and slide: progress = furthest x reached, never goes back. The pack leans toward the finger (≤0.1 rad) and trembles with finger speed. Release before 82 % → the line drains back (260, ease-in). Tap, Enter/Space or the Tear open button under the hint → an automatic trace (480, ease-in-out). The perforation glows and a gold arrow nudges at its left end; the hint and button appear once the pack has landed. | A white-hot line from the left edge to the finger, with bloom; 2–3 sparks per frame from the tip (gravity). | A noise tick every 4 % with pitch rising with progress ("riiip"); a fizzle on cancel. | 6 every 12 % |
| 3 | **Rip** (0–350) | The top strip flies off (up and to the side, spin, gravity, fades by 700). The body punches 1 → 1.06 → 1 (spring 320/14). Screen shake 220, 10 px, exponential decay. | White flash on the pack (0.6, gone in about 0.12 s), light pours from the opening, 40 sparks upward. | Rip (noise 700 → 5000 Hz, 320) + low thump (90 Hz) | 18, 30, 40 |
| 4 | **Draw** (350–1250) | The stack rises out of the pack while the pack slides down (both springs), so the cards come up in full view, never past the top of the screen; at 420 the pack lets go and falls away under gravity with a little spin, and 100 later the stack settles where it was, landing at 900. | Pack flash fades; background deepens. | Slide + thock (140 Hz) | 10 |
| 5 | **Swipe** (per card) | Face-up stack; the top card follows the finger (rubber band, leans rz = dx·0.0012). Past 28 % of its width or a flick > 800 px/s it flies off that way (260, ease-in); else it snaps back (spring 260/18). The next card pops (scale 0.94 → 1, spring 320/14). Tap / → / Enter sends it off automatically. | Name and line of the finish under the stack, swapped with a short pop; "1 / 3" above the name says how far along it is. Second-to-last card (rare): a light sweep across it and 18 sparkles when it surfaces. | Swish per card; pop on the next; rare: two-note chime | 8 (rare: 14) |
| 6 | **Showpiece** | The last card comes face-down on a back printed in the pack's colors and emblem, edges glowing, trembling, sparks rising off it. Press (or →/Enter): "Revealing…" — it charges 900 — scale 1 → 1.08, tremble 0 → 6 px, the room darkens — then flips (420, ease-out-back) with a punch 1.08 → 1.18 → 1. | Rays rotate in behind it, at the flip: flash 0.9, 70 particles in its colors and white, shake 360 at 16 px. The banner "★ name" lands with overshoot. Then, held a little larger, a light sweeps across it once (1.6 s) while the rays hold back to a third, so its own finish is the peak; then the rays come up and it keeps rocking slowly. | Rising charge (180 → 720 Hz), then a boom + a four-note chord + a sparkle arpeggio | 10 pulses quickening, then 40, 40, 80 |
| 7 | **Haul** | All cards deal into a row from the stack (staggered 90, spring 170/13, a little fan), each live on the person's own picture, floating and leaning to the pointer. Names under them. | Rays settle to a slow glow behind the showpiece. | Deal clicks with rising pitch | — |
| 8 | **Try it** | The title says what happened ("You have all 3 Nature finishes"), the line under it what to do ("Pick one to try on your picture"); once the showpiece is up, its hint says "See all 3". Primary: "Try Magma" (the showpiece by name) — closes, sends the other cards into the deck and puts this one in the hand as the drawn card (the card's own flip). Tapping any card in the haul picks that finish instead. Secondary: "Done" (カードに戻る). Back on the page, the new folder pops on the shelf and a toast says where it is and what picking it does. | — | Select chime (existing) | — |

**Skip reveal** (top right, from beat 0) jumps to the haul (the cards deal in); **×** beside it closes.
A replay starts at beat 0 too. Escape closes from the haul and skips the reveal from anywhere else; the
pack counts as opened from the rip (or Skip reveal) on, so closing before the rip leaves it sealed.
With a keyboard at hand, each hint shows its key (Enter, →).

**Each theme's particles** are its own: Metal throws hot sparks that fall fast, Light lets star
motes float up, Nature's are petals that drift and sway, Studio's are print dots in cyan, magenta,
yellow and paper, the Supporter pack's gold leaf. The haul is calmer than the reveal: the room dims
and the rays drop to 40 %. When it closes, the cards fly from the haul into the deck, which bumps and counts up; a toast says
how many went in.

**Supporter pack** — everything above, one step richer: the top-tier wrapper (silver-white body in
Opal's rainbow, a wavy SUPPORTER on top), gold dust drifting in the room the whole time, a golden shower at the rip, every card
gets the next tier's entrance (the first already chimes), the showpiece gets a double ray set, gold
confetti and a lower boom, and the room takes Kintsugi's colors.

**Reduced motion** — a different, still opening: the overlay fades; the pack stands still (no
float, no lean, no shake, no particles). Tracing still works and draws the line, Open is a button.
After the tear the haul appears directly: the cards fade in one after another (200 each, 150
apart), the showpiece last with a steady glow ring and its ★ banner. Sound and vibration stay
(they are not motion).

**Frame budget** — 60 fps on a mid-range phone: the stage underneath stops drawing while the
overlay is open, the overlay's canvas caps its pixel ratio like the stage (1.5 on phones), at most
6 cards are drawn at once, particles are capped at 512, and the overlay's WebGL context is let go
when it closes.
