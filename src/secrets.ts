// Which finishes are out in the open and how a secret one is drawn. Kept free of the DOM so it can be tested.

import type { EditionId } from './editions';

/** The finishes in the hand from the start: the editions of the game FOIL is modelled on. Every other one is a secret. */
export const OPEN_EDITIONS: readonly EditionId[] = ['base', 'foil', 'holo', 'poly', 'negative'];

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
