// Which finishes are out in the open and how a secret one is drawn. Kept free of the DOM so it can be tested.

import type { EditionId } from './editions';

/**
 * The finishes in the hand from the start: the editions of the game FOIL is modelled on, plus
 * Prism and Glitch. Every other one is a secret or beta. Kept in hand order (see EDITIONS).
 */
export const OPEN_EDITIONS: readonly EditionId[] = ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch'];

/** Beta finishes, still being tried: never in the hand nor in the secret draw until promoted to a secret. */
export const BETA_EDITIONS: readonly EditionId[] = ['cosmoholo'];

/** Every other finish of `all` (the hand order), the ones a support link can unlock. */
export const secretEditions = (all: readonly EditionId[]): EditionId[] =>
  all.filter((id) => !OPEN_EDITIONS.includes(id) && !BETA_EDITIONS.includes(id));

/** The unlocked secrets saved as a JSON list; anything else (or a past format) counts as none. */
export function parseUnlocked(raw: string | null, secrets: readonly EditionId[]): EditionId[] {
  let list: unknown;
  try {
    list = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return secrets.filter((id) => list.includes(id));
}

/** One secret that is still locked, picked at random, or null once all are out. */
export function pickSecret(secrets: readonly EditionId[], unlocked: readonly EditionId[], random: () => number): EditionId | null {
  const locked = secrets.filter((id) => !unlocked.includes(id));
  return locked.length ? locked[Math.floor(random() * locked.length)] : null;
}

/** Both lists' unlocks, in hand order: two tabs that unlocked at the same moment each keep theirs. */
export function mergeUnlocked(secrets: readonly EditionId[], saved: readonly EditionId[], mine: readonly EditionId[]): EditionId[] {
  return secrets.filter((id) => saved.includes(id) || mine.includes(id));
}
