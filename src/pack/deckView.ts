// View deck: every finish in the deck, grouped pack by pack, as small still thumbnails of the
// person's own card in each finish. Loaded, and the thumbnails drawn, only when it is opened.
// Choosing one draws it into the hand. See docs/packs.md.

import './deckView.css';
import { CardRenderer } from '../gl/renderers';
import { loadPack } from '../gl/finishes/registry';
import { editionById, type EditionId } from '../editions';
import type { Pack } from '../packs';
import type { Dict } from '../i18n';
import { tuneGl, type Tune } from '../tune/model';

export interface DeckViewOptions {
  dict: Dict;
  /** The opened packs, in pack order. */
  packs: Pack[];
  drawn: EditionId | null;
  face: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  tune: Tune;
  onPick: (id: EditionId) => void;
  /** The empty deck's way to the pack shop. */
  onShop: () => void;
  onClose: () => void;
}

const TW = 120;
const TH = 168;

export function viewDeck(o: DeckViewOptions) {
  const t = o.dict.pack;
  const total = o.packs.reduce((n, p) => n + p.finishes.length, 0);
  const root = document.createElement('div');
  root.className = 'dv';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t.deckTitle);
  root.innerHTML = `
    <div class="dv-panel">
      <header class="dv-head"><b>${t.deckTitle}</b><small>${t.deckSub.replace('{n}', String(total))}</small>
        <button class="dv-x" type="button" aria-label="${t.close2}" title="${t.close2}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2h2v2h2V5h2V3h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2V9H7v2H5v2H3v-2h2V9h2V7H5V5H3z"/></svg></button>
      </header>
      <div class="dv-body"></div>
    </div>`;
  const body = root.querySelector<HTMLElement>('.dv-body')!;
  const thumbs = new Map<EditionId, HTMLCanvasElement>();

  if (!total) {
    body.innerHTML = `<p class="dv-empty">${t.deckEmpty}</p><button class="dv-shop" type="button">${t.deckShop}</button>`;
    body.querySelector('.dv-shop')!.addEventListener('click', () => {
      close();
      o.onShop();
    });
  }
  for (const p of o.packs) {
    const group = document.createElement('section');
    group.className = 'dv-group';
    group.style.setProperty('--c', p.colors[2]);
    group.style.setProperty('--b', p.colors[1]);
    group.innerHTML = `<h3><i aria-hidden="true"></i>${t.title.replace('{name}', t.name[p.id])}</h3><div class="dv-row"></div>`;
    const row = group.querySelector('.dv-row')!;
    for (const id of p.finishes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dv-card';
      b.dataset.id = id;
      if (id === o.drawn) {
        b.classList.add('is-drawn');
        b.setAttribute('aria-current', 'true');
      }
      const c = document.createElement('canvas');
      c.width = TW;
      c.height = TH;
      thumbs.set(id, c);
      b.append(c);
      b.insertAdjacentHTML('beforeend', `<b>${o.dict.edition[id]}</b>${id === o.drawn ? `<span class="dv-tag">${t.drawnTag}</span>` : ''}`);
      b.title = o.dict.look[id];
      b.addEventListener('click', () => {
        close();
        o.onPick(id);
      });
      row.append(b);
    }
    body.append(group);
  }

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
    }
  };
  addEventListener('keydown', onKey, true);
  root.querySelector('.dv-x')!.addEventListener('click', close);
  root.addEventListener('pointerdown', (e) => e.target === root && close());
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('is-in'));
  (root.querySelector<HTMLElement>('.dv-card.is-drawn') ?? root.querySelector<HTMLElement>('.dv-card, .dv-shop, .dv-x'))?.focus();

  // The thumbnails: one throwaway renderer draws each finish once, still, then lets the context go.
  if (!total) return;
  void Promise.all(o.packs.map((p) => loadPack(p.id))).then(() => {
    const canvas = document.createElement('canvas');
    const r = new CardRenderer(canvas, { preserve: true, settled: true });
    r.tune = tuneGl(o.tune);
    r.setFace(o.face, o.mask);
    r.resize(TW, TH, 1);
    for (const [id, c] of thumbs) {
      r.begin();
      r.drawCard({ cx: TW / 2, cy: TH / 2, w: TW - 2, h: TH - 3, rx: 0, ry: 0, rz: 0, scale: 1, edition: editionById(id).shader, intensity: 1, pixel: 0, tilt: [0.35, -0.25], light: [0.32, 0.22], alpha: 1, flash: 0, shadow: null, plate: false }, 1.7);
      c.getContext('2d')!.drawImage(canvas, 0, 0);
      c.classList.add('is-ready');
    }
    r.gl.getExtension('WEBGL_lose_context')?.loseContext();
  });
}
