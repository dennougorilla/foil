// The packs: which finishes start in the hand, which pack holds each of the others, and what is
// opened. Plain data and pure functions (tested under Node); the DOM side is src/packStore.ts.
// The design is in docs/packs.md.

import type { EditionId } from './editions';
import type { FinishModule } from './gl/finishes/types';

/** The hand-picked finishes in the hand from the start, in hand order. Nothing else loads until asked for. */
export const OPEN_EDITIONS: readonly EditionId[] = ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch'];

export type PackId = 'metal' | 'light' | 'nature' | 'studio' | 'supporter';

export interface Pack {
  id: PackId;
  /** The whole theme, in reveal order: the last is the showpiece. */
  finishes: readonly EditionId[];
  /** The finish the wrapper is printed in (an open one or one of its own, so it is loaded with it). */
  wrap: EditionId;
  /** Wrapper and room colors: dark, mid, light. */
  colors: readonly [string, string, string];
  /** Shown only once a support link was opened, and opened with more ceremony. */
  supporter?: boolean;
  load: () => Promise<{ default: FinishModule }>;
}

export const PACKS: readonly Pack[] = [
  {
    id: 'metal',
    finishes: ['relief', 'gold', 'crystal'],
    wrap: 'gold',
    colors: ['#1f1209', '#a86a22', '#f2c14e'],
    load: () => import('./gl/finishes/metal'),
  },
  {
    id: 'light',
    finishes: ['galaxy', 'aurora', 'shallows'],
    wrap: 'holo',
    colors: ['#06101f', '#2a5fa8', '#7fe3f0'],
    load: () => import('./gl/finishes/light'),
  },
  {
    id: 'nature',
    finishes: ['sakura', 'frost', 'magma'],
    wrap: 'sakura',
    colors: ['#0f1a14', '#3f8a5c', '#ffa8c8'],
    load: () => import('./gl/finishes/nature'),
  },
  {
    id: 'studio',
    finishes: ['halftone', 'warmth', 'shadowbox'],
    wrap: 'halftone',
    colors: ['#151518', '#d83a6a', '#ffd84a'],
    load: () => import('./gl/finishes/studio'),
  },
  {
    id: 'supporter',
    finishes: ['opal', 'raden', 'kintsugi'],
    wrap: 'opal',
    colors: ['#140f1e', '#6b5aa0', '#ffe9a8'],
    supporter: true,
    load: () => import('./gl/finishes/supporter'),
  },
];

export const packById = (id: PackId): Pack => PACKS.find((p) => p.id === id)!;
export const packOf = (id: EditionId): Pack | undefined => PACKS.find((p) => p.finishes.includes(id));

/** What this browser has opened, and whether a support link was ever opened. */
export interface Opened {
  opened: PackId[];
  supporter: boolean;
}

const known = (list: unknown[]): PackId[] => PACKS.map((p) => p.id).filter((id) => list.includes(id));

/** `foil:packs` as saved; anything that does not parse counts as nothing opened. */
export function parsePacks(raw: string | null): Opened {
  try {
    const v = JSON.parse(raw ?? 'null') as { opened?: unknown; supporter?: unknown } | null;
    if (v && typeof v === 'object' && Array.isArray(v.opened)) return { opened: known(v.opened), supporter: v.supporter === true };
  } catch {
    /* fall through */
  }
  return { opened: [], supporter: false };
}

/**
 * The finishes unlocked by support links up to v0.9.3 (`foil:secrets`, a JSON list), as packs: each
 * pack holding one counts as opened, and any unlock at all means a support link was opened.
 * Null when there is nothing to carry over.
 */
export function fromSecrets(raw: string | null): Opened | null {
  let list: unknown;
  try {
    list = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const opened = PACKS.filter((p) => p.finishes.some((id) => list.includes(id))).map((p) => p.id);
  return { opened, supporter: list.length > 0 };
}

/** Both sides' packs: two tabs that opened at the same moment each keep theirs. */
export function mergePacks(a: Opened, b: Opened): Opened {
  return { opened: known([...a.opened, ...b.opened]), supporter: a.supporter || b.supporter };
}

/** The packs on the shelf: the theme packs, and the supporter pack once a support link was opened. */
export const shelf = (o: Opened): Pack[] => PACKS.filter((p) => !p.supporter || o.supporter);

/** The hand's size; Base is always one of them. */
export const HAND_SIZE = 7;
/** Every finish is open or in exactly one pack (tested), so these are all the finishes there are. */
const isEdition = (id: unknown): id is EditionId => OPEN_EDITIONS.includes(id as EditionId) || PACKS.some((p) => p.finishes.includes(id as EditionId));

/** A saved hand made valid: owned finishes once each, at most seven, Base always among them. */
export function normalizeHand(saved: unknown, o: Opened): EditionId[] {
  if (!Array.isArray(saved)) return [...OPEN_EDITIONS];
  let hand = saved.filter((id, i): id is EditionId => isEdition(id) && available(id, o) && saved.indexOf(id) === i);
  if (!hand.includes('base')) hand = ['base', ...hand];
  return hand.slice(0, HAND_SIZE);
}

type Group = { group: PackId | 'open'; finishes: EditionId[] };

/** Everything owned, grouped: the starters, then each opened pack in pack order. */
export const ownedGroups = (o: Opened): Group[] => [
  { group: 'open', finishes: [...OPEN_EDITIONS] },
  ...PACKS.filter((p) => o.opened.includes(p.id)).map((p) => ({ group: p.id, finishes: [...p.finishes] })),
];

/** The deck: every owned finish not in the hand, grouped the same way (empty groups left out). */
export const deckOf = (hand: readonly EditionId[], o: Opened): Group[] =>
  ownedGroups(o)
    .map((g) => ({ group: g.group, finishes: g.finishes.filter((id) => !hand.includes(id)) }))
    .filter((g) => g.finishes.length);

/**
 * Adds a card to the hand: at `at` (a slot just emptied) or the end; a full hand gives up its last
 * card that is not Base.
 */
export function addToHand(hand: readonly EditionId[], id: EditionId, at?: number): EditionId[] {
  if (hand.includes(id)) return [...hand];
  if (hand.length < HAND_SIZE) {
    const i = at === undefined ? hand.length : Math.max(0, Math.min(at, hand.length));
    return [...hand.slice(0, i), id, ...hand.slice(i)];
  }
  const last = hand.map((x) => x !== 'base').lastIndexOf(true);
  return hand.map((x, i) => (i === last ? id : x));
}

/** Puts a card exactly in slot `at`, swapping out what is there (never Base); past the end it is added. */
export function placeAt(hand: readonly EditionId[], id: EditionId, at: number): EditionId[] {
  if (hand[at] === 'base') return [...hand];
  const rest = hand.filter((x) => x !== id);
  if (at >= rest.length) return addToHand(rest, id);
  return rest.map((x, i) => (i === at ? id : x));
}

/** Sends a card back to the deck; Base stays. */
export const removeFromHand = (hand: readonly EditionId[], id: EditionId): EditionId[] => (id === 'base' ? [...hand] : hand.filter((x) => x !== id));

/** The first pack on the shelf that is still sealed: the one the shop offers first. */
export const firstSealed = (o: Opened): Pack | undefined => shelf(o).find((p) => !o.opened.includes(p.id));

/** Open from the start, or in an opened pack. */
export function available(id: EditionId, o: Opened): boolean {
  const pack = packOf(id);
  return !pack || o.opened.includes(pack.id);
}

/** How big an entrance the card at `i` gets: 3 for the showpiece, 2 for the one before it, else 1. */
export function tierOf(pack: Pack, i: number): 1 | 2 | 3 {
  const n = pack.finishes.length;
  return i === n - 1 ? 3 : i === n - 2 ? 2 : 1;
}
