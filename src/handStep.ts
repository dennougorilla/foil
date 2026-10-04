// Stepping through the hand: by arrow keys, and on phones by flicking the card sideways.

/**
 * The card `dir` steps away from `current` among the cards the hand holds right now, wrapping
 * at the ends. A finish the hand doesn't hold steps in from the matching end.
 */
export function stepIn<T>(hand: readonly T[], current: T, dir: 1 | -1): T | null {
  if (!hand.length) return null;
  const i = hand.indexOf(current);
  if (i < 0) return dir > 0 ? hand[0] : hand[hand.length - 1];
  return hand[(i + dir + hand.length) % hand.length];
}

/**
 * Whether a finger's drag on the card (css px, release velocity in px/s) is a sideways flick:
 * 1 to the next card (flicked left), -1 to the previous one (flicked right), 0 for anything else.
 */
export function flickDir(dx: number, dy: number, vx: number): 1 | -1 | 0 {
  if (Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  const far = Math.abs(dx) > 70;
  const quick = Math.abs(dx) > 30 && Math.abs(vx) > 600 && Math.sign(vx) === Math.sign(dx);
  if (!far && !quick) return 0;
  return dx < 0 ? 1 : -1;
}
