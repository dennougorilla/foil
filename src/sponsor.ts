// Secret finishes for supporters.
//
// The hand opens with the seven open finishes (the original game's editions plus Prism and
// Glitch, see src/secrets.ts); every other finish is a secret and leaves no trace in the UI
// until it is unlocked (beta finishes, still being tried, stay out altogether). Each time
// either of the app's support links (GitHub Sponsors or Buy Me a Coffee, in the header's
// Support menu) is opened, one secret still locked, picked at random, quietly joins the hand
// in this browser; once all are out, nothing more happens.
// This is an honour system with no server: nothing checks that a payment happened, and the
// list lives in localStorage, so clearing site data locks them again.
//
// The list is kept under its own key rather than in the State store so that undo, resets
// or a store schema change can never take an unlock back.

import { EDITIONS, type EditionId } from './editions';
import { BETA_EDITIONS, mergeUnlocked, parseUnlocked, pickSecret, secretEditions } from './secrets';
import type { Stage } from './stage';
import type { Store } from './state';

const SECRETS = secretEditions(EDITIONS.map((e) => e.id));

const KEY = 'foil:secrets';
/** Where a card restored from storage lands if its finish is locked or beta (the store's default). */
const FALLBACK: EditionId = 'holo';

const readUnlocked = () => {
  try {
    return parseUnlocked(localStorage.getItem(KEY), SECRETS);
  } catch {
    return [];
  }
};

let unlocked = readUnlocked();

const save = (list: EditionId[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: unlocked for this visit only */
  }
};

/** Left out of the hand: a secret still locked, or a beta finish. */
export const isLocked = (id: EditionId) => BETA_EDITIONS.includes(id) || (SECRETS.includes(id) && !unlocked.includes(id));

/** Run before anything reads the edition: a locked finish restored from a past visit falls back quietly. */
export function releaseLockedEdition(store: Store) {
  if (isLocked(store.get().edition)) store.set({ edition: FALLBACK });
}

/** Opening either support link unlocks one more secret, without a word. */
export function initSponsor(stage: Stage, store: Store) {
  const unlock = () => {
    // Another tab may have unlocked some since this one last looked.
    const known = mergeUnlocked(SECRETS, readUnlocked(), unlocked);
    const id = pickSecret(SECRETS, known, Math.random);
    if (!id) return;
    unlocked = mergeUnlocked(SECRETS, known, [id]);
    save(unlocked);
    stage.syncHandHidden();
  };
  document.querySelectorAll<HTMLAnchorElement>('#supportMenu .support-link').forEach((a) => {
    a.addEventListener('click', unlock);
    // A middle click opens the link too; it counts the same (navigation is left alone).
    a.addEventListener('auxclick', (e) => e.button === 1 && unlock());
  });
  // Other tabs: an unlock there shows up here, and clearing site data there locks again here.
  // Two tabs unlocking at the same moment overwrite each other's save, so each writes back the
  // union and both draws survive.
  addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    const saved = readUnlocked();
    const now = e.newValue === null ? saved : mergeUnlocked(SECRETS, saved, unlocked);
    if (now.length > saved.length) save(now);
    if (now.join() === unlocked.join()) return;
    unlocked = now;
    stage.syncHandHidden();
    releaseLockedEdition(store);
  });
}
