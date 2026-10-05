// Blacklight's lamp on the live stage and in exports. Kept apart from its shader (src/gl/blacklight.ts,
// in the Light pack) so the page loads none of that before the pack, and free of imports so the
// lamp's path can be tested in Node.

/** Where the drifting lamp is `turn` turns into its sweep (1 = once round), in card uv: a slow ellipse over the art. */
export function torchAt(turn: number): [number, number] {
  const a = turn * Math.PI * 2;
  return [0.5 + Math.cos(a) * 0.13, 0.44 + Math.sin(a) * 0.085];
}

/**
 * Seconds (at speed 1) the lamp takes to drift once round when nobody points at the card: one idle
 * cycle (IDLE_CYCLE in src/tune/model.ts), so an exported loop holds exactly one sweep.
 */
export const TORCH_DRIFT = 6;

/** The drifting lamp glows at this power; pointing at the card turns it up to full. */
export const TORCH_IDLE = 0.5;

/** The lamp in a still PNG: over the middle of the art, with the hidden seal in its circle. */
export const TORCH_STILL: [number, number] = [0.55, 0.47];
