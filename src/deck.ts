// The deck beside the hand, Balatro-style: a pile of face-down card backs (thicker with each
// finish in it, a couple of steps at most) with its count, and a small pack beside it that opens
// the pack shop. The hand is always seven; the deck holds every owned finish not in it. See docs/packs.md.

import { sfx } from './audio';
import type { Dict } from './i18n';
import type { EditionId } from './editions';
import { deckOf, shelf } from './packs';
import { packs } from './packStore';

export interface DeckOptions {
  host: HTMLElement;
  /** The hand now: the deck holds every owned finish not in it. */
  hand: () => EditionId[];
  dict: () => Dict;
  /** The deck was pressed: show what is in it. */
  onView: () => void;
  /** The pack button was pressed: open the shop. */
  onShop: () => void;
  /** Hovering the pack button: fetch the shop's code before it is asked for. */
  onPrefetch: () => void;
}

/** At most this many backs show in the pile: a couple of steps of thickness; the number says how many. */
const MAX_LAYERS = 3;

export function mountDeck(o: DeckOptions) {
  const { host } = o;
  host.innerHTML = `
    <button class="deck" id="deckBtn" type="button"><span class="deck-pile" aria-hidden="true"></span><b class="deck-count"></b><span class="deck-cap" aria-hidden="true"></span></button>
    <button class="deck-packs" id="packsBtn" type="button"><i class="deck-pack" aria-hidden="true"></i><small></small><span class="deck-cap" aria-hidden="true"></span></button>`;
  const deckBtn = host.querySelector<HTMLButtonElement>('.deck')!;
  const packsBtn = host.querySelector<HTMLButtonElement>('.deck-packs')!;
  deckBtn.addEventListener('click', () => {
    sfx.tick();
    o.onView();
  });
  packsBtn.addEventListener('click', () => o.onShop());
  for (const ev of ['pointerenter', 'focus']) packsBtn.addEventListener(ev, () => o.onPrefetch(), { once: true });

  /** How many finishes the deck holds. */
  const count = () => deckOf(o.hand(), packs.get()).reduce((n, g) => n + g.finishes.length, 0);

  const render = () => {
    const t = o.dict().pack;
    const n = count();
    const sealed = shelf(packs.get()).filter((p) => !packs.isOpened(p.id)).length;
    const pile = deckBtn.querySelector('.deck-pile')!;
    pile.innerHTML = Array.from({ length: Math.max(1, Math.min(MAX_LAYERS, n)) }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    deckBtn.dataset.empty = String(n === 0);
    deckBtn.querySelector('.deck-count')!.textContent = String(n);
    deckBtn.querySelector('.deck-cap')!.textContent = t.deckShort;
    packsBtn.querySelector('.deck-cap')!.textContent = t.packsShort;
    deckBtn.setAttribute('aria-label', t.deckLabel.replace('{n}', String(n)));
    deckBtn.title = t.deckLabel.replace('{n}', String(n));
    packsBtn.dataset.sealed = String(sealed);
    packsBtn.querySelector('small')!.textContent = sealed ? String(sealed) : '';
    const label = sealed ? t.packsBtn.replace('{n}', String(sealed)) : t.packsBtnAll;
    packsBtn.setAttribute('aria-label', label);
    packsBtn.title = label;
  };

  packs.on(render);
  render();
  return {
    render,
    /** Where the deck sits on screen, for cards flying into it. */
    rect: () => deckBtn.getBoundingClientRect(),
    /** The deck takes cards in: a bump, and "+n" floating up from it. */
    bump(n = 0) {
      deckBtn.classList.remove('is-bump');
      void deckBtn.offsetWidth;
      deckBtn.classList.add('is-bump');
      if (!n) return;
      const plus = document.createElement('span');
      plus.className = 'deck-plus';
      plus.textContent = `+${n}`;
      deckBtn.append(plus);
      setTimeout(() => plus.remove(), 2000);
    },
    focusShop: () => packsBtn.focus(),
    focusDeck: () => deckBtn.focus(),
  };
}
