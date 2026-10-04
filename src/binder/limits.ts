// How much the binder holds and how its pages are laid out: six pages of nine pockets, each card in
// a pocket of its own, empty pockets left where they are. See docs/binder.md.

export const MAX_CARDS = 54;
export const MAX_BYTES = 60_000_000;
/** Pockets on a page, three by three like a real binder page. */
export const PER_PAGE = 9;
export const PAGES = MAX_CARDS / PER_PAGE;

/** What is in the binder now. */
export interface Fill {
  count: number;
  bytes: number;
}

/** Why a card of `bytes` can't go in, or null when it can. The count is named first: a discard frees both. */
export function refusal(fill: Fill, bytes: number): 'count' | 'bytes' | null {
  if (fill.count >= MAX_CARDS) return 'count';
  if (fill.bytes + bytes > MAX_BYTES) return 'bytes';
  return null;
}

/** The binder's pockets in order: a card's id, or null for an empty pocket. */
export type Layout = (string | null)[];

const isPocket = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < MAX_CARDS;

/**
 * Every card in a pocket of its own (copies, with `slot` set). A card keeps its pocket; one with no
 * pocket, one past the last, or one whose pocket an older card holds goes into the first free
 * pocket, newest first.
 */
export function arrange<T extends { id: string; at: number; slot?: number }>(cards: T[]): (T & { slot: number })[] {
  const taken = new Set<number>();
  const out: (T & { slot: number })[] = [];
  const loose: T[] = [];
  for (const c of [...cards].sort((a, b) => a.at - b.at)) {
    if (isPocket(c.slot) && !taken.has(c.slot)) {
      taken.add(c.slot);
      out.push({ ...c, slot: c.slot });
    } else loose.push(c);
  }
  let next = 0;
  for (const c of loose.sort((a, b) => b.at - a.at)) {
    while (taken.has(next)) next++;
    taken.add(next);
    out.push({ ...c, slot: next });
  }
  return out;
}

export function layout(cards: { id: string; slot: number }[]): Layout {
  const lay: Layout = Array(MAX_CARDS).fill(null);
  for (const c of cards) lay[c.slot] = c.id;
  return lay;
}

/** Page `page`'s nine pockets. */
export function pocketsOn(lay: Layout, page: number): Layout {
  return lay.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
}

/** The card in pocket `from` goes to pocket `to`; a card there takes its place. */
export function swap(lay: Layout, from: number, to: number): Layout {
  const next = [...lay];
  [next[from], next[to]] = [lay[to], lay[from]];
  return next;
}

/** The first empty pocket at or after `from`, or -1. */
export function firstFree(lay: Layout, from = 0): number {
  for (let i = from; i < lay.length; i++) if (lay[i] === null) return i;
  return -1;
}
