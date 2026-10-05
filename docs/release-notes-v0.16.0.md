# FOIL v0.16.0

## New

- **Pixel art (#46).** Fine-tune → Card → Pixel art redraws the card as pixel art: Off, **Chunky**, **Retro** or **Fine**, with Adjust for coarseness, colors, outline and dither. **Area**: the whole card, or the frame only (the picture stays as it is). The words stay readable: they are printed crisp in a pixel typeface (DotGothic16) on the same grid. The finish's light steps on the pixels only where pixel art is, and the hand, binder and every exported file show the same card. **Pixelate** stays beside it as its own slider for the picture alone.

## Changed

- **CRT filter (#52).** It now looks like a real CRT screen: rounded dark corners, bright scanlines, an RGB aperture grille, a soft glow, a faint color fringe toward the edges, and faint grain and flicker (none under reduced motion). It is **off by default**, and everyone starts with it off once (the setting is saved under a new name). Slower devices drop its glow, the slowest the whole filter. Exported files never have it.

**Full Changelog**: https://github.com/dennougorilla/foil/compare/v0.15.0...v0.16.0
