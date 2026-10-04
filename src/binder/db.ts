// The binder's own database: a small index of every card, the thumbnails, and the cards' settings
// and pictures, each in its own store so the binder reads only what it shows. See docs/binder.md.

import type { Card } from '../state';
import type { EditionId } from '../editions';
import type { Fill } from './limits';

const DB = 'foil-binder';

/** What the binder lists: read for every card when it opens. */
export interface Meta {
  id: string;
  /** When it was kept (ms since the epoch); newest first. */
  at: number;
  name: string;
  edition: EditionId;
  /** Thumbnail plus picture. */
  bytes: number;
}

/** Read only when the card is played. */
export interface Kept {
  card: Card;
  /** The person's picture; null for a sample (its number is in the card). */
  picture: Blob | null;
}

let db: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta', { keyPath: 'id' });
      req.result.createObjectStore('thumbs');
      req.result.createObjectStore('cards');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.catch(() => (db = null));
  return db;
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const t = (await open()).transaction(stores, mode);
  const req = run(t);
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const fits = (m: Meta) => typeof m.id === 'string' && typeof m.at === 'number' && typeof m.bytes === 'number' && typeof m.name === 'string';

/** Every card's index entry, newest first; a card that doesn't fit the current shape is thrown away. */
export async function list(): Promise<Meta[]> {
  const all = await tx<Meta[]>(['meta'], 'readonly', (t) => t.objectStore('meta').getAll());
  const bad = all.filter((m) => !fits(m)).map((m) => m.id);
  if (bad.length) await discard(bad);
  return all.filter(fits).sort((a, b) => b.at - a.at);
}

export const fillOf = (metas: Meta[]): Fill => ({ count: metas.length, bytes: metas.reduce((n, m) => n + m.bytes, 0) });

export const thumb = (id: string) => tx<Blob | undefined>(['thumbs'], 'readonly', (t) => t.objectStore('thumbs').get(id));

export const kept = (id: string) => tx<Kept | undefined>(['cards'], 'readonly', (t) => t.objectStore('cards').get(id));

export async function put(meta: Meta, thumbnail: Blob, card: Kept): Promise<void> {
  await tx(['meta', 'thumbs', 'cards'], 'readwrite', (t) => {
    t.objectStore('meta').put(meta);
    t.objectStore('thumbs').put(thumbnail, meta.id);
    t.objectStore('cards').put(card, meta.id);
  });
}

export async function discard(ids: string[]): Promise<void> {
  await tx(['meta', 'thumbs', 'cards'], 'readwrite', (t) => {
    for (const id of ids) for (const s of ['meta', 'thumbs', 'cards']) t.objectStore(s).delete(id);
  });
}
