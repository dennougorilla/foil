// What sits behind the card, on the stage and in every moving file (docs/backdrops.md): the list,
// the saved choice's checks and where a backdrop is in the card's loop. The swirl's shader is in
// gl/shaders.ts; the others arrive with gl/backdrops.ts when one is picked.
import { frac, loopCycle, type Tune } from './tune/model.ts';

export const BACKDROPS = ['swirl', 'felt', 'studio', 'velvet', 'bokeh', 'stars', 'confetti', 'plain', 'clear'] as const;
export type BackdropId = (typeof BACKDROPS)[number];
export const DEFAULT_BACKDROP: BackdropId = 'swirl';
/** Plain's color until one is picked. */
export const PLAIN_DEFAULT = '#182127';

export const sanitizeBackdrop = (v: unknown): BackdropId => ((BACKDROPS as readonly unknown[]).includes(v) ? (v as BackdropId) : DEFAULT_BACKDROP);
export const sanitizeBackdropColor = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : PLAIN_DEFAULT);

/**
 * Where the backdrop is in its loop, 0..1, `s` idle seconds into the motion: the loop's own place, so
 * the stage left alone and a file at loop position p agree (`torch`: Blacklight's lamp, see loopCycle).
 * At speed zero nothing moves on its own.
 */
export const backdropPhase = (t: Tune, s: number, torch: boolean): number => (t.speed > 0 ? frac(s / loopCycle(t, torch)) : 0);

/** How far the swirl breathes out and back in one loop, in its own clock's seconds. */
const SWIRL_BREATH = 1.2;
/** The swirl's clock at a place in the loop: out and back once, so a file closes without a seam. */
export const swirlTime = (phase: number): number => 40 + Math.sin(phase * Math.PI * 2) * SWIRL_BREATH;
