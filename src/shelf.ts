// The pack shelf under the hand: sealed packs to open, opened ones as folders. Picking a folder
// deals its finishes into the hand after the open ones; picking it again puts it away. The active
// folder carries a button to watch its opening again. See docs/packs.md.

import { sfx } from './audio';
import type { Dict } from './i18n';
import { shelf, type Pack, type PackId } from './packs';
import { packs } from './packStore';
import type { Store } from './state';

export interface ShelfOptions {
  /** A sealed pack is about to be picked (pointer over it, or focus): fetch what its opening needs. */
  onPrefetch: (pack: Pack) => void;
  host: HTMLElement;
  store: Store;
  dict: () => Dict;
  /** A sealed pack was picked, or a replay asked for; `from` is the chip, where the pack flies out of. */
  onOpen: (pack: Pack, from: DOMRect) => void;
}

const REPLAY_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2a6 6 0 1 0 6 6h-2a4 4 0 1 1-1.2-2.8L9 7h5V2l-1.8 1.8A6 6 0 0 0 8 2z"/></svg>';

export function mountShelf(o: ShelfOptions) {
  const { host, store } = o;
  /** Packs shown last time, so one that just arrived (the Supporter pack) gets an entrance. */
  let shown = new Set<PackId>();
  /** A folder just made by an opening, greeted once when the overlay closes. */
  let fresh: PackId | null = null;

  const render = () => {
    const t = o.dict().pack;
    const s = store.get();
    const list = shelf(packs.get());
    // Re-rendering replaces the buttons; keyboard focus stays on the same one.
    const el = document.activeElement as HTMLElement | null;
    const kept = el && host.contains(el) ? (el.classList.contains('pk-replay') ? 'replay' : el.dataset.pack) : null;
    host.setAttribute('aria-label', t.shelf);
    host.innerHTML = `<span class="shelf-label" aria-hidden="true">${t.shelf}</span>`;
    for (const p of list) {
      const opened = packs.isOpened(p.id);
      const active = opened && s.folder === p.id;
      const name = t.name[p.id];
      const n = String(p.finishes.length);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pk-chip';
      b.dataset.pack = p.id;
      b.dataset.state = active ? 'active' : opened ? 'open' : 'sealed';
      if (p.supporter) b.classList.add('is-supporter');
      if (shown.size && !shown.has(p.id)) b.classList.add('is-new');
      if (p.id === fresh) b.classList.add('is-fresh');
      b.style.setProperty('--a', p.colors[0]);
      b.style.setProperty('--b', p.colors[1]);
      b.style.setProperty('--c', p.colors[2]);
      if (opened) b.setAttribute('aria-pressed', String(active));
      b.setAttribute('aria-label', (opened ? t.folderChip : t.openChip).replace('{name}', name).replace('{n}', n));
      const note = active ? t.inHand : opened ? n : t.sealed;
      b.innerHTML = `<i class="pk-glyph" aria-hidden="true"></i><b>${name}</b><small aria-hidden="true">${note.replace('{n}', n)}</small>`;
      if (!opened) for (const ev of ['pointerenter', 'focus', 'pointerdown']) b.addEventListener(ev, () => o.onPrefetch(p), { once: true });
      b.addEventListener('click', () => {
        if (!packs.isOpened(p.id)) return o.onOpen(p, b.getBoundingClientRect());
        sfx.tick();
        store.set({ folder: store.get().folder === p.id ? null : p.id });
      });
      host.appendChild(b);
      if (active) {
        const r = document.createElement('button');
        r.type = 'button';
        r.className = 'pk-replay';
        r.setAttribute('aria-label', t.replay);
        r.title = t.replay;
        r.innerHTML = `${REPLAY_ICON}<span aria-hidden="true">${t.replayShort}</span>`;
        r.addEventListener('click', () => o.onOpen(p, b.getBoundingClientRect()));
        host.appendChild(r);
      }
    }
    shown = new Set(list.map((p) => p.id));
    if (kept) host.querySelector<HTMLElement>(kept === 'replay' ? '.pk-replay' : `[data-pack="${kept}"]`)?.focus();
  };

  packs.on(render);
  store.on((_, changed) => {
    if (changed.has('folder') || changed.has('lang')) render();
  });
  render();
  return {
    render,
    focus: (id: PackId) => host.querySelector<HTMLElement>(`[data-pack="${id}"]`)?.focus(),
    greet(id: PackId) {
      fresh = id;
      render();
      fresh = null;
    },
  };
}
