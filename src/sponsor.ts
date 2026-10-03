// Secret finishes for supporters.
//
// The hand opens with the original game's editions only (see src/secrets.ts); every other
// finish is a secret and leaves no trace in the UI until it is unlocked. Each time either of
// the app's support links (GitHub Sponsors or Buy Me a Coffee, in the header's Support menu)
// is opened, one secret still locked, picked at random, quietly joins the hand in this
// browser; once all are out, nothing more happens. This is an honour system with no server:
// nothing checks that a payment happened, and the list lives in localStorage, so clearing
// site data locks them again.
//
// The list is kept under its own key rather than in the State store so that undo, resets
// or a store schema change can never take an unlock back.

import { EDITIONS, type EditionId } from './editions';
import { OPEN_EDITIONS, parseUnlocked, pickSecret } from './secrets';
import type { Stage } from './stage';
import type { Store } from './state';

const SECRETS = EDITIONS.map((e) => e.id).filter((id) => !OPEN_EDITIONS.includes(id));

const KEY = 'foil:secrets';
/** Where a card restored from storage lands if its secret finish is locked (the store's default). */
const FALLBACK: EditionId = 'holo';

const readUnlocked = () => {
  try {
    return parseUnlocked(localStorage.getItem(KEY), SECRETS);
  } catch {
    return [];
  }
};

let unlocked = readUnlocked();

export const isLocked = (id: EditionId) => SECRETS.includes(id) && !unlocked.includes(id);

/** Run before anything reads the edition: a locked finish restored from a past visit falls back quietly. */
export function releaseLockedEdition(store: Store) {
  if (isLocked(store.get().edition)) store.set({ edition: FALLBACK });
}

/** Opening either support link unlocks one more secret, without a word. */
export function initSponsor(stage: Stage, store: Store) {
  const unlock = () => {
    // Another tab may have unlocked some since this one last looked.
    const saved = readUnlocked();
    const id = pickSecret(SECRETS, [...unlocked, ...saved], Math.random);
    if (!id) return;
    unlocked = SECRETS.filter((s) => s === id || unlocked.includes(s) || saved.includes(s));
    try {
      localStorage.setItem(KEY, JSON.stringify(unlocked));
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
  // Other tabs: an unlock there shows up here, and clearing site data there locks again here.
  addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    const now = readUnlocked();
    if (now.join() === unlocked.join()) return;
    unlocked = now;
    stage.syncHandHidden();
    releaseLockedEdition(store);
  });
}
