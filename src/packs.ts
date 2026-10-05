// The packs: which finishes start in the hand, which pack holds each of the others, and which
// finishes this browser owns. Plain data and pure functions (tested under Node); the DOM side is
// src/packStore.ts. The design is in docs/packs.md.

import type { EditionId } from './editions';
import type { FinishModule } from './gl/finishes/types';

/** The hand-picked finishes in the hand from the start, in hand order. Nothing else loads until asked for. */
export const OPEN_EDITIONS: readonly EditionId[] = ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch'];

export type PackId = 'metal' | 'jewel' | 'light' | 'nature' | 'studio' | 'supporter' | 'lab';

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
    finishes: ['platinum', 'gold', 'relief', 'cosmoholo'],
    wrap: 'gold',
    colors: ['#1f1209', '#a86a22', '#f2c14e'],
    load: () => import('./gl/finishes/metal'),
  },
  {
    id: 'jewel',
    finishes: ['crystal', 'opal', 'raden', 'kintsugi'],
    wrap: 'opal',
    colors: ['#14080b', '#9e1f2e', '#f3e2c4'],
    load: () => import('./gl/finishes/jewel'),
  },
  {
    id: 'light',
    finishes: ['galaxy', 'aurora', 'glow', 'blacklight', 'neon', 'shallows'],
    wrap: 'holo',
    colors: ['#06101f', '#2a5fa8', '#7fe3f0'],
    load: () => import('./gl/finishes/light'),
  },
  {
    id: 'nature',
    finishes: ['sakura', 'frost', 'stardust', 'magma'],
    wrap: 'sakura',
    colors: ['#0f1a14', '#3f8a5c', '#ffa8c8'],
    load: () => import('./gl/finishes/nature'),
  },
  {
    id: 'studio',
    finishes: ['halftone', 'warmth', 'stainedglass', 'lenticularflip', 'lenticular3d', 'shadowbox'],
    wrap: 'halftone',
    colors: ['#151518', '#d83a6a', '#ffd84a'],
    load: () => import('./gl/finishes/studio'),
  },
  {
    id: 'supporter',
    finishes: ['confetti', 'snowglobe', 'fireworks'],
    wrap: 'prism',
    colors: ['#140f1e', '#6b5aa0', '#ffe9a8'],
    supporter: true,
    load: () => import('./gl/finishes/supporter'),
  },
  {
    // Provisional, for review: the finishes added after v0.14, until the owner places each one.
    id: 'lab',
    finishes: ['chameleon', 'neon', 'rain', 'plasma', 'liquidmetal', 'kaleidoscope', 'marble', 'mirrorball'],
    wrap: 'holo',
    colors: ['#0c1418', '#2f8a8a', '#c8f4e8'],
    load: () => import('./gl/finishes/lab'),
  },
];

export const packById = (id: PackId): Pack => PACKS.find((p) => p.id === id)!;
export const packOf = (id: EditionId): Pack | undefined => PACKS.find((p) => p.finishes.includes(id));

/**
 * The pack finishes this browser owns, and whether a support link was ever opened. Finishes, not
 * packs, are kept: a finish moved to another pack stays owned, and a pack is opened once every
 * finish in it is owned (so a pack that gains one is sealed again until it is opened anew).
 */
export interface Owned {
  owned: EditionId[];
  supporter: boolean;
}

/** Every pack finish, in pack order: the order `owned` is kept in. */
const PACKED: readonly EditionId[] = PACKS.flatMap((p) => p.finishes);
const known = (list: unknown[]): EditionId[] => PACKED.filter((id) => list.includes(id));

/**
 * The packs as they were up to v0.13, when `foil:packs` kept the ids of the packs opened (and
 * `foil:secrets` the finishes unlocked by support links up to v0.9.3): read once into the
 * finishes they held, so no finish is lost when packs are reorganized.
 */
const V013: Record<string, EditionId[]> = {
  // In today's order where they overlap (`known` sorts anyway), which keeps the table small to load.
  metal: ['platinum', 'gold', 'relief', 'cosmoholo', 'crystal'],
  light: ['galaxy', 'aurora', 'glow', 'blacklight', 'shallows'],
  nature: ['sakura', 'frost', 'stardust', 'magma', 'snowglobe'],
  studio: ['halftone', 'warmth', 'stainedglass', 'lenticularflip', 'lenticular3d', 'shadowbox'],
  supporter: ['opal', 'raden', 'kintsugi', 'confetti', 'fireworks'],
};
const fromV013 = (opened: unknown[]): EditionId[] => known(Object.entries(V013).flatMap(([id, list]) => (opened.includes(id) ? list : [])));

/** `foil:packs` as saved (or as v0.13 saved it); anything that does not parse counts as nothing owned. */
export function parsePacks(raw: string | null): Owned {
  try {
    const v = JSON.parse(raw ?? 'null') as { owned?: unknown; opened?: unknown; supporter?: unknown } | null;
    const owned = Array.isArray(v?.owned) ? known(v.owned) : Array.isArray(v?.opened) ? fromV013(v.opened) : null;
    if (owned) return { owned, supporter: v!.supporter === true };
  } catch {
    /* fall through */
  }
  return { owned: [], supporter: false };
}

/**
 * The finishes unlocked by support links up to v0.9.3 (`foil:secrets`, a JSON list): each pack of
 * the time holding one counted as opened, and any unlock at all means a support link was opened.
 * Null when there is nothing to carry over.
 */
export function fromSecrets(raw: string | null): Owned | null {
  let list: unknown;
  try {
    list = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const opened = Object.keys(V013).filter((id) => V013[id].some((f) => list.includes(f)));
  return { owned: fromV013(opened), supporter: list.length > 0 };
}

/** Both sides' finishes: two tabs that opened packs at the same moment each keep theirs. */
export function mergePacks(a: Owned, b: Owned): Owned {
  return { owned: known([...a.owned, ...b.owned]), supporter: a.supporter || b.supporter };
}

/** Opens packs: every finish in them is owned. */
export const openPacks = (o: Owned, ids: readonly PackId[]): Owned => mergePacks(o, { owned: ids.flatMap((id) => packById(id).finishes), supporter: false });

/** A pack is opened once every finish in it is owned. */
export const isOpened = (o: Owned, id: PackId): boolean => packById(id).finishes.every((f) => o.owned.includes(f));

/** The packs on the shelf: the theme packs, and the supporter pack once a support link was opened. */
export const shelf = (o: Owned): Pack[] => PACKS.filter((p) => !p.supporter || o.supporter);

/** The hand's size; Base is always one of them. */
export const HAND_SIZE = 7;
/** Every finish is open or in exactly one pack (tested), so these are all the finishes there are. */
const isEdition = (id: unknown): id is EditionId => OPEN_EDITIONS.includes(id as EditionId) || PACKED.includes(id as EditionId);

/** A saved hand made valid: owned finishes once each, at most seven, Base always among them. */
export function normalizeHand(saved: unknown, o: Owned): EditionId[] {
  if (!Array.isArray(saved)) return [...OPEN_EDITIONS];
  let hand = saved.filter((id, i): id is EditionId => isEdition(id) && available(id, o) && saved.indexOf(id) === i);
  if (!hand.includes('base')) hand = ['base', ...hand];
  return hand.slice(0, HAND_SIZE);
}

type Group = { group: PackId | 'open'; finishes: EditionId[] };

/** Everything owned, grouped: the starters, then each pack's owned finishes in pack order. */
export const ownedGroups = (o: Owned): Group[] => [
  { group: 'open', finishes: [...OPEN_EDITIONS] },
  ...PACKS.map((p) => ({ group: p.id, finishes: p.finishes.filter((id) => o.owned.includes(id)) })).filter((g) => g.finishes.length),
];

/** The deck: every owned finish not in the hand. */
export const deckOf = (hand: readonly EditionId[], o: Owned): EditionId[] => owned(o).filter((id) => !hand.includes(id));

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

/** Every owned finish, starters first, then each pack's in pack order. */
export const owned = (o: Owned): EditionId[] => ownedGroups(o).flatMap((g) => g.finishes);

/** The packs on the shelf still sealed: what Open all opens, the pack button's count, and (the first) the one the shop offers first. */
export const sealed = (o: Owned): Pack[] => shelf(o).filter((p) => !isOpened(o, p.id));

/** Open from the start, or owned. */
export const available = (id: EditionId, o: Owned): boolean => OPEN_EDITIONS.includes(id) || o.owned.includes(id);
