// Custom frame colours after the frame presets. Picked colours are kept as swatches (in the
// store, so they come back next visit) and can be removed.
import { sfx } from './audio';
import { isHex } from './palette';
import type { Dict } from './i18n';
import type { State, Store } from './state';

export interface SwatchHost {
  store: Store;
  t: () => Dict;
  announce: (msg: string) => void;
}

const MAX = 8;

const PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z" /></svg>';
const CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z" /></svg>';

export function initSwatches(host: SwatchHost) {
  const { store } = host;

  function radio(btn: HTMLElement, on: boolean) {
    btn.setAttribute('aria-checked', String(on));
    btn.tabIndex = on ? 0 : -1;
  }

  /** Moves a colour to the end of the list (newest), dropping the oldest past the limit. */
  function remember(hex: string) {
    const t = host.t();
    const list = store.get().frameSwatches.filter((c) => c.toLowerCase() !== hex.toLowerCase());
    list.push(hex);
    const full = list.length > MAX;
    if (full) list.shift();
    store.set({ frameSwatches: list, frameColor: hex });
    host.announce(full ? t.colorFull.replace('{n}', String(MAX)) : t.colorAdded.replace('{hex}', hex.toUpperCase()));
  }

  function forget(hex: string) {
    const s = store.get();
    const before: Partial<State> = { frameSwatches: s.frameSwatches, frameColor: s.frameColor };
    // The store hands out its live state, so read what we need before changing it.
    const inUse = s.frameColor === hex;
    const t = host.t();
    const msg = inUse ? t.colorRemovedFrame.replace('{x}', t.frameName[s.frame]) : t.colorRemoved;
    const patch: Partial<State> = { frameSwatches: s.frameSwatches.filter((c) => c !== hex) };
    if (inUse) patch.frameColor = '';
    sfx.tick();
    store.set(patch);
    // Say what the frame fell back to when the removed colour was the one in use.
    undoToast(msg, hex, () => store.set(before));
  }

  /** A removal can be taken back for a few seconds from a toast, in the app's own toast style. */
  function undoToast(msg: string, hex: string, undo: () => void) {
    const box = document.getElementById('toasts');
    if (!box) return host.announce(msg);
    box.querySelectorAll('.toast.is-swatch').forEach((e) => e.remove());
    const el = document.createElement('div');
    el.className = 'toast is-swatch';
    el.innerHTML = `<i class="toast-sw" style="--sw:${hex}" aria-hidden="true"></i><p class="toast-msg" role="status"></p><button class="toast-btn" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3 2 6l3 3M2.5 6H10a4 4 0 0 1 0 8H7" /></svg><span></span></button>`;
    el.querySelector('.toast-msg')!.textContent = msg;
    el.querySelector('.toast-btn span')!.textContent = host.t().colorUndo;
    const close = () => {
      if (el.classList.contains('is-out')) return;
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 400);
    };
    el.querySelector('.toast-btn')!.addEventListener('click', () => {
      sfx.tick();
      undo();
      host.announce(host.t().colorAdded.replace('{hex}', hex.toUpperCase()));
      close();
    });
    box.appendChild(el);
    setTimeout(close, 6000);
  }

  /** One saved colour: a radio, with a small remove button that shows on hover or when chosen. */
  function chip(hex: string): HTMLElement {
    const t = host.t();
    const wrap = document.createElement('span');
    wrap.className = 'sw-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw-chip';
    b.setAttribute('role', 'radio');
    b.style.setProperty('--sw', hex);
    b.setAttribute('aria-label', t.myColor.replace('{hex}', hex.toUpperCase()));
    b.setAttribute('aria-keyshortcuts', 'Delete');
    b.setAttribute('aria-description', t.colorKeys);
    b.title = `${hex.toUpperCase()} — ${t.colorKeys}`;
    b.dataset.v = hex;
    radio(b, store.get().frameColor === hex);
    b.addEventListener('click', () => {
      if (store.get().frameColor === hex) return;
      sfx.tick();
      store.set({ frameColor: hex });
    });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      e.stopPropagation();
      // Keep focus in the group: land on the neighbour, or the add button if it was the last one.
      const group = b.closest('[role=radiogroup]')!;
      forget(hex);
      requestAnimationFrame(() => (group.querySelector<HTMLElement>('[role=radio][tabindex="0"]') ?? group.querySelector<HTMLElement>('.sw-add'))?.focus());
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sw-del';
    del.tabIndex = -1;
    del.innerHTML = CROSS;
    del.setAttribute('aria-label', t.removeColor.replace('{hex}', hex.toUpperCase()));
    del.title = del.getAttribute('aria-label')!;
    del.addEventListener('click', () => forget(hex));
    wrap.append(b, del);
    return wrap;
  }

  // The colour input lives outside the strip, which is rebuilt as the preview changes.
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'sw-input';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  document.body.appendChild(input);
  let before = '';
  input.addEventListener('input', () => store.set({ frameColor: input.value }));
  input.addEventListener('change', () => {
    if (input.value === before) return;
    remember(input.value);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[role=radio][data-v="${input.value}"]`)?.focus());
  });

  /**
   * The "+" opens the system colour picker. Dragging in it previews live on the card;
   * closing it with a new colour saves that colour as a swatch.
   */
  function addButton(): HTMLElement {
    const t = host.t();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw-add';
    b.innerHTML = `${PLUS}<span>${t.addColor}</span>`;
    b.setAttribute('aria-label', t.addFrameColor);
    b.title = t.addFrameColor;
    b.addEventListener('click', () => {
      sfx.tick();
      before = store.get().frameColor;
      input.value = isHex(before) ? before : '#e8b04a';
      // The picker opens next to its input, so park the input over this button first.
      const r = b.getBoundingClientRect();
      Object.assign(input.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      try {
        input.showPicker();
      } catch {
        input.click();
      }
    });
    return b;
  }

  /** Hook for main.ts: called each time the frame group is rebuilt. Custom colours follow the presets. */
  function decorateFrames(fs: HTMLElement) {
    const s = store.get();
    const custom = isHex(s.frameColor);
    const presets = [...fs.querySelectorAll<HTMLButtonElement>(':scope > [role=radio]')];
    presets.forEach((b) => {
      if (custom) radio(b, false);
      // Choosing a preset again must drop the custom colour, even when the preset was already set.
      b.addEventListener('click', () => {
        if (store.get().frameColor) store.set({ frameColor: '' });
      });
    });
    const strip = document.createElement('div');
    strip.className = 'sw-strip sw-strip-frame';
    for (const hex of s.frameSwatches) strip.appendChild(chip(hex));
    strip.appendChild(addButton());
    fs.appendChild(strip);
    // A colour being previewed in the picker but not yet saved still needs one tabbable radio.
    if (custom && !s.frameSwatches.includes(s.frameColor)) {
      const cur = presets.find((b) => b.getAttribute('aria-checked') === 'true');
      if (!cur && presets[0]) presets[0].tabIndex = 0;
    }
  }

  // Anything odd left in storage falls back to the defaults rather than breaking the card.
  {
    const s = store.get();
    const clean = (v: unknown) => (Array.isArray(v) ? v.filter(isHex).slice(-MAX) : []);
    store.set({
      frameSwatches: clean(s.frameSwatches),
      frameColor: isHex(s.frameColor) ? s.frameColor : '',
    });
  }


  return { decorateFrames };
}
