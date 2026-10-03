// Panel controls for lettering finishes: five live preview chips to pick how the
// name is printed, then only the tuning that style actually has.

import './lettering.css';
import type { Store } from './state';
import type { Dict } from './i18n';
import type { FrameId } from './editions';
import { rarityById } from './editions';
import { sfx } from './audio';
import {
  DEFAULT_LETTERING,
  FOIL_RAMP,
  FOIL_TONES,
  LETTER_STYLES,
  STYLE_CONTROLS,
  foilRamp,
  letterFill,
  normalizeLettering,
  setLettering,
  type LetterInk,
  type Lettering,
} from './lettering';

interface Options {
  store: Store;
  /** The section the block is appended to. */
  host: HTMLElement;
  dict: () => Dict;
  /** The name as printed on the card (typed or fallback). */
  name: () => string;
  /** Repaint the card face; called only when the printed colour changes. */
  repaint: () => void;
  /** A small bounce on the card when a style is picked. */
  onPick: () => void;
}

/** Named inks, in swatch order. 'auto' and 'none' sit in front of these. */
const INKS = { white: '#f7f3ea', black: '#1b1f22', red: '#c8322a', navy: '#1f3b7a' } as const;
type InkKey = 'auto' | 'none' | keyof typeof INKS | 'custom';
const INK_KEYS: InkKey[] = ['auto', 'none', 'white', 'black', 'red', 'navy', 'custom'];

/** Frame paper and ink, mirrored from card/face so the chips sit on the card's own stock. */
function stock(frame: FrameId, rarity: Parameters<typeof rarityById>[0]): { paper: string; ink: string } {
  switch (frame) {
    case 'ink':
      return { paper: '#252c30', ink: '#f3eee2' };
    case 'gilt':
      return { paper: 'linear-gradient(135deg,#f7dc8b,#d9a441 45%,#fbe7a6 60%,#b97f26)', ink: '#3b2408' };
    case 'rarity':
      return { paper: rarityById(rarity).color, ink: '#ffffff' };
    default:
      return { paper: '#f3eee2', ink: '#262d31' };
  }
}

const inkKeyOf = (ink: LetterInk): InkKey =>
  ink === 'auto' || ink === 'none' ? ink : ((Object.keys(INKS) as (keyof typeof INKS)[]).find((k) => INKS[k] === ink) ?? 'custom');

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

function radio(btn: HTMLElement, on: boolean) {
  btn.setAttribute('aria-checked', String(on));
  btn.tabIndex = on ? 0 : -1;
}

/** Arrow keys move and select within a radiogroup, like the rest of the panel. */
function roving(group: HTMLElement) {
  group.addEventListener('keydown', (e) => {
    const items = [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')].filter((b) => !b.hidden);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    items[n].click();
    items[n].focus();
  });
}

export function mountLettering(o: Options): void {
  const { store } = o;
  const start = normalizeLettering(store.get().text);
  setLettering(start);
  if (start !== store.get().text) store.set({ text: start });

  const set = (patch: Partial<Lettering>) => store.set({ text: { ...store.get().text, ...patch } });

  // ---------- DOM ----------
  const root = el('div', 'lt');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-labelledby', 'ltTitle');

  const head = el('div', 'lt-head');
  const title = el('span', 'field-label');
  title.id = 'ltTitle';
  const target = el('span', 'lt-target');
  const reset = el('button', 'link lt-reset');
  reset.type = 'button';
  head.append(title, target, reset);

  const styles = el('div', 'lt-styles');
  styles.setAttribute('role', 'radiogroup');
  const styleBtns = LETTER_STYLES.map((id) => {
    const b = el('button', 'lt-style');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.style = id;
    const chip = el('span', 'lt-chip');
    chip.setAttribute('aria-hidden', 'true');
    chip.append(el('b'));
    b.append(chip, el('span', 'lt-style-name'));
    b.addEventListener('click', () => {
      if (store.get().text.style === id) return;
      sfx.tick();
      set({ style: id });
      o.onPick();
    });
    styles.append(b);
    return b;
  });

  const help = el('p', 'hint lt-help');
  help.id = 'ltHelp';
  help.setAttribute('aria-live', 'polite');
  styles.setAttribute('aria-describedby', 'ltHelp');

  // Swatch rows
  const swatchRow = (id: string) => {
    const row = el('div', 'lt-row');
    const label = el('span', 'field-label');
    label.id = id;
    const group = el('div', 'lt-swatches');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', id);
    row.append(label, group);
    roving(group);
    return { row, label, group };
  };

  const picker = (onInput: (hex: string) => void) => {
    const input = el('input', 'lt-picker');
    input.type = 'color';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.addEventListener('input', () => onInput(input.value));
    return input;
  };

  const ink = swatchRow('ltInkLabel');
  const inkPicker = picker((hex) => set({ ink: hex as LetterInk }));
  const inkBtns = INK_KEYS.map((k) => {
    const b = el('button', `lt-swatch lt-ink-${k}`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    if (k in INKS) b.style.setProperty('--sw', INKS[k as keyof typeof INKS]);
    b.addEventListener('click', () => {
      sfx.tick();
      if (k === 'custom') {
        const cur = store.get().text.ink;
        inkPicker.value = cur.startsWith('#') ? cur : '#e0a030';
        set({ ink: inkPicker.value as LetterInk });
        inkPicker.click();
      } else set({ ink: k === 'auto' || k === 'none' ? k : INKS[k] });
    });
    ink.group.append(b);
    return b;
  });
  ink.group.append(inkPicker);

  const foil = swatchRow('ltFoilLabel');
  const foilPicker = picker((hex) => set({ foil: 'custom', foilColor: hex }));
  const foilBtns = FOIL_TONES.map((k) => {
    const b = el('button', `lt-swatch lt-foil lt-foil-${k}`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    if (k !== 'custom' && k !== 'rainbow') {
      const [lo, hi] = FOIL_RAMP[k];
      b.style.setProperty('--lo', lo);
      b.style.setProperty('--hi', hi);
    }
    b.addEventListener('click', () => {
      sfx.tick();
      set({ foil: k });
      if (k === 'custom') {
        foilPicker.value = store.get().text.foilColor;
        foilPicker.click();
      }
    });
    foil.group.append(b);
    return b;
  });
  foil.group.append(foilPicker);

  const slider = (id: string, key: 'depth' | 'gloss') => {
    const row = el('div', 'row lt-slider');
    const label = el('label', 'field-label');
    label.htmlFor = id;
    const input = el('input');
    input.type = 'range';
    input.id = id;
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    const out = el('output');
    out.htmlFor.add(id);
    input.addEventListener('input', () => set({ [key]: +input.value }));
    row.append(label, input, out);
    return { row, label, input, out };
  };
  const depth = slider('ltDepth', 'depth');
  const gloss = slider('ltGloss', 'gloss');

  const tilt = el('p', 'hint lt-tilt');

  const detail = el('div', 'lt-detail');
  detail.append(foil.row, ink.row, depth.row, gloss.row, tilt);
  root.append(head, styles, help, detail);
  o.host.append(root);
  roving(styles);

  // Pointer over the chips moves their light together, like tilting the card.
  styles.addEventListener('pointermove', (e) => {
    const r = styles.getBoundingClientRect();
    styles.style.setProperty('--mx', ((e.clientX - r.left) / r.width).toFixed(3));
    styles.style.setProperty('--my', ((e.clientY - r.top) / r.height).toFixed(3));
  });
  styles.addEventListener('pointerleave', () => {
    styles.style.removeProperty('--mx');
    styles.style.removeProperty('--my');
  });

  reset.addEventListener('click', () => {
    sfx.tick();
    set({ ...DEFAULT_LETTERING, style: store.get().text.style });
  });

  // ---------- Sync ----------
  const fill = (rng: HTMLInputElement) =>
    rng.style.setProperty('--fill', `${((+rng.value - +rng.min) / (+rng.max - +rng.min)) * 100}%`);

  function labels() {
    const t = o.dict().lt;
    title.textContent = t.title;
    target.textContent = t.target;
    reset.textContent = t.reset;
    styles.setAttribute('aria-label', t.styles);
    styleBtns.forEach((b) => {
      const id = b.dataset.style as Lettering['style'];
      b.querySelector('.lt-style-name')!.textContent = t.style[id];
    });
    ink.label.textContent = t.ink;
    foil.label.textContent = t.foil;
    gloss.label.textContent = t.gloss;
    tilt.textContent = t.tilt;
    INK_KEYS.forEach((k, i) => {
      inkBtns[i].setAttribute('aria-label', t.inkName[k]);
      inkBtns[i].title = t.inkName[k];
    });
    FOIL_TONES.forEach((k, i) => {
      foilBtns[i].setAttribute('aria-label', t.foilName[k]);
      foilBtns[i].title = t.foilName[k];
    });
  }

  function sync() {
    const s = store.get();
    const l = s.text;
    const t = o.dict().lt;
    const c = STYLE_CONTROLS[l.style];
    const { paper, ink: frameInk } = stock(s.frame, s.rarity);
    const glyph = Array.from(o.name().trim())[0]?.toLocaleUpperCase() || 'A';
    const [lo, hi] = foilRamp(l);
    const shown = letterFill(l, frameInk);
    // Chips preview each style in your current colours on your current frame.
    root.style.setProperty('--lt-paper', paper);
    root.style.setProperty('--lt-ink', l.ink === 'auto' || l.ink === 'none' ? frameInk : l.ink);
    root.style.setProperty('--lt-lo', lo);
    root.style.setProperty('--lt-hi', hi);
    root.classList.toggle('is-dark-stock', s.frame === 'ink');
    root.classList.toggle('is-blind', l.ink === 'none');
    root.classList.toggle('is-rainbow', l.foil === 'rainbow');
    styleBtns.forEach((b) => {
      radio(b, b.dataset.style === l.style);
      const g = b.querySelector('b')!;
      g.textContent = glyph;
      g.dataset.g = glyph;
    });
    help.textContent = t.help[l.style];

    ink.row.hidden = !c.ink;
    foil.row.hidden = !c.foil;
    depth.row.hidden = !c.depth;
    gloss.row.hidden = !c.gloss;
    tilt.hidden = l.style === 'ink';
    detail.dataset.style = l.style;

    const ik = inkKeyOf(l.ink);
    INK_KEYS.forEach((k, i) => {
      const b = inkBtns[i];
      b.hidden = k === 'none' && !c.blind;
      // Blind only exists for presses; ink style falls back to the frame's ink.
      radio(b, k === ik || (k === 'auto' && ik === 'none' && !c.blind));
    });
    inkBtns[INK_KEYS.indexOf('auto')].style.setProperty('--sw', frameInk);
    inkBtns[INK_KEYS.indexOf('custom')].style.setProperty('--sw', ik === 'custom' ? l.ink : 'transparent');
    inkBtns[INK_KEYS.indexOf('custom')].classList.toggle('is-set', ik === 'custom');
    FOIL_TONES.forEach((k, i) => radio(foilBtns[i], k === l.foil));
    const cf = foilBtns[FOIL_TONES.indexOf('custom')];
    cf.style.setProperty('--lo', foilRamp({ ...l, foil: 'custom' })[0]);
    cf.style.setProperty('--hi', foilRamp({ ...l, foil: 'custom' })[1]);

    depth.label.textContent = t.depth[l.style];
    depth.input.value = String(l.depth);
    depth.out.textContent = `${Math.round(l.depth * 100)}%`;
    fill(depth.input);
    gloss.input.value = String(l.gloss);
    gloss.out.textContent = `${Math.round(l.gloss * 100)}%`;
    fill(gloss.input);
    reset.hidden = JSON.stringify({ ...l, style: DEFAULT_LETTERING.style }) === JSON.stringify(DEFAULT_LETTERING);
    lastFill = `${l.style}|${shown}`;
  }

  let lastFill = '';
  labels();
  sync();

  store.on((s, changed) => {
    if (changed.has('text')) {
      const prev = lastFill;
      setLettering(s.text);
      sync();
      // Depth and gloss only move uniforms; repaint the face only when the printed colour changes.
      if (lastFill !== prev) o.repaint();
      return;
    }
    if (changed.has('lang')) labels();
    if (['lang', 'frame', 'rarity', 'name', 'sample'].some((k) => changed.has(k as keyof typeof s))) sync();
  });
}
