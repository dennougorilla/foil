# FOIL v0.13.0 — release notes (draft)

## Highlights

- **Card shapes.** Besides the trading card (still the default): wide, square, postcard (upright
  and on its side) and business card, under Fine-tune → Card. Exports take the card's shape.
  Two frames for celebration cards: **Gold rim** and **Ribbon**.
- **Messages and the trading-card layout.** Up to four lines on the picture (pixel face by
  default, or hand, serif and pop faces). A trading-card layout with a name bar, type line, effect
  box and footer. Every piece of text can have its own print (tap it on the card), and **Free
  placement** lets you drag, size and turn the words on the card.
- **Layers.** A second finish on top of the first, each with its own area, where they overlap
  adding light or laying over (Fine-tune → Layers).
- **Binder.** Keep cards in this browser: play them back onto the stage, discard with Undo, drag
  them between pockets, turn the pages.
- **Share.** Where the share sheet takes files (most phones), Share sends a small moving GIF of the
  card with a link to FOIL (the GIF alone on a Mac).
- **A new card back and motion.** A pixel card back with FOIL's letter tiles in gold foil, on every
  shape. Ten idle motions, switched in one tap from the motion button above the deck, with sliders
  for speed and size. GIF and APNG loops now move exactly as the card does on the stage.
- **Export motions.** Under the GIF/APNG options the loop can take a motion made to show the foil
  off: Gyre, Jelly, Lean, Showcase (v0.12's export motion), Sweep, Figure 8, Moment, Reveal,
  Push in, Heartbeat, Light bar, Spotlight and Flare. As on screen stays the default.
- **Phones held upright.** The card fills the screen, with a slim header and the Save bar below.
- README rewritten in English and Japanese, new OG image.

## Known issues

- First-load JavaScript grew from 84 kB to 118 kB (gzip) with the new panels (message, prints,
  free placement, layers, motion tray); the binder, packs and depth model still load on demand.
- The export motions made for exports have a fixed length (2–3 s) and do not follow an orbiting
  light; they are candidates for the owner to narrow down.
- On the trading-card layout the Gold rim's inner rule and the Ribbon are not drawn (their colors
  apply), and on the wide shapes its bars and effect box get cramped.
- Carried over: Snow Globe's export loop can show a seam; toasts can cover the hand's caption.
