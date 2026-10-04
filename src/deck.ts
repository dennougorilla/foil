// The deck beside the hand, Balatro-style: a pile of face-down card backs (thicker with each
// finish in it) with its count, and a small pack beside it that opens the pack shop. The hand
// itself stays at seven plus the drawn card. See docs/packs.md.

import { sfx } from './audio';
import type { Dict } from './i18n';
import { deckOf, shelf } from './packs';
import { packs } from './packStore';

export interface DeckOptions {
  host: HTMLElement;
  dict: () => Dict;
  /** The deck was pressed: show what is in it. */
  onView: () => void;
  /** The pack button was pressed: open the shop. */
  onShop: () => void;
  /** Hovering the pack button: fetch the shop's code before it is asked for. */
  onPrefetch: () => void;
}

/** At most this many backs show in the pile; past it the pile stops growing. */
const MAX_LAYERS = 12;

export function mountDeck(o: DeckOptions) {
  const { host } = o;
  host.innerHTML = `
    <button class="deck" id="deckBtn" type="button"><span class="deck-pile" aria-hidden="true"></span><b class="deck-count"></b></button>
    <button class="deck-packs" id="packsBtn" type="button"><i class="deck-pack" aria-hidden="true"></i><small></small></button>`;
  const deckBtn = host.querySelector<HTMLButtonElement>('.deck')!;
  const packsBtn = host.querySelector<HTMLButtonElement>('.deck-packs')!;
  deckBtn.addEventListener('click', () => {
    sfx.tick();
    o.onView();
  });
  packsBtn.addEventListener('click', () => o.onShop());
  for (const ev of ['pointerenter', 'focus']) packsBtn.addEventListener(ev, () => o.onPrefetch(), { once: true });

  /** How many finishes the deck holds. */
  const count = () => deckOf(packs.get()).reduce((n, p) => n + p.finishes.length, 0);

  const render = () => {
    const t = o.dict().pack;
    const n = count();
    const sealed = shelf(packs.get()).filter((p) => !packs.isOpened(p.id)).length;
    const pile = deckBtn.querySelector('.deck-pile')!;
    pile.innerHTML = Array.from({ length: Math.max(1, Math.min(MAX_LAYERS, n)) }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    deckBtn.dataset.empty = String(n === 0);
    deckBtn.querySelector('.deck-count')!.textContent = String(n);
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
    /** The deck takes cards in: a bump. */
    bump() {
      deckBtn.classList.remove('is-bump');
      void deckBtn.offsetWidth;
      deckBtn.classList.add('is-bump');
    },
    focusShop: () => packsBtn.focus(),
    focusDeck: () => deckBtn.focus(),
  };
}
