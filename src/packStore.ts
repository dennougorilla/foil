// What this browser has opened, kept under its own key (`foil:packs`) so that undo, resets or a
// store schema change can never take a pack back. Opening either support link once puts the
// Supporter pack on the shelf (an honor system: nothing checks a payment). Other tabs follow.
// The design is in docs/packs.md.

import type { EditionId } from './editions';
import { available, fromSecrets, mergePacks, parsePacks, type Opened, type PackId } from './packs';
import type { Store } from './state';

const KEY = 'foil:packs';
/** The finishes unlocked by support links up to v0.9.3; carried over once, then removed. */
const LEGACY = 'foil:secrets';
/** Where a card restored from storage lands if its pack is sealed (the store's default). */
const FALLBACK: EditionId = 'holo';
const NONE: Opened = { opened: [], supporter: false };

function read(): Opened {
  try {
    const saved = parsePacks(localStorage.getItem(KEY));
    const legacy = fromSecrets(localStorage.getItem(LEGACY));
    if (!legacy) return saved;
    const merged = mergePacks(saved, legacy);
    localStorage.setItem(KEY, JSON.stringify(merged));
    localStorage.removeItem(LEGACY);
    return merged;
  } catch {
    return NONE;
  }
}

let opened = read();
const listeners: (() => void)[] = [];

const same = (a: Opened, b: Opened) => JSON.stringify(a) === JSON.stringify(b);

function save(o: Opened) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable: kept for this visit only */
  }
}

function commit(next: Opened) {
  if (same(next, opened)) return;
  opened = next;
  save(opened);
  for (const l of listeners) l();
}

export const packs = {
  get: (): Opened => opened,
  isOpened: (id: PackId) => opened.opened.includes(id),
  /** Marks a pack opened (at the tear, or when its opening is skipped). */
  open: (id: PackId) => commit(mergePacks(opened, { opened: [id], supporter: false })),
  on: (l: () => void) => listeners.push(l),
};

/** Run before anything reads the edition: a finish whose pack is sealed falls back quietly. */
export function releaseSealedEdition(store: Store) {
  const s = store.get();
  if (!available(s.edition, opened)) store.set({ edition: FALLBACK });
  if (s.folder && !opened.opened.includes(s.folder)) store.set({ folder: null });
}

/** Support links put the Supporter pack on the shelf; other tabs' opens and clears show up here. */
export function initPackStore(store: Store) {
  const supporter = () => commit({ ...opened, supporter: true });
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
    const now = e.newValue === null ? saved : mergePacks(saved, opened);
    if (!same(now, saved)) save(now);
    if (same(now, opened)) return;
    opened = now;
    releaseSealedEdition(store);
    for (const l of listeners) l();
  });
}
