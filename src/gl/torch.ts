// The lamps of Blacklight and Plasma on the live stage and in exports. Kept apart from their shaders
// (src/gl/blacklight.ts and src/gl/plasma.ts, in the Light pack) so the page loads none of that
// before the pack, and free of imports so the lamp's path can be tested in Node.

/** What a finish's lamp is: Blacklight's ultraviolet lamp, or the spot Plasma's lightning reaches for. */
export type TorchKind = 'uv' | 'plasma';

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

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Plasma's unseen finger in a file, `p` loops in (1 = once round): where it is (card uv) and how
 * firmly it is down (0 lifted, 1 down), as x, y, touch. It lands on the upper right of the art and
 * slides over the top to the upper left, round the middle where the lightning starts, so the bolt
 * stays long; then it lifts, and lifted it slides back unseen, so the loop closes.
 */
export function plasmaFinger(p: number): [number, number, number] {
  const f = p - Math.floor(p);
  const touch = ease((f - 0.28) / 0.06) * (1 - ease((f - 0.74) / 0.08));
  // Along the stroke: forward while down, back while lifted.
  const s = f >= 0.3 && f < 0.8 ? ease((f - 0.3) / 0.5) : 1 - ease((f - 0.8 + (f < 0.3 ? 1 : 0)) / 0.5);
  const a = -Math.PI * (0.3 + 0.5 * s);
  return [0.5 + Math.cos(a) * 0.27, 0.47 + Math.sin(a) * 0.19, touch];
}

/** Plasma in a still picture: the finger down on the art (x, y, how firmly: down). */
export const PLASMA_STILL: [number, number, number] = [plasmaFinger(0.5)[0], plasmaFinger(0.5)[1], 1];
