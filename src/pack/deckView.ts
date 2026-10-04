// View deck: the cards in the deck, grouped, each the same mini card as in the hand (the person's
// picture in that finish). Pick one, then pick the hand card to swap it with. The mini cards are
// still pictures drawn one by one with a single WebGL context, cached until the face, frame or light
// changes (`key`). Loaded only when the deck is opened. See docs/packs.md.

import './deckView.css';
import { CardRenderer } from '../gl/renderers';
import { loadPack } from '../gl/finishes/registry';
import { editionById, type EditionId } from '../editions';
import { packById, packOf, type PackId } from '../packs';
import type { Dict } from '../i18n';
import { tuneGl, type Tune } from '../tune/model';

export interface DeckViewOptions {
  dict: Dict;
  /** The deck's cards, grouped: the starters swapped out, then pack by pack. */
  deck: { group: PackId | 'open'; finishes: EditionId[] }[];
  hand: EditionId[];
  /** Names the face, frame and light the mini cards show; cached cards are remade when it changes. */
  key: string;
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  tune: Tune;
  onSwap: (out: EditionId, into: EditionId) => void;
  /** The empty deck's way to the pack shop. */
  onShop: () => void;
  onClose: () => void;
}

/** The mini card's size: the hand's card at its usual size. */
const TW = 108;
const TH = 151;

/** One renderer for every View deck, and the pictures it has made. */
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
  const out = document.createElement('canvas');
  out.width = rendererCanvas!.width;
  out.height = rendererCanvas!.height;
  out.getContext('2d')!.drawImage(rendererCanvas!, 0, 0);
  return out;
}

export function viewDeck(o: DeckViewOptions) {
  const t = o.dict.pack;
  const total = o.deck.reduce((n, g) => n + g.finishes.length, 0);
  if (o.key !== cacheKey) {
    cache.clear();
    cacheKey = o.key;
  }
  const root = document.createElement('div');
  root.className = 'dv';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t.deckTitle);
  root.innerHTML = `
    <div class="dv-panel">
      <header class="dv-head"><b>${t.deckTitle}</b><small class="dv-sub">${t.deckSub.replace('{n}', String(total))}</small>
        <button class="dv-x" type="button" aria-label="${t.close2}" title="${t.close2}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2h2v2h2V5h2V3h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2V9H7v2H5v2H3v-2h2V9h2V7H5V5H3z"/></svg></button>
      </header>
      <div class="dv-body"></div>
      <footer class="dv-hand" hidden><p class="dv-ask"></p><div class="dv-row"></div></footer>
    </div>`;
  const body = root.querySelector<HTMLElement>('.dv-body')!;
  const handBar = root.querySelector<HTMLElement>('.dv-hand')!;
  /** Where each mini card goes once it is drawn. */
  const slots = new Map<EditionId, HTMLElement[]>();
  let chosen: EditionId | null = null;

  const card = (id: EditionId, onClick: () => void, extra = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `dv-card ${extra}`;
    b.dataset.id = id;
    b.innerHTML = `<span class="dv-pic"></span><b>${o.dict.edition[id]}</b>`;
    b.title = o.dict.look[id];
    b.addEventListener('click', onClick);
    slots.set(id, [...(slots.get(id) ?? []), b.querySelector<HTMLElement>('.dv-pic')!]);
    return b;
  };

  if (!total) {
    body.innerHTML = `<p class="dv-empty">${t.deckEmpty}</p><button class="dv-shop" type="button">${t.deckShop}</button>`;
    body.querySelector('.dv-shop')!.addEventListener('click', () => {
      close();
      o.onShop();
    });
  }
  for (const g of o.deck) {
    const group = document.createElement('section');
    group.className = 'dv-group';
    const colors = g.group === 'open' ? ['#9fb0b3', '#5b6d73'] : [packById(g.group).colors[2], packById(g.group).colors[1]];
    group.style.setProperty('--c', colors[0]);
    group.style.setProperty('--b', colors[1]);
    const title = g.group === 'open' ? t.deckStarters : t.title.replace('{name}', t.name[g.group]);
    group.innerHTML = `<h3><i aria-hidden="true"></i>${title}</h3><div class="dv-row"></div>`;
    const row = group.querySelector('.dv-row')!;
    for (const id of g.finishes) row.append(card(id, () => choose(id)));
    body.append(group);
  }

  /** A deck card is picked: the hand shows below, to pick the card it swaps with. */
  function choose(id: EditionId) {
    chosen = id;
    root.querySelectorAll('.dv-body .dv-card').forEach((b) => b.classList.toggle('is-chosen', (b as HTMLElement).dataset.id === id));
    root.querySelector('.dv-ask')!.textContent = t.deckAsk.replace('{name}', o.dict.edition[id]);
    const row = handBar.querySelector('.dv-row')!;
    if (!row.childElementCount)
      for (const h of o.hand) {
        const b = card(h, () => swap(h), 'is-hand');
        if (h === 'base') {
          b.disabled = true;
          b.title = t.deckBaseStays;
        }
        row.append(b);
      }
    handBar.hidden = false;
    fill();
    (handBar.querySelector<HTMLElement>('.dv-card:not([disabled])') ?? handBar).focus();
    handBar.scrollIntoView({ block: 'nearest' });
  }

  function swap(out: EditionId) {
    if (!chosen) return;
    const into = chosen;
    close();
    o.onSwap(out, into);
  }

  const close = () => {
    root.classList.remove('is-in');
    removeEventListener('keydown', onKey, true);
    setTimeout(() => root.remove(), 180);
    o.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    // Escape steps back from choosing the hand card, then closes.
    if (chosen) {
      chosen = null;
      handBar.hidden = true;
      root.querySelectorAll('.dv-card.is-chosen').forEach((b) => b.classList.remove('is-chosen'));
      root.querySelector<HTMLElement>('.dv-body .dv-card')?.focus();
    } else close();
  };
  addEventListener('keydown', onKey, true);
  root.querySelector('.dv-x')!.addEventListener('click', close);
  root.addEventListener('pointerdown', (e) => e.target === root && close());
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('is-in'));
  root.querySelector<HTMLElement>('.dv-body .dv-card, .dv-shop, .dv-x')?.focus();

  /** Draws the mini cards still missing, one per frame, from the cache when it has them. */
  let drawing = false;
  function fill() {
    if (drawing) return;
    drawing = true;
    const ids = [...slots.keys()];
    const packs = [...new Set(ids.map((id) => packOf(id)?.id).filter((p): p is PackId => !!p))];
    void Promise.all(packs.map((p) => loadPack(p))).then(() => {
      if (!renderer) {
        rendererCanvas = document.createElement('canvas');
        renderer = new CardRenderer(rendererCanvas, { preserve: true, settled: true });
      }
      // The face goes up once per run; then one mini card per frame.
      renderer.setFace(o.face, o.mask);
      const step = () => {
        const id = ids.find((i) => slots.get(i)!.some((el) => !el.firstChild));
        if (!id || !root.isConnected) {
          drawing = false;
          // The hand may have been shown meanwhile: pick up its cards too.
          if (root.isConnected && [...slots.values()].flat().some((el) => !el.firstChild)) fill();
          return;
        }
        if (!cache.has(id)) cache.set(id, miniCard(id, o));
        for (const el of slots.get(id)!) {
          if (el.firstChild) continue;
          const src = cache.get(id)!;
          const c = document.createElement('canvas');
          c.width = src.width;
          c.height = src.height;
          c.getContext('2d')!.drawImage(src, 0, 0);
          el.append(c);
        }
        requestAnimationFrame(step);
      };
      step();
    });
  }
  if (total) fill();
}
