// The motion button above the deck: the card's idle motion in one tap, without opening the panel.
// It shows the current motion's icon; pressed, it deals the motions out as a small tray with
// their names, and what the pointed one does underneath. A pick applies at once and closes the
// tray. It is the same setting as the Shine tab's "Idle motion" (both read and write the store).

import './quick.css';
import { DICTS } from '../i18n';
import type { Store } from '../state';
import { sfx } from '../audio';
import { IDLE_MODES, type IdleMode } from './model';
import { svg } from './icons';

/** Options per row of the tray. */
const COLS = 5;

export function mountQuickMotion(store: Store, host: HTMLElement): void {
  const root = document.createElement('div');
  root.className = 'qm';
  root.innerHTML = `
    <button class="qm-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="qmTray"></button>
    <span class="qm-cap" aria-hidden="true"></span>
    <div class="qm-tray" id="qmTray" role="radiogroup" aria-labelledby="qmTitle" hidden>
      <p class="qm-title" id="qmTitle"></p>
      <div class="qm-grid"></div>
      <p class="qm-help" aria-hidden="true"></p>
    </div>`;
  host.prepend(root);
  const btn = root.querySelector<HTMLButtonElement>('.qm-btn')!;
  const cap = root.querySelector<HTMLElement>('.qm-cap')!;
  const tray = root.querySelector<HTMLElement>('.qm-tray')!;
  const grid = root.querySelector<HTMLElement>('.qm-grid')!;
  const help = root.querySelector<HTMLElement>('.qm-help')!;
  const dict = () => DICTS[store.get().lang].tune;
  const now = () => store.get().tune.idle;

  const options = IDLE_MODES.map((v, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qm-opt';
    b.dataset.value = v;
    b.setAttribute('role', 'radio');
    b.style.setProperty('--i', String(i));
    b.innerHTML = `${svg(v)}<span></span>`;
    b.addEventListener('click', () => pick(v));
    for (const ev of ['pointerenter', 'focus']) b.addEventListener(ev, () => describe(v));
    grid.appendChild(b);
    return b;
  });

  const describe = (v: IdleMode) => {
    const t = dict();
    help.innerHTML = '<b></b> ';
    help.querySelector('b')!.textContent = t.idleMode[v];
    help.append(t.idleHelp[v]);
  };

  const render = () => {
    const t = dict();
    const v = now();
    btn.innerHTML = svg(v);
    btn.dataset.value = v;
    btn.setAttribute('aria-label', `${t.label.idle}: ${t.idleMode[v]}`);
    btn.title = `${t.label.idle}: ${t.idleMode[v]}`;
    // Under the button, the motion it is set to, so nobody has to read the icon.
    cap.textContent = t.idleMode[v];
    root.querySelector('.qm-title')!.textContent = t.label.idle;
    options.forEach((b) => {
      const on = b.dataset.value === v;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.querySelector('span')!.textContent = t.idleMode[b.dataset.value as IdleMode];
    });
    if (!tray.hidden) describe(v);
  };

  const open = (on: boolean, focus = true) => {
    if (tray.hidden === !on) return;
    tray.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    root.classList.toggle('is-open', on);
    if (on) {
      sfx.tick();
      describe(now());
      options.find((b) => b.dataset.value === now())?.focus();
    } else if (focus) btn.focus();
  };

  function pick(v: IdleMode) {
    if (v !== now()) {
      sfx.tick();
      store.set({ tune: { ...store.get().tune, idle: v } });
    }
    open(false);
  }

  btn.addEventListener('click', () => open(tray.hidden === true));
  tray.addEventListener('keydown', (e) => {
    const i = options.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      return open(false);
    }
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length];
    next.focus();
  });
  // A press anywhere else, or focus leaving the tray, closes it.
  document.addEventListener('pointerdown', (e) => {
    if (!tray.hidden && !root.contains(e.target as Node)) open(false, false);
  });
  root.addEventListener('focusout', (e) => {
    if (!tray.hidden && !root.contains(e.relatedTarget as Node | null) && e.relatedTarget) open(false, false);
  });

  // Where the name tag beside the card comes down to the deck (a short, narrow stage), the button
  // tucks into the gap between them instead of covering the tag.
  const info = document.getElementById('info');
  const place = () => {
    root.classList.remove('is-tight');
    if (!info || getComputedStyle(root).position !== 'absolute') return;
    const a = btn.getBoundingClientRect();
    const b = info.getBoundingClientRect();
    root.classList.toggle('is-tight', a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  };
  new ResizeObserver(place).observe(info ?? root);
  addEventListener('resize', place);

  store.on((_, changed) => {
    if (changed.has('tune') || changed.has('lang')) render();
  });
  render();
  place();
}
