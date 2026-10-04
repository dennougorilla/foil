// "Outside the area" in the Finish area tab: a second finish wherever the area leaves the card's own
// out (docs/layering.md). Only owned finishes that layer are offered.
import { editionById, outsideChoices, type EditionId } from './editions';
import { owned, packOf, type PackId } from './packs';
import { packs } from './packStore';
import { sfx } from './audio';
import type { Dict } from './i18n';
import type { Store } from './state';

export interface OutsideHost {
  store: Store;
  t: () => Dict;
  announce: (msg: string) => void;
  /** The field to fill. */
  root: HTMLElement;
  /** Whether the card's own finish leaves nothing out, so a second one would not show. */
  covered: () => boolean;
}

export function initOutside(host: OutsideHost) {
  const { store, root } = host;
  root.innerHTML = `
    <div class="field-head">
      <span class="field-label" id="outsideLabel"></span>
      <span class="outside-tag" hidden></span>
    </div>
    <div class="outside-now">
      <i class="outside-sw" aria-hidden="true"></i>
      <b class="outside-name"></b>
      <button class="outside-off link" type="button"></button>
      <button class="finish-pick outside-pick" type="button" aria-expanded="false" aria-controls="outsideList"></button>
    </div>
    <p class="hint outside-hint"><span></span> <button class="link outside-fix" type="button" hidden></button></p>
    <div class="outside-list" id="outsideList" role="radiogroup" hidden></div>
  `;
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const list = q('.outside-list');
  const pick = q<HTMLButtonElement>('.outside-pick');
  let open = false;
  /** Share of the card the card's own finish covers, and whether the area is more than a region (from the area's measure). */
  let cover = 0;
  let custom = false;

  const name = (id: EditionId) => host.t().edition[id];
  /** The finish's own colours on a swatch: its accent over its swirl. */
  const paint = (el: HTMLElement, id: EditionId | null) => {
    const e = id ? editionById(id) : null;
    for (const [k, v] of [['--c', e?.color], ['--c1', e?.swirl[0]], ['--c2', e?.swirl[1]], ['--c3', e?.swirl[2]]] as const) {
      if (v) el.style.setProperty(k, v);
      else el.style.removeProperty(k);
    }
  };

  function choose(id: EditionId | null) {
    const t = host.t();
    sfx.tick();
    setOpen(false);
    pick.focus({ preventScroll: true });
    if (id === store.get().outside) return;
    // Over the whole card nothing is left out; move the card's own finish to the art so the frame takes this one.
    const move = id !== null && host.covered();
    store.set(move ? { outside: id, rangeRegion: 'art', rangeLo: 0, rangeHi: 1, rangeInvert: false } : { outside: id });
    host.announce(id === null ? t.outsideCleared : (move ? t.outsideMoved : t.outsideSet).replace('{x}', name(id)));
  }

  function setOpen(on: boolean) {
    open = on;
    list.hidden = !on;
    pick.setAttribute('aria-expanded', String(on));
    sync();
    if (on) {
      build();
      // The list scrolls inside its own pocket; the chosen chip is brought into it, the field stays in view.
      const on = list.querySelector<HTMLElement>('[aria-checked=true]');
      if (on) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2;
      on?.focus({ preventScroll: true });
      reveal();
    }
  }

  /** Scrolls the opened field clear of the Save box (and the fade above it), never past the sticky tabs. */
  function reveal() {
    const r = root.getBoundingClientRect();
    const save = document.querySelector('.sec-export')?.getBoundingClientRect().top ?? innerHeight;
    const tabs = document.querySelector('.tabs-bar')?.getBoundingClientRect().bottom ?? 0;
    const by = Math.min(r.bottom - (save - 48), r.top - tabs - 8);
    if (by <= 0) return;
    const panel = document.getElementById('panel')!;
    // The panel scrolls on its own beside the stage; on phones the page does.
    (getComputedStyle(panel).overflowY === 'visible' ? window : panel).scrollBy({ top: by });
  }

  pick.addEventListener('click', () => {
    sfx.tick();
    setOpen(!open);
  });
  q('.outside-off').addEventListener('click', () => choose(null));
  q('.outside-fix').addEventListener('click', () => {
    sfx.tick();
    store.set({ rangeRegion: 'art', rangeLo: 0, rangeHi: 1, rangeInvert: false });
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
      pick.focus();
    }
  });
  // Arrow keys move through the chips, like the panel's other radio groups.
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll<HTMLElement>('[role=radio]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (i < 0 || !dir) return;
    e.preventDefault();
    items[(i + dir + items.length) % items.length].focus();
  });

  /** The chips: Plain, then the owned finishes grouped as in the deck (starters, then each pack). */
  function build() {
    const t = host.t();
    const s = store.get();
    list.textContent = '';
    list.setAttribute('aria-label', t.outsideList);
    const chip = (id: EditionId | null) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'outside-chip';
      b.setAttribute('role', 'radio');
      const on = s.outside === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      paint(b, id);
      b.dataset.v = id ?? '';
      b.innerHTML = `<i aria-hidden="true"></i><span></span>`;
      b.lastElementChild!.textContent = id ? name(id) : t.outsidePlain;
      b.onclick = () => choose(id);
      return b;
    };
    list.append(chip(null));
    let group: PackId | 'open' | null = null;
    for (const id of outsideChoices(owned(packs.get()), s.edition)) {
      const g = packOf(id)?.id ?? 'open';
      if (g !== group) {
        group = g;
        const h = document.createElement('p');
        h.className = 'outside-group';
        h.textContent = g === 'open' ? t.pack.deckStarters : t.pack.name[g];
        list.append(h);
      }
      list.append(chip(id));
    }
    if (!list.querySelector('[tabindex="0"]')) list.querySelector<HTMLElement>('[role=radio]')!.tabIndex = 0;
  }

  function sync() {
    const t = host.t();
    const id = store.get().outside;
    q('#outsideLabel').textContent = t.outside;
    const hidden = !!id && cover > 0.995;
    q('.outside-tag').textContent = hidden ? t.outsideHiddenTag : t.outsideTag;
    q('.outside-tag').classList.toggle('is-hidden', hidden);
    q('.outside-tag').hidden = !id;
    root.classList.toggle('is-on', !!id);
    paint(q('.outside-sw'), id);
    q('.outside-name').textContent = id ? name(id) : t.outsidePlain;
    q('.outside-off').textContent = t.outsideOff;
    q('.outside-off').hidden = !id;
    pick.textContent = open ? t.outsideDone : id ? t.outsideChange : t.outsideAdd;
    // Say where the outside finish lands; if the area leaves nothing out, say so and offer the art.
    const s = store.get();
    const place = t.outsidePlace[s.rangeRegion];
    q('.outside-hint > span').textContent = !id
      ? t.outsideHintOff
      : hidden
        ? t.outsideHidden.replace('{x}', name(id))
        : (custom || !place ? t.outsideHint : t.outsideAt).replace('{x}', name(id)).replace('{p}', place);
    q('.outside-hint').classList.toggle('is-warn', hidden);
    q('.outside-fix').textContent = t.outsideFix;
    q('.outside-fix').hidden = !hidden;
  }

  store.on((_s, changed) => {
    if ((['outside', 'edition', 'lang', 'rangeRegion'] as const).some((k) => changed.has(k))) {
      sync();
      if (open) build();
    }
  });
  packs.on(() => open && build());
  sync();
  return {
    /** After the area is measured: what the card's own finish covers, and whether brightness, invert or the brush shape it. */
    setCover(f: number, isCustom: boolean) {
      cover = f;
      custom = isCustom;
      sync();
    },
  };
}
