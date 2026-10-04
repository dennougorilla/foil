// A piece of text's own print, picked in a small popover: the five print styles and,
// for hot foil, its colour. Everything finer (depth, gloss, ink) stays the card's.
// Opened by tapping the words on the card or the chip beside their field.

import './print.css';
import type { Store } from './state';
import type { Dict } from './i18n';
import { sfx } from './audio';
import { FOIL_RAMP, LETTER_STYLES, letteringOf, stamp, type FoilTone, type TextField } from './lettering';

/** Foil colours on offer here; a custom colour stays a card-wide setting. */
const TONES: Exclude<FoilTone, 'custom'>[] = ['gold', 'silver', 'rose', 'copper', 'rainbow'];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

export interface PrintPop {
  /** Opens for a piece of text, beside an element or at a point of the page. */
  open(field: TextField, at: HTMLElement | { x: number; y: number }): void;
  /** A chip that shows a field's print and opens the popover for it. */
  chip(field: TextField): HTMLButtonElement;
}

export function mountPrintPop(o: { store: Store; dict: () => Dict; onPick: () => void }): PrintPop {
  const { store } = o;
  const pop = el('div', 'pp');
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  const title = el('p', 'pp-title');
  title.id = 'ppTitle';
  pop.setAttribute('aria-labelledby', title.id);
  const styles = el('div', 'pp-styles');
  styles.setAttribute('role', 'radiogroup');
  // First choice: follow the card's lettering (no print of its own).
  const follow = el('button', 'pp-style pp-follow');
  follow.type = 'button';
  follow.setAttribute('role', 'radio');
  follow.addEventListener('click', () => {
    if (!store.get().prints[field]) return;
    sfx.tick();
    const next = { ...store.get().prints };
    delete next[field];
    store.set({ prints: next });
    stamp();
    o.onPick();
  });
  styles.append(follow);
  const styleBtns = LETTER_STYLES.map((id) => {
    const b = el('button', 'pp-style');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.style = id;
    b.addEventListener('click', () => pick({ style: id }));
    styles.append(b);
    return b;
  });
  const tones = el('div', 'lt-swatches pp-tones');
  tones.setAttribute('role', 'radiogroup');
  const toneBtns = TONES.map((k) => {
    const b = el('button', `lt-swatch lt-foil lt-foil-${k}`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.tone = k;
    if (k !== 'rainbow') {
      b.style.setProperty('--lo', FOIL_RAMP[k][0]);
      b.style.setProperty('--hi', FOIL_RAMP[k][1]);
    }
    b.addEventListener('click', () => pick({ foil: k }));
    tones.append(b);
    return b;
  });
  const toneName = el('span', 'pp-tone-name');
  toneName.setAttribute('aria-hidden', 'true');
  tones.append(toneName);
  pop.append(title, styles, tones);
  document.body.append(pop);

  let field: TextField = 'name';
  let opener: HTMLElement | null = null;
  const chips: { field: TextField; b: HTMLButtonElement }[] = [];

  function pick(patch: { style?: (typeof LETTER_STYLES)[number]; foil?: FoilTone }) {
    sfx.tick();
    const now = letteringOf(field);
    store.set({ prints: { ...store.get().prints, [field]: { style: now.style, foil: now.foil, ...patch } } });
    stamp();
    o.onPick();
  }

  function sync() {
    const t = o.dict();
    const own = store.get().prints[field];
    const l = letteringOf(field);
    title.textContent = store.get().layout === 'tcg' && field === 'message' ? t.print.effect : t.print.title[field];
    // Following the card shows what that is; a print of its own is one of the five.
    const card = store.get().text;
    follow.innerHTML = '<b></b><small></small>';
    follow.querySelector('b')!.textContent = t.print.shared;
    follow.querySelector('small')!.textContent = t.lt.style[card.style].replace('​', '');
    follow.setAttribute('aria-checked', String(!own));
    follow.tabIndex = own ? -1 : 0;
    styles.setAttribute('aria-label', t.lt.styles);
    tones.setAttribute('aria-label', t.lt.foil);
    styleBtns.forEach((b) => {
      const id = b.dataset.style as (typeof LETTER_STYLES)[number];
      b.textContent = t.lt.style[id];
      b.setAttribute('aria-checked', String(!!own && id === own.style));
      b.tabIndex = own && id === own.style ? 0 : -1;
    });
    tones.hidden = l.style !== 'foil';
    toneName.textContent = t.lt.foilName[l.foil];
    toneBtns.forEach((b) => {
      const k = b.dataset.tone as FoilTone;
      b.setAttribute('aria-checked', String(k === l.foil));
      b.setAttribute('aria-label', t.lt.foilName[k]);
      b.title = t.lt.foilName[k];
    });
    for (const c of chips) syncChip(c.b, c.field);
  }

  function syncChip(b: HTMLButtonElement, f: TextField) {
    const t = o.dict();
    const l = letteringOf(f);
    const own = !!store.get().prints[f];
    b.querySelector('span')!.textContent = t.lt.style[l.style].replace('​', '');
    b.classList.toggle('is-own', own);
    b.dataset.style = l.style;
    b.dataset.tone = l.style === 'foil' ? l.foil : '';
    const label = `${t.print.title[f]}: ${t.lt.style[l.style].replace('​', '')}${own ? ` (${t.print.own})` : ''}`;
    b.setAttribute('aria-label', label);
    b.title = label;
  }

  function place(at: HTMLElement | { x: number; y: number }) {
    const r = at instanceof HTMLElement ? at.getBoundingClientRect() : new DOMRect(at.x, at.y, 0, 0);
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    // Beside the anchor if there is room (so the words it belongs to stay in view), else below or above it.
    const right = r.right + 12 + w < innerWidth - 8;
    // A chip in the panel looks left, over the stage, so the fields stay in view.
    const left = !right && r.left - 12 - w > 8 && !!(at instanceof HTMLElement && at.closest('.panel'));
    const side = right || left;
    const x = right ? r.right + 12 : left ? r.left - 12 - w : Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const below = side ? r.top - 14 : r.bottom + 10;
    const y = Math.max(8, below + h < innerHeight - 8 ? below : r.top - h - 10);
    pop.style.left = `${x + scrollX}px`;
    pop.style.top = `${y + scrollY}px`;
    // A pointer to what opened it: from the side, level with it; else from above or below, under it.
    pop.dataset.from = right ? 'side' : left ? 'side-end' : y > r.top ? 'below' : 'above';
    pop.style.setProperty('--px', `${Math.min(Math.max(16, r.left + r.width / 2 - x), w - 16)}px`);
    pop.style.setProperty('--py', `${Math.min(Math.max(16, r.top + r.height / 2 - y), h - 16)}px`);
  }

  function close(refocus = true) {
    if (pop.hidden) return;
    pop.hidden = true;
    if (refocus) opener?.focus({ preventScroll: true });
    opener = null;
  }

  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.pp-chip, #cardSlot')) close(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) close();
  });
  addEventListener('resize', () => close(false));
  // Arrow keys move along the choices, like the panel's own radio rows.
  styles.addEventListener('keydown', (e) => {
    const all = [follow, ...styleBtns];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + 1, ArrowUp: i - 1 }[e.key];
    if (i < 0 || n === undefined) return;
    e.preventDefault();
    const b = all[(n + all.length) % all.length];
    b.click();
    b.focus();
  });

  store.on((_, changed) => {
    if (changed.has('prints') || changed.has('text') || changed.has('lang')) sync();
  });

  function open(f: TextField, at: HTMLElement | { x: number; y: number }) {
      field = f;
      opener = at instanceof HTMLElement ? at : null;
      pop.hidden = false;
      sync();
      place(at);
      pop.classList.remove('is-in');
      void pop.offsetWidth;
      pop.classList.add('is-in');
      styles.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus({ preventScroll: true });
  }

  return {
    open,
    chip(f) {
      const b = el('button', 'pp-chip');
      b.type = 'button';
      b.dataset.field = f;
      b.append(el('span'));
      b.addEventListener('click', () => {
        sfx.tick();
        if (!pop.hidden && field === f) close();
        else open(f, b);
      });
      chips.push({ field: f, b });
      syncChip(b, f);
      return b;
    },
  };
}
