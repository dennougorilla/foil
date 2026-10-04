// The deck builder, laid out like a card game's deck-editing screen: the hand's seven slots across
// the top, every finish owned as a grid below (the same mini cards as the hand). One tap moves a
// card between the two; dragging onto a slot puts it exactly there. Changes apply at once; undo
// and "starting seven" are at hand. The mini cards are still pictures drawn one by one with a
// single WebGL context, cached until the face, frame or light changes (`key`). Loaded only when
// the deck is opened. See docs/packs.md.

import './deckView.css';
import { CardRenderer } from '../gl/renderers';
import { loadPack } from '../gl/finishes/registry';
import { editionById, type EditionId } from '../editions';
import { addToHand, HAND_SIZE, packById, packOf, placeAt, removeFromHand, type PackId } from '../packs';
import type { Dict } from '../i18n';
import { tuneGl, type Tune } from '../tune/model';

export interface DeckViewOptions {
  dict: Dict;
  /** Everything owned, grouped: the starters, then each opened pack. */
  owned: { group: PackId | 'open'; finishes: EditionId[] }[];
  hand: EditionId[];
  /** The starting seven, for the reset. */
  starters: EditionId[];
  /** Names the face, frame and light the mini cards show; cached cards are remade when it changes. */
  key: string;
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  tune: Tune;
  /** The hand changed (it applies at once). */
  onChange: (hand: EditionId[]) => void;
  /** The way to the pack shop, for more finishes. */
  onShop: () => void;
  onClose: () => void;
}

/** The mini card's size: the hand's card at its usual size. */
const TW = 108;
const TH = 151;

/** One renderer for every opening of the builder, and the pictures it has made. */
let renderer: CardRenderer | null = null;
let rendererCanvas: HTMLCanvasElement | null = null;
let cacheKey = '';
const cache = new Map<EditionId, HTMLCanvasElement>();

function miniCard(id: EditionId, o: DeckViewOptions): HTMLCanvasElement {
  const r = renderer!;
  r.tune = tuneGl(o.tune);
  r.resize(TW + 16, TH + 20, 2);
  r.begin();
  // The same pose and light as a resting card in the hand.
  r.drawCard({ cx: (TW + 16) / 2, cy: (TH + 16) / 2, w: TW, h: TH, rx: 0.04, ry: -0.06, rz: 0, scale: 1, edition: editionById(id).shader, intensity: 1, pixel: 0, tilt: [0.25, 0.2], light: [0.5, 0.35], alpha: 1, flash: 0, shadow: [4, 6], plate: false }, 1.7);
  return copyOf(rendererCanvas!);
}

/** A copy of a picture (each place shows its own canvas). */
function copyOf(src: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export function viewDeck(o: DeckViewOptions) {
  const t = o.dict.pack;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (o.key !== cacheKey) {
    cache.clear();
    cacheKey = o.key;
  }
  let hand = [...o.hand];
  /** The slot last emptied: the next card added goes there. */
  let gap: number | null = null;
  /** With the hand full, the slot the next grid tap replaces; it steps left after each replace. */
  let outAt: number | null = null;
  const lastOut = () => hand.map((x) => x !== 'base').lastIndexOf(true);
  const outIndex = () => (outAt !== null && hand[outAt] && hand[outAt] !== 'base' ? outAt : lastOut());
  /** The card before `i` that is not Base, wrapping round. */
  const stepLeft = (i: number) => {
    for (let k = 1; k <= hand.length; k++) {
      const j = (i - k + hand.length) % hand.length;
      if (hand[j] !== 'base') return j;
    }
    return i;
  };
  const history: { hand: EditionId[]; gap: number | null }[] = [];
  let tab: PackId | 'open' | 'all' = 'all';
  /** The mini cards are being drawn (see paint). */
  let drawing = false;

  const root = document.createElement('div');
  root.className = 'dv';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t.builderTitle);
  const tabs = [{ id: 'all', label: t.tabAll }, ...o.owned.map((g) => ({ id: g.group, label: g.group === 'open' ? t.deckStarters : t.name[g.group] }))];
  root.innerHTML = `
    <div class="db">
      <header class="db-head">
        <b>${t.builderTitle}</b>
        <span class="db-count" aria-live="polite"></span>
        <span class="db-gap"></span>
        <button class="dv-x" type="button" aria-label="${t.close2}" title="${t.close2}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2h2v2h2V5h2V3h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2V9H7v2H5v2H3v-2h2V9h2V7H5V5H3z"/></svg></button>
      </header>
      <div class="db-hand" role="list" aria-label="${t.handRow}"></div>
      <p class="db-hint">${t.builderHint}</p>
      <nav class="db-tabs" role="tablist">${tabs.map((x) => `<button type="button" role="tab" class="db-tab" data-tab="${x.id}">${x.label}</button>`).join('')}</nav>
      <div class="db-grid"></div>
      <footer class="db-foot">
        <button class="db-btn db-undo" type="button">${t.undo}</button>
        <button class="db-btn db-reset" type="button">${t.resetSeven}</button>
        <button class="db-btn db-done" type="button">${t.done}</button>
      </footer>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(q: string) => root.querySelector(q) as T;
  const handEl = $('.db-hand');
  const gridEl = $('.db-grid');

  // ---------- The grid: every card owned, built once ----------

  const gridCards = new Map<EditionId, HTMLButtonElement>();
  for (const g of o.owned) {
    const sec = document.createElement('section');
    sec.className = 'dv-group';
    sec.dataset.group = g.group;
    const colors = g.group === 'open' ? ['#9fb0b3', '#5b6d73'] : [packById(g.group).colors[2], packById(g.group).colors[1]];
    sec.style.setProperty('--c', colors[0]);
    sec.style.setProperty('--b', colors[1]);
    sec.innerHTML = `<h3><i aria-hidden="true"></i>${g.group === 'open' ? t.deckStarters : t.title.replace('{name}', t.name[g.group])}</h3><div class="db-row"></div>`;
    const row = sec.querySelector('.db-row')!;
    for (const id of g.finishes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'db-card';
      b.dataset.id = id;
      b.innerHTML = `<span class="db-pic" data-id="${id}"></span><b>${o.dict.edition[id]}</b><span class="db-tag">${t.inHandTag}</span>`;
      b.title = o.dict.look[id];
      b.addEventListener('click', () => !dragged && tapGrid(id));
      b.addEventListener('pointerdown', (e) => startDrag(e, id, 'grid'));
      gridCards.set(id, b);
      row.append(b);
    }
    gridEl.append(sec);
  }
  if (o.owned.length === 1) {
    const more = document.createElement('div');
    more.className = 'db-more';
    more.innerHTML = `<p>${t.builderMore}</p><button class="dv-shop" type="button">${t.deckShop}</button>`;
    more.querySelector('button')!.addEventListener('click', () => {
      close();
      o.onShop();
    });
    gridEl.append(more);
  }

  // ---------- Rendering the state ----------

  function render() {
    // The hand's seven places: its cards, with the slot last emptied kept open where it was.
    const slots: (EditionId | null)[] = [...hand];
    if (gap !== null && hand.length < HAND_SIZE) slots.splice(Math.min(gap, slots.length), 0, null);
    while (slots.length < HAND_SIZE) slots.push(null);
    const next = gap === null ? hand.length : Math.min(gap, hand.length);
    // With the hand full, the card a grid tap will replace wears a "next out" tag.
    const out = hand.length >= HAND_SIZE ? hand[outIndex()] : null;
    handEl.innerHTML = '';
    slots.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'db-slot';
      slot.setAttribute('role', 'listitem');
      slot.dataset.slot = String(i);
      if (!id) {
        slot.classList.add('is-empty');
        if (i === next) slot.classList.add('is-next');
        slot.innerHTML = `<span class="db-empty">${t.emptySlot}</span>`;
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'db-card is-hand';
        b.dataset.id = id;
        b.innerHTML = `<span class="db-pic" data-id="${id}"></span><b>${o.dict.edition[id]}</b>`;
        if (id === 'base') {
          b.classList.add('is-locked');
          b.title = t.deckBaseStays;
          b.setAttribute('aria-label', `${o.dict.edition[id]} — ${t.deckBaseStays}`);
          b.insertAdjacentHTML('beforeend', '<i class="db-lock" aria-hidden="true"></i>');
        } else {
          b.title = t.takeOut;
          b.setAttribute('aria-label', `${o.dict.edition[id]} — ${t.takeOut}`);
        }
        if (id === out) {
          b.classList.add('is-next-out');
          b.insertAdjacentHTML('beforeend', `<span class="db-out">${t.nextOut}</span>`);
        }
        b.addEventListener('click', () => !dragged && tapHand(id));
        b.addEventListener('pointerdown', (e) => startDrag(e, id, 'hand'));
        slot.append(b);
      }
      handEl.append(slot);
    });
    for (const [id, b] of gridCards) {
      const inHand = hand.includes(id);
      b.classList.toggle('is-in', inHand);
      b.setAttribute('aria-pressed', String(inHand));
      b.setAttribute('aria-label', `${o.dict.edition[id]} — ${inHand ? t.inHandTag : t.addIn}`);
      if (id === 'base' && !b.disabled) {
        // Base: a lock and "always" where the tag would be.
        b.disabled = true;
        b.title = t.deckBaseStays;
        b.classList.add('is-locked');
        b.querySelector('.db-tag')!.innerHTML = `<i class="db-lock" aria-hidden="true"></i>${t.alwaysTag}`;
      }
    }
    $('.db-count').textContent = t.handCount.replace('{n}', String(hand.length));
    // The line under the hand says what a tap will do now.
    $('.db-hint').textContent = out ? t.hintFull.replace('{name}', o.dict.edition[out]) : t.builderHint;
    $<HTMLButtonElement>('.db-undo').disabled = !history.length;
    $<HTMLButtonElement>('.db-reset').disabled = hand.join() === o.starters.join();
    for (const b of root.querySelectorAll<HTMLElement>('.db-tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    for (const s of root.querySelectorAll<HTMLElement>('.dv-group')) s.hidden = tab !== 'all' && s.dataset.group !== tab;
    paint();
  }

  /** Commits a new hand: remembered for undo, applied at once. */
  function commit(next: EditionId[], nextGap: number | null) {
    if (next.join() === hand.join()) return;
    history.push({ hand, gap });
    hand = next;
    gap = nextGap;
    render();
    o.onChange(hand);
  }

  // ---------- Moves ----------

  const picOf = (el: Element | null | undefined) => (el?.querySelector('.db-pic') ?? el) as HTMLElement | null;

  function tapGrid(id: EditionId) {
    if (hand.includes(id)) return takeOut(id);
    const from = picOf(gridCards.get(id))!.getBoundingClientRect();
    const full = hand.length >= HAND_SIZE;
    const oi = outIndex();
    const out = full ? hand[oi] : null;
    const outRect = out ? picOf(handEl.querySelector(`.db-card[data-id="${out}"]`))!.getBoundingClientRect() : null;
    const at = gap !== null && !full ? Math.min(gap, hand.length) : undefined;
    // A full hand gives up its "next out" card, and the tag moves to the card before it.
    commit(full ? placeAt(hand, id, oi) : addToHand(hand, id, at), null);
    if (full) {
      outAt = stepLeft(oi);
      render();
    }
    fly(id, from, slotRect(id));
    if (out && outRect) fly(out, outRect, picOf(gridCards.get(out))!.getBoundingClientRect());
  }

  function tapHand(id: EditionId) {
    if (id === 'base') return nudge(handEl.querySelector('.db-card.is-locked'));
    takeOut(id);
  }

  function takeOut(id: EditionId) {
    if (id === 'base') return;
    outAt = null;
    const from = picOf(handEl.querySelector(`.db-card[data-id="${id}"]`))!.getBoundingClientRect();
    commit(removeFromHand(hand, id), hand.indexOf(id));
    fly(id, from, picOf(gridCards.get(id))!.getBoundingClientRect());
  }

  function dropOnSlot(id: EditionId, slotIndex: number, from: DOMRect, source: 'grid' | 'hand') {
    // Where that slot falls among the hand's cards (empty slots don't count).
    const before = [...handEl.querySelectorAll('.db-slot')].slice(0, slotIndex).filter((s) => !s.classList.contains('is-empty')).length;
    if (source === 'hand') {
      // Reordering within the hand.
      const rest = hand.filter((x) => x !== id);
      rest.splice(Math.min(before > hand.indexOf(id) ? before - 1 : before, rest.length), 0, id);
      commit(rest, null);
      return;
    }
    const target = handEl.querySelector<HTMLElement>(`.db-slot[data-slot="${slotIndex}"]`);
    const out = target?.querySelector<HTMLElement>('.db-card')?.dataset.id as EditionId | undefined;
    if (out === 'base') return nudge(target!.querySelector('.db-card'));
    // An empty slot takes the card at that place; a full one gives up its card to the deck.
    const outRect = out ? picOf(target!.querySelector('.db-card'))!.getBoundingClientRect() : null;
    commit(out ? placeAt(hand, id, before) : addToHand(hand, id, before), null);
    fly(id, from, slotRect(id));
    if (out && outRect) fly(out, outRect, picOf(gridCards.get(out))!.getBoundingClientRect());
  }

  const slotRect = (id: EditionId) => (picOf(handEl.querySelector(`.db-card[data-id="${id}"]`)) ?? handEl).getBoundingClientRect();

  /** A card flies from one place to the other (a copy of it), while its new place waits under it. */
  function fly(id: EditionId, from: DOMRect, to: DOMRect) {
    const src = cache.get(id);
    if (reduced || !src || !from.width || !to.width) return;
    const ghost = copyOf(src);
    ghost.className = 'db-fly';
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(ghost);
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const k = to.width / from.width;
    const landing = [...root.querySelectorAll<HTMLElement>(`.db-card[data-id="${id}"] .db-pic`)].find((el) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.left - to.left) < 2 && Math.abs(r.top - to.top) < 2;
    });
    landing?.style.setProperty('opacity', '0');
    ghost
      .animate(
        [
          { transform: 'translate(0, 0) scale(1) rotate(0)' },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${((1 + k) / 2) * 1.08}) rotate(${dx > 0 ? 6 : -6}deg)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0)` },
        ],
        { duration: 340, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
      )
      .finished.then(() => {
        ghost.remove();
        landing?.style.removeProperty('opacity');
      });
  }

  function nudge(el: Element | null) {
    if (!el || reduced) return;
    (el as HTMLElement).animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }

  // ---------- Dragging ----------

  /** Set while a drag is on, so the click that follows the drop is ignored. */
  let dragged = false;
  function startDrag(e: PointerEvent, id: EditionId, source: 'grid' | 'hand') {
    if (e.button !== 0 || id === 'base') return;
    const card = e.currentTarget as HTMLElement;
    const start = { x: e.clientX, y: e.clientY };
    let ghost: HTMLCanvasElement | null = null;
    let over: HTMLElement | null = null;
    dragged = false;
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 10) return;
        const src = cache.get(id);
        if (!src) return;
        dragged = true;
        const r = picOf(card)!.getBoundingClientRect();
        ghost = copyOf(src);
        ghost.className = 'db-fly is-drag';
        Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px` });
        document.body.append(ghost);
        card.classList.add('is-dragging');
        root.classList.add('is-dragging');
      }
      ghost.style.left = `${ev.clientX - ghost.offsetWidth / 2}px`;
      ghost.style.top = `${ev.clientY - ghost.offsetHeight / 2}px`;
      const hit = document.elementsFromPoint(ev.clientX, ev.clientY);
      const slot = hit.find((el) => el instanceof HTMLElement && el.classList.contains('db-slot')) as HTMLElement | undefined;
      const toGrid = source === 'hand' && hit.includes(gridEl);
      over?.classList.remove('is-over');
      over = slot ?? (toGrid ? gridEl : null);
      over?.classList.add('is-over');
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      card.classList.remove('is-dragging');
      root.classList.remove('is-dragging');
      over?.classList.remove('is-over');
      if (!ghost) return;
      const from = ghost.getBoundingClientRect();
      ghost.remove();
      if (over?.classList.contains('db-slot')) dropOnSlot(id, Number(over.dataset.slot), from, source);
      else if (over === gridEl && source === 'hand') takeOut(id);
      // The click event fires after pointerup; clear the flag after it.
      setTimeout(() => (dragged = false), 0);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  // ---------- Buttons, keys, closing ----------

  $('.db-undo').addEventListener('click', () => {
    const prev = history.pop();
    if (!prev) return;
    hand = prev.hand;
    gap = prev.gap;
    outAt = null;
    render();
    o.onChange(hand);
  });
  $('.db-reset').addEventListener('click', () => {
    outAt = null;
    commit([...o.starters], null);
  });
  root.querySelectorAll<HTMLElement>('.db-tab').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab as typeof tab;
      render();
    }),
  );
  const close = () => {
    root.classList.remove('is-in');
    removeEventListener('keydown', onKey, true);
    setTimeout(() => root.remove(), 180);
    o.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      $<HTMLButtonElement>('.db-undo').click();
    }
  };
  addEventListener('keydown', onKey, true);
  $('.dv-x').addEventListener('click', close);
  $('.db-done').addEventListener('click', close);
  root.addEventListener('pointerdown', (e) => e.target === root && close());
  document.body.append(root);
  render();
  requestAnimationFrame(() => root.classList.add('is-in'));
  root.querySelector<HTMLElement>('.db-grid .db-card:not([disabled])')?.focus({ preventScroll: true });

  // ---------- The mini cards ----------

  /** Puts a copy of each cached picture into every empty place for it; draws missing ones one per frame. */
  function paint() {
    for (const el of root.querySelectorAll<HTMLElement>('.db-pic:empty')) {
      const src = cache.get(el.dataset.id as EditionId);
      if (src) el.append(copyOf(src));
    }
    if (drawing || !root.querySelector('.db-pic:empty')) return;
    drawing = true;
    const ids = o.owned.flatMap((g) => g.finishes).filter((id) => !cache.has(id));
    const packs = [...new Set(ids.map((id) => packOf(id)?.id).filter((p): p is PackId => !!p))];
    void Promise.all(packs.map((p) => loadPack(p))).then(() => {
      if (!renderer) {
        rendererCanvas = document.createElement('canvas');
        renderer = new CardRenderer(rendererCanvas, { preserve: true, settled: true });
      }
      renderer.setFace(o.face, o.mask);
      // The hand's cards first, then the rest in grid order.
      const order = [...new Set([...hand, ...ids])].filter((id) => !cache.has(id));
      const step = () => {
        const id = order.shift();
        if (!id || !root.isConnected) {
          drawing = false;
          return;
        }
        cache.set(id, miniCard(id, o));
        for (const el of root.querySelectorAll<HTMLElement>(`.db-pic[data-id="${id}"]:empty`)) el.append(copyOf(cache.get(id)!));
        requestAnimationFrame(step);
      };
      step();
    });
  }
}
