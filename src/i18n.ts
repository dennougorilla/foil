// The texts load one language at a time (docs/performance.md): the page waits for its own before it
// starts (index.html fetches it beside the page's script), and a switch waits for the other.
import type { Dict } from './i18n/ja';

export type { Dict };
export type Lang = 'ja' | 'en';

const loaded: Partial<Record<Lang, Dict>> = {};

/** A language's texts, fetched once. */
export function loadDict(lang: Lang): Promise<Dict> {
  const have = loaded[lang];
  if (have) return Promise.resolve(have);
  return (lang === 'ja' ? import('./i18n/ja') : import('./i18n/en')).then((m) => (loaded[lang] = m.default));
}

/** The texts of a language already loaded (the store only ever holds one that is). */
export const dictOf = (lang: Lang): Dict => loaded[lang]!;
