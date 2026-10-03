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
    wrap: 'kintsugi',
    colors: ['#0a0806', '#5a3b1c', '#e9b955'],
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

/** The hand: the open finishes, then the chosen folder's when that pack is opened. */
export function handOf(folder: PackId | null, o: Opened): EditionId[] {
  const pack = folder && o.opened.includes(folder) ? packById(folder) : null;
  return [...OPEN_EDITIONS, ...(pack?.finishes ?? [])];
}

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
