// Hidden finishes for supporters.
//
// Until unlocked they leave no trace in the UI. Opening either of the app's existing
// support links (GitHub Sponsors or Buy Me a Coffee, in the header's Support menu)
// unlocks them quietly in this browser; from then on they sit in the hand like any
// other finish. This is an honour system with no server: nothing checks that a payment
// happened, and the flag lives in localStorage, so clearing site data locks them again.
//
// The flag is kept under its own key rather than in the State store so that undo,
// resets or a store schema change can never take an unlock back.

import type { EditionId } from './editions';
import type { Stage } from './stage';
import type { Store } from './state';

export const SPONSOR_EDITIONS: EditionId[] = ['kintsugi', 'opal', 'eclipse', 'raden'];

const KEY = 'foil:sponsor';
/** Where a card restored from storage lands if its hidden finish is locked (the store's default). */
const FALLBACK: EditionId = 'holo';

const readUnlocked = () => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
};

let unlocked = readUnlocked();

export const isLocked = (id: EditionId) => !unlocked && SPONSOR_EDITIONS.includes(id);

/** Run before anything reads the edition: a locked finish restored from a past visit falls back quietly. */
export function releaseLockedEdition(store: Store) {
  if (isLocked(store.get().edition)) store.set({ edition: FALLBACK });
}

/** Opening either support link unlocks the hidden finishes, without a word. */
export function initSponsor(stage: Stage) {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* storage unavailable: unlocked for this visit only */
    }
    stage.syncHandHidden();
  };
  document.querySelectorAll<HTMLAnchorElement>('#supportMenu .support-link').forEach((a) => {
    a.addEventListener('click', unlock);
    // A middle click opens the link too; it counts the same (navigation is left alone).
    a.addEventListener('auxclick', (e) => e.button === 1 && unlock());
  });
}
