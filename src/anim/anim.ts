// A moving picture as the card plays it: every frame decoded, with its timing. The decoders
// (gifDecode.ts, apngDecode.ts) load when such a picture is opened; this is what the card needs meanwhile.

export interface Anim {
  frames: HTMLCanvasElement[];
  /** Start time of each frame in ms, plus the total loop length. */
  starts: number[];
  duration: number;
}

export type AnimKind = 'GIF' | 'APNG' | 'WebP';

/** An animation that remembers which format it came from, for the thumbnail badge. */
export type KindedAnim = Anim & { kind: AnimKind };

export const animKind = (anim: Anim): AnimKind => (anim as Partial<KindedAnim>).kind ?? 'GIF';

/** Index of the frame showing at time `ms` in a looping animation. */
export function frameAt(anim: Anim, ms: number): number {
  const t = ((ms % anim.duration) + anim.duration) % anim.duration;
  let lo = 0;
  let hi = anim.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (anim.starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
