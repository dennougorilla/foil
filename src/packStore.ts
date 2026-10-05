// The finishes this browser owns from packs, kept under their own key (`foil:packs`) so that undo,
// resets or a store schema change can never take one back. Opening either support link once puts
// the Supporter pack on the shelf (an honor system: nothing checks a payment). Other tabs follow.
// The design is in docs/packs.md.

import type { EditionId } from './editions';
import { available, fromSecrets, mergePacks, normalizeHand, openPacks, parsePacks, type Owned, type PackId } from './packs';
import type { Store } from './state';

const KEY = 'foil:packs';
/** The finishes unlocked by support links up to v0.9.3; carried over once, then removed. */
const LEGACY = 'foil:secrets';
/** Where a card restored from storage lands if its finish is not owned (the store's default). */
const FALLBACK: EditionId = 'holo';
const NONE: Owned = { owned: [], supporter: false };

function read(): Owned {
  try {
    const raw = localStorage.getItem(KEY);
    const legacy = fromSecrets(localStorage.getItem(LEGACY));
    const now = legacy ? mergePacks(parsePacks(raw), legacy) : parsePacks(raw);
    // Kept in today's shape: a v0.13 save (pack ids) or the old unlocks are read once, then written over.
    if ((raw !== null || legacy) && raw !== JSON.stringify(now)) localStorage.setItem(KEY, JSON.stringify(now));
    if (legacy) localStorage.removeItem(LEGACY);
    return now;
  } catch {
    return NONE;
  }
}

let owned = read();
const listeners: (() => void)[] = [];

const same = (a: Owned, b: Owned) => JSON.stringify(a) === JSON.stringify(b);

function save(o: Owned) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable: kept for this visit only */
  }
}

function commit(next: Owned) {
  if (same(next, owned)) return;
  owned = next;
  save(owned);
  for (const l of listeners) l();
}

export const packs = {
  get: (): Owned => owned,
  /** Opens packs (at the tear, when an opening is skipped, or all at once), in one save. */
  open: (ids: PackId[]) => commit(openPacks(owned, ids)),
  on: (l: () => void) => listeners.push(l),
};

/** Run before anything reads the edition: a finish not owned (site data cleared) falls back quietly. */
export function releaseSealedEdition(store: Store) {
  const s = store.get();
  if (!available(s.edition, owned)) store.set({ edition: FALLBACK });
  if (s.layer2 && !available(s.layer2.edition, owned)) store.set({ layer2: null });
  // Cards no longer owned leave the hand; the starters fill in.
  const hand = normalizeHand(s.hand, owned);
  if (hand.join() !== s.hand.join()) store.set({ hand });
}

/** Support links put the Supporter pack on the shelf; other tabs' opens and clears show up here. */
export function initPackStore(store: Store) {
  const supporter = () => commit({ ...owned, supporter: true });
  document.querySelectorAll<HTMLAnchorElement>('#supportMenu .support-link').forEach((a) => {
    a.addEventListener('click', supporter);
    // A middle click opens the link too; it counts the same (navigation is left alone).
    a.addEventListener('auxclick', (e) => e.button === 1 && supporter());
  });
  // Two tabs opening at the same moment overwrite each other's save, so each writes back the
  // union; clearing site data in one tab (key removed) seals the packs here too.
  addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    const saved = read();
    const now = e.newValue === null ? saved : mergePacks(saved, owned);
    if (!same(now, saved)) save(now);
    if (same(now, owned)) return;
    owned = now;
    releaseSealedEdition(store);
    for (const l of listeners) l();
  });
}
