// The GIF's frame: the Save button names it before the exporter (exporter.ts) has loaded.

/**
 * A GIF's frame for the trading card (other shapes turn it, see shape.ts exportFrame), its shortest
 * time between frames (ms, a multiple of 10), and at most how many frames it holds: a slow loop
 * plays at a lower frame rate rather than growing without end.
 */
export interface GifSize {
  w: number;
  h: number;
  delay: number;
  maxFrames: number;
}
/** Saved: up to 20 fps. */
export const GIF_SAVE: GifSize = { w: 480, h: 600, delay: 50, maxFrames: 90 };
/**
 * For the share sheet: smaller and at most 50 frames (a long loop gets longer frames instead), so
 * even a noisy picture stays well under the 15 MB X takes (50 × 360 × 450 is 8.1 MB before compression).
 */
export const GIF_SHARE: GifSize = { w: 360, h: 450, delay: 60, maxFrames: 50 };
