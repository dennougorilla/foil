# FOIL features

The detailed behavior of FOIL, one area at a time. The short tour is in [`README.md`](../README.md).

## Picture

- Bring an image by choosing a file, dropping it anywhere, or pasting (Ctrl+V). PNG, JPEG, WebP and GIF are read; animated GIF, APNG and animated WebP keep moving on the card. It never leaves your browser.
- Three samples are there to start with. Zoom and drag the window to choose what the card shows (arrow keys and + − work too).
- Your picture, and Flip Lenticular's other picture, are kept in this browser (IndexedDB) across reloads.

## The side panel

- The side panel is a game's side table, in the same grammar as the rest of FOIL (and of the game it is modelled on): a slate board with a light rim, a black outline and a deep drop, and on it three dark, sunken boxes for the main flow, each under a small colored label with its number: **1 Choose a picture** (samples, open a file, crop and zoom), **2 Choose a finish** (a live proof of the card, its finish, and a way to the hand), **3 Export** — the format (PNG, GIF or APNG, each saying what it makes) and Save, in a box pinned to the bottom, with **Keep** (into the binder) and **Share** as two small slabs beside its label.
- Each step owns one color (blue for the picture, orange for the finish and Fine-tune, red for Save), and buttons are thick slabs in those colors with a dark underside: they swell and wobble a little under the pointer and sink when pressed (still under reduced motion). The bright slab marks the one next step: while a sample is showing, opening your own picture is blue and Save rests in slate; once the picture is yours, Save is red, and when the file is saved it turns green for a moment with a gold "done" tag and the file's name. Values sit large in dark pockets and pop whenever they change (a drag, a choice or a reset).
- Everything finer sits behind **Fine-tune**, a slate slab that stays closed until you open it (and remembers that). Open, steps 1 and 2 fold into one line each (the picture or a proof of the card, its name, and **Change** to go back to the step) and Fine-tune holds four tabs: **Card** (finish strength, frame, shape, layout, pixelation), **Shine**, **Lettering** (the message, the nameplate, how all the card's text is printed, and placement) and **Layers** (which finishes the card wears and where each goes). The open tab is orange and stands up off the row, and a green gem on a tab means something in it differs from the defaults. On phones, a live view of the card rides in the Save box while you tune Shine.

## Hand, deck and packs

- Pick a finish from the fanned hand at the bottom; each card in the hand is a live preview. The hand starts with seven finishes: the five editions of the game FOIL is modelled on (Base, Foil, Holographic, Polychrome and Negative), plus Prism and Glitch. Number keys pick the cards in the hand in order, ← → step through them. Press the logo to shuffle the finish.
- Every other finish comes in a theme pack: **Metal** (Relief, Gold, Platinum, Cosmo Holo, Crystal), **Light** (Galaxy, Aurora, Glow, Blacklight, Neon, Shallows), **Nature** (Sakura, Frost, Stardust, Snow Globe, Magma) and **Studio** (Halftone, Warmth, Stained Glass, Flip Lenticular, 3D Lenticular, Shadowbox). The small pack beside the deck at the right end of the hand (it glows while one is sealed) opens the pack shop, where every pack sits on a tray.
- A pack is opened once and holds its whole theme, with no random draws: trace the line across its top to tear it, swipe through the cards, and the rarest one waits until last for its own entrance. Skip jumps straight to the result, and the cards are shown on your own picture so you can try them at once. An opening can be watched again from the shop.
- The hand holds up to seven cards; every other finish you own waits in the **deck**, a small stack of card backs at the end of the hand with its count. Press it to edit your hand like a card game's deck screen: one tap moves a finish between the deck and the hand (or drag it onto a slot), with undo and a reset to the starting seven; Base always stays.
- Opening one of the support links in the header (GitHub Sponsors or Buy Me a Coffee) once adds the **Supporter pack** (Opal, Raden, Confetti, Fireworks, Kintsugi) to the shop in this browser and its other open tabs; until then it leaves no trace. It opens like the others, with a richer wrapper and opening. It is an honor system with no payment check.
- Packs, their shaders and the shop itself only load when the shop is opened (an opened pack's finishes load with the hand). Opened packs are kept in this browser; a saved card on a finish whose pack is sealed again (site data cleared) goes back to Holographic. Finishes unlocked under the earlier support-link secrets (v0.9) carry over: their packs count as opened. The design is in [`packs.md`](packs.md).

## Finishes

34 finishes in all: seven in the starting hand and 27 in five packs.

| Finish | Where | Look |
| --- | --- | --- |
| Base | Starter | As it is. No finish |
| Foil | Starter | Brushed metal that slides as you tilt |
| Holographic | Starter | A rainbow bleeding through a fine lattice |
| Polychrome | Starter | Every color rewritten as rainbow |
| Negative | Starter | Lights and darks swapped, a night print |
| Prism | Starter | Rainbow shards like cracked ice |
| Glitch | Starter | Scanlines and slipping color |
| Relief | Metal | Struck like a medal; light runs across as you tilt |
| Gold | Metal | Gold leaf with a scatter of sparks |
| Platinum | Metal | Hairline-brushed platinum; a streak of light runs as you tilt |
| Cosmo Holo | Metal | Rows of foil circles and stars that flash rainbow as it tilts |
| Crystal | Metal | Light bent through cut facets |
| Galaxy | Light | Nebulae rising out of the shadows |
| Aurora | Light | Curtains of light that sway |
| Glow | Light | Shine a light on it and it glows on in the dark |
| Blacklight | Light | A UV lamp reveals hidden ink and a seal |
| Neon | Light | The outlines bent into glowing neon tubes that flicker now and then |
| Shallows | Light | Sunlight netting a pool floor, fraying into spectrum |
| Sakura | Nature | Petals drifting down |
| Frost | Nature | Frost blooming in from the edges |
| Stardust | Nature | Rainbow star dust that twinkles, with a big starburst now and then |
| Snow Globe | Nature | Shake it and gold glitter swirls up |
| Magma | Nature | Lava pulsing through the cracks |
| Halftone | Studio | Printed in dots, like a comic panel |
| Warmth | Studio | Stroke it and your warmth brings the color back |
| Stained Glass | Studio | The picture set in leaded glass, lit from behind |
| Flip Lenticular | Studio | Tilt it left and the picture swaps, stripe by stripe, under fine lenses |
| 3D Lenticular | Studio | The picture floats in 3D behind fine ridged lenses |
| Shadowbox | Studio | The picture as paper-cut layers, set deep in a box |
| Opal | Supporter | Patches of color welling up in the stone, flashing as you tilt |
| Raden | Supporter | Shell mosaic on black lacquer, turning blue, green, pink and gold |
| Confetti | Supporter | Gold, silver and rainbow foil confetti that glints piece by piece |
| Fireworks | Supporter | Willows, chrysanthemums, hearts and stars burst in gold, silver, crimson and jade |
| Kintsugi | Supporter | Cracks mended in gold, one of a kind |

- **Relief** strikes the picture in metal like a proof coin: the subject stands up as a matte relief in a few flat levels with crisp steps, the background becomes a flat mirror field that flashes as the card tilts, and line work sinks into grooves. Dark pictures are lifted rather than crushed. The frame gets a stamped dot texture and the name a mirror foil on a matte plate. Gold by default; silver is a choice under Shine.
- **Platinum** prints the art on cold white metal brushed with fine hairlines: the light is a hard streak across the lines, and tilting slides it along them, glinting on single lines as it passes. It moves only with the tilt and the light, so it holds still when motion is reduced.
- **Cosmo Holo** is the cosmos foil of trading cards laid over the art: a regular print of circles, stars and fine dots, each one a tiny diffraction grating. Rainbow bands run across the rows of motifs and slide over the card as it tilts, the star facets flash one after another and the dots twinkle; off the bands the foil all but disappears and the art shows through. It moves only with the tilt, so it loops in exports and holds still under reduced motion.
- **Glow** turns the card into glow-in-the-dark ink in a dim room: the picture sits darker and cooler, and the pointer (or a finger) is a small violet lamp. Wherever it shines, the ink stores the light and, once the lamp moves on, glows pale yellow-green, brightest where the picture is light. It fades the way real glow-in-the-dark ink does: quickly at first, then a faint glow that lingers for twenty seconds or so, drawing back into its crystals so an old afterglow glimmers grain by grain. Holding still charges a spot brighter. Like Warmth it arrives with one sweep of light as a hint, and a drag strokes the card instead of tossing it. Exports sweep the light through the busiest part of the picture; a PNG catches the trail still glowing, and a GIF or APNG loop shows the light pass and the afterglow it leaves.
- **Blacklight** hides fluorescent ink in the print. The card looks ordinary until the pointer (a finger on a phone) shines an ultraviolet lamp on it: inside the lamp's circle the print is washed in violet, white paper glows blue, and the hidden ink lights up neon pink, yellow and cyan — the outlines of the picture over a fine engraving of it, fibres in the paper, FOIL microtext round the frame and, somewhere on the art, a seal to find. Left alone, the lamp drifts slowly over the card by itself, glowing dimmer, and turns up to full when you point at the card (it holds still with reduced motion). On this finish a drag moves the lamp instead of tossing the card. Exports show it as the stage does left alone: drifting round the art, dimmer, once per loop (6 seconds at speed 1).
- **Neon** bends the picture's outlines into neon tubes in a dark room. Each big outline (small marks and texture are left out) becomes a glass tube of even thickness: a column of gas with a white-hot core inside a faint glass wall, glowing in the neon color nearest to the shape it outlines (red, amber, yellow, lime, cyan, blue, violet or pink; grey shapes and the paper frame take the color of the whole picture, pink when that is grey too). Its light bleeds round it onto the picture, which sits dimmed behind like the wall the sign hangs on. The frame stays dark: one tube runs round the art window and the name and pips are lit as thin neon lettering. The tubes stand a little off the wall, so tilting slides them against their glow, and a streak of reflected light slides across each tube and along its glass on the side facing the light. Now and then the tubes of one color round one spot stutter off and on for a moment (most loops have one or two); the flicker closes on every exported loop and holds still (lit) under reduced motion.
- **Shallows** sinks the art like a pool floor under a net of sunlight; tilting refocuses it and splits its brightest knots into spectrum, and its ripples loop seamlessly in exports.
- **Stardust** scatters rainbow star dust over the art, which sits a little deeper so the grains of light lead: each fine grain is a tiny facet that catches the light at its own angle, square chips of confetti foil flash a color as they face you, and a few big starbursts blaze when the angle is right and pop on a steady beat (so its GIF and APNG loops close without a seam). A wide band of light rolls across as the card tilts, and every grain inside it fires harder.
- **Snow Globe** sets the art behind a curved pane of clear liquid full of gold glitter; shake or toss the card and the glitter swirls up, then settles.
- **Warmth** reacts to touch: untouched, the art is printed as a blue cyanotype in thermochromic ink. Hover with a mouse or drag a finger across it and the ink flushes rose, coral and peach, then turns clear to show the picture in its own colors, and slowly cools back. Press and hold to leave a fingerprint. The card arrives with an unseen finger swiping it once, as a hint. On this finish a drag strokes the card instead of tossing it (and on a phone it does not switch finishes). Exports play the whole story (cold, a swipe, a press, cooling) and aim the swipe at the busiest part of the picture.
- **Stained Glass** sets the picture in leaded glass lit from behind: black lead came cuts it into panes and runs along the picture's big outlines, each pane takes its color from the picture under it, and small details stay on the glass like painted line. The frame becomes a border of pale glass strips mitred at the corners, with the name painted on. Tilting moves the light behind the window across the panes and shifts the uneven thickness of the glass, so each pane glows and mottles in its own way. It has no clock of its own, so it holds still under reduced motion and loops cleanly in every export.
- **3D Lenticular** puts the picture under a sheet of fine vertical lenses, like a 3D lenticular print: it reads the picture's depth with the same on-device model as Shadowbox (and guesses it from color until then), so the subject floats in front of the card and the background sinks behind it. Tilting sideways steps through the views, so near and far slide against each other; tilted too far, the views flip back with a faint double image, as on a real print. The ridges show as fine lines that catch the light, and bands of light and shade sweep across them with the angle. It moves only with the tilt, so it loops in exports and holds still under reduced motion.
- **Flip Lenticular** is a two-picture flip card under a sheet of fine vertical lenses. Seen from the front (or tilted right) it shows your picture; tilt it left and the other picture takes over, as on a real two-picture flip card, the two mixing in thin stripes on the way that sweep across the card. Tilting up or down never flips it, and the ridges catch the light as a band of fine glints. The other picture is picked in the panel while Flip Lenticular is on the card (Choose / Remove, kept for next time); without one, it flips to a pencil drawing of the same picture. It moves only with the tilt, so it loops in exports and holds still under reduced motion; a PNG shows the front picture.
- **Shadowbox** cuts the picture into paper layers along its depth and stands them up inside a lit box, so the layers slide apart and cast shadows as the card tilts. It reads the picture's depth with a small depth model that runs on your device (WebGPU when available, otherwise WebAssembly). The first time it (or 3D Lenticular) is chosen it downloads the model once (about 19–27 MB, then cached by the browser); a chip on the card shows the progress. Until then, or if the model can't run, the layers are guessed from color. With the browser's data saver on, it waits until you ask. A cached model is checked again before use, and the model is let go about half a minute after you leave Shadowbox (or 3D Lenticular). With an animated picture the layers are cut from one frame, so the back of the box keeps showing the moving picture instead of a painted-out background.
- **Raden** inlays the picture in mother-of-pearl on black lacquer: its bright parts become a mosaic of cracked shell with fine growth lines, tinted from beneath by the picture's own colors, its shadows sink into the lacquer, and as the card tilts each piece turns through blue, green, pink and gold at its own moment.
- **Opal** sets the picture in precious opal, dark under its shadows and milky under its lights: soft patches of color well up around the subject from two depths that slide apart as the card tilts, and each one flashes on, changes hue and goes out at its own angle.
- **Confetti** and **Fireworks** are made for birthday and celebration cards; the picture, any message in it and the name stay readable. Confetti scatters gold, silver and rainbow foil confetti (squares, dots and thin curled ribbons) over the art: some pieces are stuck to the card and each catches the light at its own angle as the card tilts, some drift slowly down, and now and then a popper bursts from a corner. Fireworks leaves the art as it is and sets off fireworks over it that carry their own light (a thin tinted rim keeps them visible over bright pictures, and they pass faintly behind lettering and outlines in the picture so a message stays clear): rockets climb on a glowing trail and open with a flash into a willow, chrysanthemum, peony, heart, star or a string of small pops, in gold, silver, crimson or jade, never the same twice in a row; tilting makes the foil sparks (and a few stars printed on dark parts of the picture) glint, and a sparkler with a long glowing fuse runs around the frame. Held still (reduced motion, speed zero or a PNG) both stop at a festive moment: confetti in the air, fireworks in full bloom. Their GIF and APNG loops close on themselves.

## Card

### Shapes

- The card is a trading card (63 × 88, 5 : 7) unless you choose another **shape** under Fine-tune → Card: **Wide** (7 : 5, a greeting card on its side), **Square**, **Postcard** upright or on its side (100 × 148) and **Business** card (91 × 55, on its side); each choice shows its outline, and its size on hover.
- Every shape is still a card: the short side, the frame's line and margins, the corner and the nameplate keep their size and only the art window stretches, so a frame never squeezes or bends. The crop, every finish, the layers, the lettering, the hand, the deck builder, the pack opening, the card back and every export follow the shape.

### Frames

- Frames: Paper, Ink, Brass, By rarity, and two for celebration cards: **Gold rim** (ivory with a thin gold rule round the edge and the art) and **Ribbon** (a satin ribbon tied across the top-left corner). With a finish like Confetti or Fireworks and a Wide or Square shape they make a birthday card without any special mode. The gold rule and the ribbon belong to the classic card; on a trading card these two frames give their colors only.
- Add your own frame colors with the color picker; they stay as swatches for next time (hover or press Delete to remove).

### Layout

- Pick the card's **layout** in the Card tab: the classic FOIL card (the default) or a **trading card**, built the way real trading cards are (see [`tcg.md`](tcg.md)) in FOIL's pixel style: the frame is the card's own color as dithered printed stock, and the name (with the rarity diamonds), the type line (any short words, such as "Rare Card — Foil", ending in FOIL's set emblem, a pixel star in the rarity's color) and the card text sit on parchment plates set into it with stepped pixel corners and hard bevels; the picture sits a step below the frame, and the fine print at the foot reads FOIL, the year and "No. 1/1" (every FOIL card is a one-off).
- On a trading card the message is the card text: centred, wrapped evenly and as large as its box allows. The card holds only the parts it has: the box is as tall as the message's lines, and without a type line or a message their plate goes and the picture grows into its room (with neither, it is a full-art card). Every finish follows the picture to its window, and exports and mini cards show the same card.

### Name, message and rarity

- Edit the name, the message and the rarity right in the tag beside the card (on a trading-card layout, the type line too).
- Put a **message** on the card: up to four short lines, none by default. Type it in the tag beside the card or in the Lettering tab, where a tap puts in a ready phrase in the panel's language (Happy Birthday, Thank you, おめでとう, ありがとう…). It sits at the top, the middle or the bottom of the picture, in one of four typefaces (pixel by default, a handwritten marker, Mincho serif or a round pop face), and is sized to fit the picture's width; a dark outline and a hard drop keep it readable on any picture.
- The message is printed with the card's lettering, so a hot-foil gold or rainbow message glints with the same light and tilt as the name. The nameplate (name and rarity) can be turned off for a card that carries only the message. The message is part of the card face, so exports, the hand and the deck's mini cards all show it. Its typefaces load only once a message is used.

### Lettering

- Print the card's text (the name, the type line and the message) in ink, deboss, emboss, hot-foil (gold, silver, rose gold, copper, rainbow or any color) or spot UV. The name tag beside the card shows the current lettering and opens the Lettering tab. The relief and shine follow the card's tilt and light, in exports too.
- Every piece of text is printed in the card's lettering unless you give it its own: tap the words on the card, or the chip beside their field in the Lettering tab (which lists the card's words: name, type line and message), and pick a print (and a foil color) for that piece alone. Depth and gloss stay shared; a piece with its own print carries a green gem on its chip, and "Follow card", the first choice, returns it to the card's lettering. Saved cards keep only these own prints.

### Placement

- **Placement: Auto / Free** in the Lettering tab. Auto (the default) keeps the preset places. Free lets you drag the message (and, on the classic card, the name) anywhere on the card, size it with the corner handle and turn it (±15°) with the handle above it, or both with two fingers, with guides that snap to the centre, the picture's edges and the frame, and a bar under the card (Print · Straighten · Back to Auto · Done).
- A short tap still opens the print menu, and while words are selected the card holds still and a flick does not switch finishes. A trading card's plates stay put: there only the message is free, and it leaves its box. Places are saved as shares of the card, so exports, mini cards and other card shapes match. See [`arrange.md`](arrange.md).

### Card back

- Every card wears one back, drawn in big pixels like the packs: FOIL's four letter tiles on a dark plate in a gold cartouche, over a red engraved lattice inside the same paper border as the face. It takes the card's shape. Its gold catches a stepped glint as the card tilts or turns. The pack's face-down showpiece, the deck's pile and a card still being dealt in the deck screen wear the same back.

## Layers

- Layer two finishes, like layers in a photo app (Fine-tune → **Layers**): each layer has its own finish and its own place on the card, and a little pixel card in the list lights up exactly where each one lands. Sakura on the art and Kintsugi on the frame, or Holographic on the whole card with Gold's shine over the highlights.
- Where the two overlap, layer 2 either adds only its light (the default, so both stay visible) or is laid over layer 1, with a strength slider.
- Layer 2 can be any finish you own except Base and the ones that need the card to themselves (Warmth, Glow, Blacklight, Shadowbox, the two lenticulars, Snow Globe). Off by default; the card, the live previews and every export show both. How it is drawn, and the options weighed, are in [`layering.md`](layering.md).

## Finish area

- In the Layers tab, the chosen layer's place is set by the area controls: the whole card, the art, the frame, the name or nowhere, a band of brightness (highlights only, shadows only…), inverted, and painted in or out with a soft brush while the card holds still. An overlay shows what is left out, and exports follow it.

## Light and motion

- The card tilts with your pointer, can be tossed around, and bounces when clicked.
- **Shine** fine-tunes every finish: pattern size and angle, hue, saturation, glare and its focus, light color, glitter, a light that follows the pointer (or the phone's tilt) / orbits / stays fixed, speed, max tilt, the motion and its size, and the metal of Relief (gold or silver; shown while Relief is on the card). Defaults keep the original look; exports follow the same settings.
- Twenty motions in four groups, plus None: **Gentle** (Sway, Float, Pendulum, Breathe), **Tilt** (Gyre, Lean, Jelly, Figure 8, Jiggle, Spin), **Light** (Sweep, Light bar, Spotlight, Flare) and **Showpiece** (Reveal, Push in, Heartbeat, Glint, Turn once, Bounce). Each has its own loop (2, 3 or 6 seconds at speed 1); the list, the lengths and what was merged are in [`motion.md`](motion.md). Speed and size work on every motion, and reduced motion stops it.
- The stage is the preview: the card left alone moves exactly as its GIF or APNG will. Only your hand changes it, while it touches the card (pointer, finger, drag, device tilt); let go and it goes back to the preview.
- The motion button above the deck (on a phone held upright, at the left end of the hand) names the motion and changes it in one tap: it opens a tray of the motions in their four groups (each tile acts out its motion when pointed at, and the line under them says what it does and how long its loop is), with two sliders for the speed and the size of the motion and a reset. A pick applies at once and the tray stays open while you tune; the close button, a press elsewhere or Escape closes it, and arrow keys work. These are the Shine tab's own settings, where the same groups show. On phones the tray opens as a sheet along the bottom, so the card stays in view.

## Export

### PNG, GIF and APNG

- Save a transparent PNG, a looping GIF or a full-color transparent APNG loop. The PNG is the card's own pixels (900×1260 for the trading card, the short side always 900) with a small clear margin. The GIF (480×600 for the trading card) and the APNG are upright for upright shapes, on their side for wide ones and square for the square card.
- A loop is the card exactly as it moves on the stage when nobody touches it — the motion, the speed and size, the light and its sheen as set — one loop of the motion long (see [`motion.md`](motion.md); 6 seconds while the light orbits or Blacklight's lamp drifts), so it closes without a seam. With an animated picture, its own loop plays a whole number of times inside (slightly retimed to fit); at speed zero the card holds still and the loop follows the picture's timing.
- The loop options say so in one line, and how touch finishes are exported: a file has no hand in it, so an unseen finger strokes the busiest part of the picture once per loop.
- Relief, Platinum, Glow, Blacklight and Neon GIFs are dithered so their smooth gradients don't band in 256 colors (with layers, the GIF is dithered if either finish asks for it).

### GIF options

- The GIF can also drop the backdrop (GIF and APNG options under the formats, closed by default). GIF transparency is one bit, so a clear GIF has no shadow and a hard edge; the edge pixels keep the card's border color (Auto) or blend into a matte you pick (white, black or any color) to suit where it will sit. For a soft shadow and edges, save an APNG.

## Binder and Share

- **Binder**: **Keep** (in the Save box) puts the card in this browser's binder, and the binder chip in the header opens it. It is kept in IndexedDB on this device only: the picture (shrunk to 1280 px on its long side; an animated picture keeps its own file up to 8 MB, a bigger one its first frame; a sample is kept as its number) and the card's settings, with a small still thumbnail drawn once when the card is kept (in the card's own shape: a card that isn't trading-card shaped sits in the middle of its pocket, keeping its shape).
- The binder works like a real one: six pages of nine pockets, two lying open side by side on wide screens (one on phones), pages that turn over at the rings, and each card in the pocket you put it in. Drag a card onto any pocket (on a touch screen, hold it a moment first): an empty one takes it, a full one swaps. Hold it at the edge of the pages to turn to another page. Empty pockets stay where they are, the arrangement is kept, and Undo takes a move back. Each pocket is a plain image, so nothing in it is drawn with WebGL, and only the thumbnails of the open pages are read.
- Tap cards to pick them (they lift like cards in a hand, and the line under the head names the picked card and when it was kept): **To stage** puts the picked card back on the stage, the one card drawn live, ready to tilt, tune, save or share (its picture and settings are read only now), and **Discard** throws the picked cards away. A single card goes from the red × on its corner (shown under the pointer, always there on touch screens). Either way it goes at once, and a bar with **Undo** brings it back for a few seconds.
- It holds up to 54 cards and 60 MB; its head shows the cards (11 / 54) and the space used (a bar, 203 KB / 60 MB), and a full binder says which ran out and asks for a discard before it takes another card. A thumbnail that can't be read shows as a card back with the card's name and finish, saying it can still go on the stage. Its code loads the first time it is used. The design is in [`binder.md`](binder.md).
- **Share**: on browsers whose share sheet takes files (most phones; most desktop browsers don't, and there the button isn't shown), **Share** (in the Save box) makes the card into a moving GIF on the spot, counting up on Share and on the Save button, and opens the share sheet with it, to send it to X (where it plays), LINE and the like. The GIF for sharing is smaller than a saved one (360×450 for the trading card, at most 50 frames) so it stays well under X's 15 MB; it follows the shape and the motion.
- A short line and the site's address go with it; a share sheet that can't take text along with a file gets the GIF alone, and so does a Mac, whose share sheet's Copy would otherwise paste the GIF twice. Nothing is uploaded anywhere and the card is never put in a link: the file goes from the page straight to the share sheet. If making the GIF took so long that the browser no longer counts the tap, the button turns into **Send** and opens the sheet on the next tap.

## Phones

- On a phone held upright the card is the screen: it runs nearly edge to edge (about 62% of the screen's height) under a thin header of icons. Under it sit the finish's name with ‹ › to either side, then the hand with the motion button at its left end and the deck and the pack button at its right end; Save folds into one slim bar along the bottom (choose image, the format, Save), and everything else is a scroll away in the panel. Only a short screen shrinks the card a little, so the hand and the deck stay whole above the bar.
- Flicking the card left or right with a finger, or tapping ‹ ›, steps to the next or previous card in the hand, whichever cards the hand holds at the moment, wrapping around at the ends (on Warmth a finger strokes the card instead of flicking it); until the first flick, a note over the foot of the card says so. Phones on their side and tablets keep the hand right under the card and the full Save box, with the card shrinking on short screens.
- On phones and tablets the card also tilts as you tilt the device, and its shine moves with it; the rest pose slowly follows how you hold it, so any grip feels level. Android starts right away. iOS asks for motion access, and only when you tap the card or the hand (once per visit); if it is refused, the card simply keeps to touch. Browsers only give the sensor to secure (https) pages. Reduced motion turns this off.

## Performance

- Slow devices keep moving smoothly: the stage measures how long its frames take, and when it keeps missing frames it lowers the drawing resolution step by step, then the backdrop's resolution and the number of sparks. A step that doesn't help (the device is capped, say by a battery saver, rather than busy drawing) is undone and not tried again. Fast devices never leave full quality, and exports are always made at full quality. Add `?quality=0`…`3` to the address to pin a level (0 is full).

## Language and accessibility

- English / 日本語, sound effects and a CRT filter can be toggled in the header.
- FOIL respects `prefers-reduced-motion`: the card's motion, the device tilt and moving finishes hold still on screen (exports still move).
