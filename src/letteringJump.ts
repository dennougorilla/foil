// The card's lettering as the first view needs it: the print the face is painted with, and the
// shortcut under the name tag that shows the current print and jumps to its controls. The controls
// themselves (letteringPanel.ts) load with Fine-tune.

import './letteringJump.css';
import type { State, Store } from './state';
import type { Dict } from './i18n';
import { rarityById, type FrameId } from './editions';
import { sfx } from './audio';
import { customFrame, isDark, isHex } from './palette';
import { foilRamp, letterFill, normalizeLettering, setLettering, STYLE_CONTROLS } from './lettering';

/** Frame paper and ink, mirrored from card/face so the chips sit on the card's own stock. */
export function stock(
  frame: FrameId,
  rarity: Parameters<typeof rarityById>[0],
  frameColor: string,
): { paper: string; solid: string; ink: string } {
  // A custom frame colour wins over the preset, as on the card itself.
  if (isHex(frameColor)) {
    const f = customFrame(frameColor);
    return { paper: f.fill, solid: f.fill, ink: f.ink };
  }
  switch (frame) {
    case 'ink':
      return { paper: '#252c30', solid: '#252c30', ink: '#f3eee2' };
    case 'gilt':
      return { paper: 'linear-gradient(135deg,#f7dc8b,#d9a441 45%,#fbe7a6 60%,#b97f26)', solid: '#e2b65a', ink: '#3b2408' };
    case 'rarity':
      return { paper: rarityById(rarity).color, solid: rarityById(rarity).color, ink: '#ffffff' };
    default:
      return { paper: '#f3eee2', solid: '#f3eee2', ink: '#262d31' };
  }
}

/** Dresses a host of print chips in the card's current colours, on its current frame. */
export function chipLook(host: HTMLElement, s: State): void {
  const l = s.text;
  const { paper, solid, ink: frameInk } = stock(s.frame, s.rarity, s.frameColor);
  const [lo, hi] = foilRamp(l);
  host.style.setProperty('--lt-paper', paper);
  host.style.setProperty('--lt-stock', solid);
  host.style.setProperty('--lt-ink', l.ink === 'auto' || l.ink === 'none' ? frameInk : l.ink);
  host.style.setProperty('--lt-lo', lo);
  host.style.setProperty('--lt-hi', hi);
  host.classList.toggle('is-blind', l.ink === 'none' && STYLE_CONTROLS[l.style].blind);
  host.classList.toggle('is-rainbow', l.foil === 'rainbow');
  host.classList.toggle('is-dark-stock', isHex(s.frameColor) ? isDark(s.frameColor) : s.frame === 'ink');
}

/** The first letter of the name, which the chips print. */
export const chipGlyph = (name: string) => Array.from(name.trim())[0]?.toLocaleUpperCase() || 'A';

interface Options {
  store: Store;
  dict: () => Dict;
  /** The name as printed on the card (typed or fallback). */
  name: () => string;
  /** Repaint the card face; called only when the printed colour changes. */
  repaint: () => void;
  /** Opens the Lettering controls and brings them into view. */
  open: () => void;
  /** The card's name tag; the shortcut goes right under it. */
  tag?: HTMLElement;
}

export function mountLetteringJump(o: Options): void {
  const { store } = o;
  const start = normalizeLettering(store.get().text);
  setLettering(start);
  if (start !== store.get().text) store.set({ text: start });

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  };
  // Shortcut on the name tag: shows the current lettering and jumps to the controls.
  const jump = el('button', 'lt-jump');
  jump.type = 'button';
  const jumpChip = el('span', 'lt-chip');
  jumpChip.setAttribute('aria-hidden', 'true');
  jumpChip.append(document.createElement('b'));
  const jumpText = el('span', 'lt-jump-text');
  jumpText.setAttribute('aria-hidden', 'true');
  jumpText.append(document.createElement('small'), document.createElement('b'));
  const chevron = el('span', 'lt-jump-arrow');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  jump.append(jumpChip, jumpText, chevron);
  o.tag?.after(jump);
  jump.addEventListener('click', () => {
    sfx.tick();
    o.open();
  });

  /** The print the face shows: its style and the colour it prints in (the face repaints when it changes). */
  const fillOf = (s: State) => `${s.text.style}|${letterFill(s.text, stock(s.frame, s.rarity, s.frameColor).ink)}`;
  let lastFill = fillOf(store.get());

  function sync() {
    const s = store.get();
    const l = s.text;
    const t = o.dict().lt;
    chipLook(jump, s);
    const label = t.jump.replace('{style}', t.style[l.style].replace('​', ''));
    jump.setAttribute('aria-label', label);
    jump.title = label;
    jump.dataset.style = l.style;
    jumpText.querySelector('small')!.textContent = t.title;
    jumpText.querySelector('b')!.textContent = t.style[l.style].replace('​', '');
    const g = jumpChip.querySelector('b')!;
    g.textContent = g.dataset.g = chipGlyph(o.name());
  }

  sync();
  store.on((s, changed) => {
    if (changed.has('text')) {
      setLettering(s.text);
      // Depth and gloss only move uniforms; repaint the face only when the printed colour changes.
      const fill = fillOf(s);
      if (fill !== lastFill) {
        lastFill = fill;
        o.repaint();
      }
      return sync();
    }
    if (['lang', 'frame', 'frameColor', 'rarity', 'name', 'sample'].some((k) => changed.has(k as keyof State))) {
      lastFill = fillOf(s);
      sync();
    }
  });
}
