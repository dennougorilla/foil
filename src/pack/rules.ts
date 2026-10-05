// The rules used once the deck builder or the shop is open: moving cards between the hand and the
// deck, and how big an entrance each card of a pack gets. Pure functions (tested under Node), kept
// out of src/packs.ts so the page's first load does not carry them. See docs/packs.md.

import type { EditionId } from '../editions';
import { addToHand, type Pack } from '../packs.ts';

/**
 * Puts a card exactly in slot `at`, swapping out what is there (never Base); past the end it is
 * added. A card already in the hand trades places with the one in that slot.
 */
export function placeAt(hand: readonly EditionId[], id: EditionId, at: number): EditionId[] {
  if (hand[at] === 'base') return [...hand];
  const from = hand.indexOf(id);
  if (from >= 0 && at < hand.length) return hand.map((x, i) => (i === at ? id : i === from ? hand[at] : x));
  const rest = hand.filter((x) => x !== id);
  if (at >= rest.length) return addToHand(rest, id);
  return rest.map((x, i) => (i === at ? id : x));
}

/** Sends a card back to the deck; Base stays. */
export const removeFromHand = (hand: readonly EditionId[], id: EditionId): EditionId[] => (id === 'base' ? [...hand] : hand.filter((x) => x !== id));

/** How big an entrance the card at `i` gets: 3 for the showpiece, 2 for the one before it, else 1. */
export function tierOf(pack: Pack, i: number): 1 | 2 | 3 {
  const n = pack.finishes.length;
  return i === n - 1 ? 3 : i === n - 2 ? 2 : 1;
}
