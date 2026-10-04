// How much the binder holds and how its pages are laid out. See docs/binder.md.

export const MAX_CARDS = 54;
export const MAX_BYTES = 60_000_000;
/** Pockets on a page, three by three like a real binder page. */
export const PER_PAGE = 9;

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

/** The pockets in order: while there is room, the first one keeps the card on the stage. */
function pockets(ids: string[]): ('keep' | string)[] {
  return ids.length < MAX_CARDS ? ['keep', ...ids] : ids;
}

export function pageCount(count: number): number {
  return Math.max(1, Math.ceil(pockets(Array(count).fill('')).length / PER_PAGE));
}

/** Page `page`'s nine pockets: a card's id, 'keep', or null for an empty one. */
export function pocketsOn(ids: string[], page: number): ('keep' | string | null)[] {
  const all = pockets(ids).slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  return [...all, ...Array<null>(PER_PAGE - all.length).fill(null)];
}
