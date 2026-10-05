// The motion tray above the deck: the motions as a small tray of tiles in their four groups, what the
// pointed one does and how long its loop is, and two sliders for its speed and size with a reset. A pick applies at once and the tray
// stays open to tune it; the close button, a press elsewhere or Escape closes it. These are the Shine
// tab's own settings (both read and write the store). On phones the tray is a sheet along the
// bottom, so the card stays in view. The button that opens it is quick.ts.

import './acts.css';
import './quickTray.css';
import { dictOf } from '../i18n';
import type { Store } from '../state';
import { sfx } from '../audio';
import { editionById } from '../editions';
import { exportLoop, MOTION_GROUPS, MOTION_ORDER, RANGES, TUNE_DEFAULTS, type IdleMode } from './model';
import { svg } from './icons';
import './motionIcons';
import { format } from './format';

/** The settings the tray's sliders tune. */
const KNOBS = ['speed', 'idleAmp'] as const;
type Knob = (typeof KNOBS)[number];

const pct = (k: Knob, v: number) => ((v - RANGES[k].min) / (RANGES[k].max - RANGES[k].min)) * 100;

export function mountTray(store: Store, root: HTMLElement, btn: HTMLButtonElement) {
  const tray = document.createElement('div');
  tray.className = 'qm-tray';
  tray.id = 'qmTray';
  tray.setAttribute('role', 'dialog');
  tray.setAttribute('aria-labelledby', 'qmTitle');
  tray.hidden = true;
  tray.innerHTML = `
      <div class="qm-head"><p class="qm-title" id="qmTitle"></p><p class="qm-note"></p><button class="qm-close" type="button">${svg('close')}</button></div>
      <div class="qm-grid" role="radiogroup" aria-labelledby="qmTitle">${MOTION_GROUPS.map((g) => `<div class="qm-group" data-group="${g.id}"><p class="qm-glabel"></p><div class="qm-row"></div></div>`).join('')}</div>
      <p class="qm-help" aria-hidden="true"></p>
      <div class="qm-tune">
        ${KNOBS.map((k) => `<label class="qm-knob"><span class="qm-label"></span><output class="qm-val"></output><span class="qm-track" style="--def:${pct(k, TUNE_DEFAULTS[k])}%"><input class="qm-range" type="range" data-k="${k}" min="${RANGES[k].min}" max="${RANGES[k].max}" step="${RANGES[k].step}" /></span></label>`).join('')}
        <button class="qm-reset" type="button">${svg('reset')}<span></span></button>
      </div>`;
  root.append(tray);
  const grid = tray.querySelector<HTMLElement>('.qm-grid')!;
  const help = tray.querySelector<HTMLElement>('.qm-help')!;
  const close = tray.querySelector<HTMLButtonElement>('.qm-close')!;
  const dict = () => dictOf(store.get().lang).tune;
  const now = () => store.get().tune.idle;

  const rowOf = (v: IdleMode) => grid.querySelector(`[data-group=${(MOTION_GROUPS.find((g) => g.motions.includes(v)) ?? MOTION_GROUPS[0]).id}] .qm-row`)!;
  // In their groups, None closing the first row: the order arrow keys walk.
  const options = MOTION_ORDER.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qm-opt';
    b.dataset.value = v;
    b.setAttribute('role', 'radio');
    b.innerHTML = `${svg(v)}<span></span><i class="qm-check" aria-hidden="true"></i>`;
    b.addEventListener('click', () => pick(v));
    for (const ev of ['pointerenter', 'focus']) b.addEventListener(ev, () => describe(v));
    rowOf(v).appendChild(b);
    return b;
  });
  // Dealt like a hand of cards: each tile a little askew until it is pointed at, row by row.
  options.forEach((b, i) => {
    b.style.setProperty('--i', String(i));
    b.style.setProperty('--tilt', `${(((i * 7) % 11) - 5) * 0.6}deg`);
    b.style.setProperty('--lift', `${((i * 3) % 5) - 2}px`);
  });

  // Leaving the tiles, the line goes back to the picked motion.
  grid.addEventListener('pointerleave', () => describe(now()));

  const knobs = [...tray.querySelectorAll<HTMLInputElement>('.qm-range')];
  const reset = tray.querySelector<HTMLButtonElement>('.qm-reset')!;
  for (const input of knobs) {
    const k = input.dataset.k as Knob;
    input.addEventListener('input', () => store.set({ tune: { ...store.get().tune, [k]: +input.value } }));
  }
  reset.addEventListener('click', () => {
    sfx.tick();
    store.set({ tune: { ...store.get().tune, speed: TUNE_DEFAULTS.speed, idleAmp: TUNE_DEFAULTS.idleAmp } });
  });

  /** The pointed motion: its name, what it does and how long its loop runs at the set speed. */
  const describe = (v: IdleMode) => {
    const t = dict();
    const s = store.get();
    help.innerHTML = '<em></em><b></b> <span></span><small></small>';
    const peek = v !== now();
    help.classList.toggle('is-preview', peek);
    help.querySelector('em')!.textContent = peek ? t.trayPointed : t.trayPicked;
    help.querySelector('b')!.textContent = t.idleMode[v];
    help.querySelector('span')!.textContent = t.idleHelp[v];
    const secs = exportLoop({ ...s.tune, idle: v }, undefined, !!editionById(s.edition).torch).loopMs / 1000;
    help.querySelector('small')!.textContent = v === 'none' ? '' : t.loopLen.replace('{s}', String(Math.round(secs * 10) / 10));
  };

  const render = () => {
    const t = dict();
    const v = now();
    const tune = store.get().tune;
    tray.querySelector('.qm-title')!.textContent = t.groups.motion;
    tray.querySelector('.qm-note')!.textContent = t.trayNote;
    for (const g of MOTION_GROUPS) tray.querySelector(`[data-group=${g.id}] .qm-glabel`)!.textContent = t.motionGroup[g.id];
    close.setAttribute('aria-label', t.close);
    close.title = t.close;
    options.forEach((b) => {
      const on = b.dataset.value === v;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.querySelector('span')!.textContent = t.idleMode[b.dataset.value as IdleMode];
    });
    for (const input of knobs) {
      const k = input.dataset.k as Knob;
      input.value = String(tune[k]);
      // The groove fills up to the grip (the page's one slider, style.css).
      input.style.setProperty('--fill', `${pct(k, tune[k])}%`);
      const knob = input.closest('.qm-knob')!;
      knob.querySelector('.qm-label')!.textContent = t.quick[k];
      input.setAttribute('aria-label', t.label[k]);
      knob.querySelector('.qm-val')!.textContent = format(k, tune[k], t);
      input.disabled = k === 'idleAmp' && v === 'none';
    }
    reset.querySelector('span')!.textContent = t.idleReset;
    reset.title = `${t.label.speed} · ${t.label.idleAmp}: ${t.idleReset}`;
    reset.disabled = KNOBS.every((k) => tune[k] === TUNE_DEFAULTS[k]);
    if (!tray.hidden) describe(v);
  };

  /**
   * Keeps the open tray between the card and the side panel: it slides from its place over the
   * button only as far as it must. Where the gap is too narrow, the panel's controls win.
   */
  const fit = () => {
    tray.style.translate = '';
    if (matchMedia('(max-width: 900px)').matches) return;
    const r = tray.getBoundingClientRect();
    const panel = document.querySelector('.panel')?.getBoundingClientRect();
    const card = document.getElementById('cardSlot')?.getBoundingClientRect();
    const most = panel ? panel.left - 8 - r.right : Infinity;
    const least = card ? card.right + 6 - r.left : -Infinity;
    const dx = Math.round(least <= most ? Math.min(most, Math.max(least, 0)) : most);
    if (dx) tray.style.translate = `${dx}px 0`;
    // The notch keeps pointing at the button.
    const b = btn.getBoundingClientRect();
    tray.style.setProperty('--notch', `${Math.round(r.right + dx - (b.left + b.width / 2) - 8)}px`);
  };

  const open = (on: boolean, focus = true) => {
    if (tray.hidden === !on) return;
    tray.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    root.classList.toggle('is-open', on);
    // What the tray would half cover steps back while it is open.
    document.documentElement.classList.toggle('qm-open', on);
    if (on) fit();
    if (on) {
      sfx.tick();
      describe(now());
      options.find((b) => b.dataset.value === now())?.focus();
    } else if (focus) btn.focus();
  };

  function pick(v: IdleMode) {
    if (v === now()) return;
    sfx.tick();
    store.set({ tune: { ...store.get().tune, idle: v } });
    const b = options.find((o) => o.dataset.value === v)!;
    b.classList.remove('is-picked');
    void b.offsetWidth;
    b.classList.add('is-picked');
  }

  close.addEventListener('click', () => open(false));
  tray.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      return open(false);
    }
    const cur = document.activeElement as HTMLButtonElement;
    const i = options.indexOf(cur);
    if (i < 0) return;
    const side = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    const down = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!side && !down) return;
    e.preventDefault();
    if (side) return options[(i + side + options.length) % options.length].focus();
    // Up and down go to the nearest tile in the group above or below.
    const rows = [...grid.querySelectorAll<HTMLElement>('.qm-row')];
    const r = rows.indexOf(cur.parentElement!);
    const next = [...rows[(r + down! + rows.length) % rows.length].children] as HTMLButtonElement[];
    const x = (b: HTMLElement) => b.getBoundingClientRect().left + b.offsetWidth / 2;
    next.reduce((a, b) => (Math.abs(x(b) - x(cur)) < Math.abs(x(a) - x(cur)) ? b : a)).focus();
  });
  // A press anywhere else, or focus leaving the tray, closes it.
  document.addEventListener('pointerdown', (e) => {
    if (!tray.hidden && !root.contains(e.target as Node)) open(false, false);
  });
  root.addEventListener('focusout', (e) => {
    if (!tray.hidden && !root.contains(e.relatedTarget as Node | null) && e.relatedTarget) open(false, false);
  });

  render();
  return {
    /** Opens (true) or closes it. */
    open,
    render,
    fit,
    get hidden() {
      return tray.hidden === true;
    },
  };
}

export type Tray = ReturnType<typeof mountTray>;
