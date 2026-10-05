// Panel controls for lettering finishes: five live preview chips to pick how the
// name is printed, then only the tuning that style actually has. Loads with Fine-tune; the print
// the face uses and the shortcut under the name tag are letteringJump.ts.

import './lettering.css';
import type { Store } from './state';
import type { Dict } from './i18n';
import { sfx } from './audio';
import { DEFAULT_LETTERING, FOIL_RAMP, FOIL_TONES, LETTER_STYLES, STYLE_CONTROLS, foilRamp, stamp, type LetterInk, type Lettering } from './lettering';
import { chipGlyph, chipLook, stock } from './letteringJump';

interface Options {
  store: Store;
  /** The panel tab the controls live in. */
  host: HTMLElement;
  dict: () => Dict;
  /** The name as printed on the card (typed or fallback). */
  name: () => string;
  /** A small bounce on the card when a style is picked. */
  onPick: () => void;
}

/** Named inks, in swatch order. 'auto' and 'none' sit in front of these. */
const INKS = { white: '#f7f3ea', black: '#1b1f22', red: '#c8322a', navy: '#1f3b7a' } as const;
type InkKey = 'auto' | 'none' | keyof typeof INKS | 'custom';
const INK_KEYS: InkKey[] = ['auto', 'none', 'white', 'black', 'red', 'navy', 'custom'];

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

/** True while arrow keys are selecting, so "any colour" doesn't pop the system picker mid-browse. */
let browsing = false;

/** Arrow keys move and select within a radiogroup, like the rest of the panel. */
function roving(group: HTMLElement) {
  group.addEventListener('keydown', (e) => {
    const items = [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')].filter((b) => !b.hidden && !b.disabled);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    browsing = true;
    items[n].click();
    browsing = false;
    items[n].focus();
  });
}

/** Builds the controls; `call` brings them into view and draws the eye to them (the name tag's shortcut). */
export function mountLettering(o: Options): { call: () => void } {
  const { store } = o;

  const set = (patch: Partial<Lettering>) => store.set({ text: { ...store.get().text, ...patch } });

  // ---------- DOM ----------
  const root = el('div', 'lt');
  root.setAttribute('role', 'group');
  const tools = el('div', 'pane-tools');
  const reset = el('button', 'link lt-reset');
  reset.type = 'button';
  tools.append(reset);

  const stylesLabel = el('span', 'field-label');
  stylesLabel.id = 'ltStylesLabel';
  const styles = el('div', 'lt-styles');
  styles.setAttribute('role', 'radiogroup');
  styles.setAttribute('aria-labelledby', stylesLabel.id);
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
      stamp();
      o.onPick();
      // The tile itself takes a little press too.
      b.classList.remove('is-stamped');
      void b.offsetWidth;
      b.classList.add('is-stamped');
      // The style's own tuning appears below; keep it in view.
      requestAnimationFrame(() => reveal(detail, true));
    });
    b.addEventListener('animationend', () => b.classList.remove('is-stamped'));
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
    const name = el('span', 'lt-picked');
    name.setAttribute('aria-hidden', 'true');
    const group = el('div', 'lt-swatches');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', id);
    const top = el('div', 'lt-row-head');
    top.append(label, name);
    row.append(top, group);
    roving(group);
    return { row, label, name, group };
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
    // The two non-colour choices carry a word, not just a symbol.
    if (k === 'auto' || k === 'none') b.append(el('span', 'lt-swatch-word'));
    b.addEventListener('click', () => {
      sfx.tick();
      if (k === 'custom') {
        const cur = store.get().text.ink;
        inkPicker.value = cur.startsWith('#') ? cur : '#e0a030';
        set({ ink: inkPicker.value as LetterInk });
        if (!browsing) inkPicker.click();
      } else set({ ink: k === 'auto' || k === 'none' ? k : INKS[k] });
    });
    ink.group.append(b);
    return b;
  });
  ink.group.append(inkPicker);
  // Pointing at or focusing a swatch names it before you commit to it.
  const peek = (row: { name: HTMLElement; group: HTMLElement }) => {
    const show = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.lt-swatch');
      if (b) row.name.textContent = b.getAttribute('aria-label');
    };
    const back = () => sync();
    row.group.addEventListener('pointerover', show);
    row.group.addEventListener('focusin', show);
    row.group.addEventListener('pointerleave', back);
    row.group.addEventListener('focusout', back);
  };
  peek(ink);

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
        if (!browsing) foilPicker.click();
      }
    });
    foil.group.append(b);
    return b;
  });
  foil.group.append(foilPicker);
  peek(foil);

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
  root.append(tools, stylesLabel, styles, help, detail);
  o.host.append(root);
  roving(styles);

  // The panel's tabs and export bar are sticky; never leave a control hidden behind them.
  const reveal = (target: HTMLElement, smooth = false) => {
    const bar = document.querySelector('.sec-export');
    const panel = root.closest<HTMLElement>('.panel');
    // Beside the stage the panel scrolls on its own (never the page); on phones the page does.
    const inPanel = !!panel && getComputedStyle(panel).overflowY !== 'visible';
    const r = target.getBoundingClientRect();
    const floor = bar ? bar.getBoundingClientRect().top - 16 : innerHeight - 16;
    const tabs = document.getElementById('panelTabs')!.getBoundingClientRect();
    const ceil = Math.max(inPanel ? panel!.getBoundingClientRect().top : 0, tabs.bottom) + 16;
    // Above the view: bring the top into it. Below: bring the bottom above the bar, but never
    // push the top out of view.
    let by = 0;
    if (r.top < ceil) by = r.top - ceil;
    else if (r.bottom > floor) by = Math.min(r.bottom - floor, r.top - ceil);
    if (by === 0) return;
    const behavior: ScrollBehavior = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
    (inPanel ? panel! : window).scrollBy({ top: by, behavior });
  };
  root.addEventListener('focusin', (e) => reveal(e.target as HTMLElement));


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

  function call() {
    const on = styles.querySelector<HTMLButtonElement>('[aria-checked=true]');
    // Off-screen (phones: the panel is far below) jump there first, then fit the whole block.
    const r = root.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) root.scrollIntoView({ block: 'start' });
    on?.focus({ preventScroll: true });
    reveal(root, true);
    root.classList.remove('is-called');
    void root.offsetWidth;
    root.classList.add('is-called');
  }
  root.addEventListener('animationend', (e) => {
    if (e.target === root) root.classList.remove('is-called');
  });

  reset.addEventListener('click', () => {
    sfx.tick();
    set({ ...DEFAULT_LETTERING });
  });

  // ---------- Sync ----------
  const fill = (rng: HTMLInputElement) =>
    rng.style.setProperty('--fill', `${((+rng.value - +rng.min) / (+rng.max - +rng.min)) * 100}%`);

  function labels() {
    const t = o.dict().lt;
    root.setAttribute('aria-label', t.title);
    reset.textContent = t.reset;
    stylesLabel.textContent = t.styles;
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
      const w = inkBtns[i].querySelector('.lt-swatch-word');
      if (w) w.textContent = t.inkShort[k as 'auto' | 'none'];
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
    const frameInk = stock(s.frame, s.rarity, s.frameColor).ink;
    const glyph = chipGlyph(o.name());
    // Chips preview each style in your current colours on your current frame.
    chipLook(root, s);
    styleBtns.forEach((b) => {
      radio(b, b.dataset.style === l.style);
      const g = b.querySelector('b')!;
      g.textContent = glyph;
      g.dataset.g = glyph;
    });
    help.textContent = t.help[l.style];

    // Only the tuning the style actually has is shown.
    ink.row.hidden = !c.ink;
    foil.row.hidden = !c.foil;
    depth.row.hidden = !c.depth;
    gloss.row.hidden = !c.gloss;
    tilt.hidden = l.style === 'ink';
    detail.dataset.style = l.style;

    const ik = inkKeyOf(l.ink);
    const shownInk = ik === 'none' && !c.blind ? 'auto' : ik;
    INK_KEYS.forEach((k, i) => {
      const b = inkBtns[i];
      // "No ink" only exists for presses; elsewhere it isn't offered at all.
      b.hidden = k === 'none' && !c.blind;
      // Blind only exists for presses; ink style falls back to the frame's ink, so one radio is on.
      radio(b, k === shownInk);
    });
    inkBtns[INK_KEYS.indexOf('auto')].style.setProperty('--sw', frameInk);
    inkBtns[INK_KEYS.indexOf('custom')].style.setProperty('--sw', ik === 'custom' ? l.ink : 'transparent');
    inkBtns[INK_KEYS.indexOf('custom')].classList.toggle('is-set', ik === 'custom');
    FOIL_TONES.forEach((k, i) => radio(foilBtns[i], k === l.foil));
    // Name the picked swatch in words; colour alone isn't enough.
    ink.name.textContent = c.blind || ik !== 'none' ? t.inkName[ik] : t.inkName.auto;
    foil.name.textContent = t.foilName[l.foil];
    const cf = foilBtns[FOIL_TONES.indexOf('custom')];
    cf.style.setProperty('--lo', foilRamp({ ...l, foil: 'custom' })[0]);
    cf.style.setProperty('--hi', foilRamp({ ...l, foil: 'custom' })[1]);

    // Values read as words (shallow…deep, matte…mirror); the percentage stays for screen readers.
    const word = (v: number, w: readonly string[]) => w[v < 0.34 ? 0 : v < 0.67 ? 1 : 2];
    depth.label.textContent = t.depth;
    depth.input.value = String(l.depth);
    depth.out.textContent = c.depth ? word(l.depth, t.level) : '—';
    depth.input.setAttribute('aria-valuetext', `${depth.out.textContent} (${Math.round(l.depth * 100)}%)`);
    fill(depth.input);
    gloss.input.value = String(l.gloss);
    gloss.out.textContent = c.gloss ? word(l.gloss, t.glossLevel) : '—';
    gloss.input.setAttribute('aria-valuetext', `${gloss.out.textContent} (${Math.round(l.gloss * 100)}%)`);
    fill(gloss.input);
    tools.hidden = JSON.stringify(l) === JSON.stringify(DEFAULT_LETTERING);
  }

  labels();
  sync();

  store.on((s, changed) => {
    if (changed.has('text')) return sync();
    if (changed.has('lang')) labels();
    if (['lang', 'frame', 'frameColor', 'rarity', 'name', 'sample'].some((k) => changed.has(k as keyof typeof s))) sync();
  });
  return { call };
}
