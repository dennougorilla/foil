// The "Fine-tune light & motion" drawer in the Tune section. Closed by default; opening it
// reveals three tabs of controls. Every control shows its value, can be reset on its own,
// and double-click / Delete puts it back to the default.
import './tune.css';
import { DICTS, type Dict } from '../i18n';
import type { State, Store } from '../state';
import type { EditionId } from '../editions';
import { sfx } from '../audio';
import {
  changedKeys,
  IDLE_MODES,
  isDefault,
  LIGHT_MODES,
  lightCss,
  METALS,
  RANGES,
  TUNE_DEFAULTS,
  type ChoiceKey,
  type NumKey,
  type Tune,
} from './model';
import { gyroAvailable, motion } from './motion';
import { mountPeek } from './peek';
import { mountSunHandle } from './handle';

type Tab = 'pattern' | 'light' | 'motion';
type Key = NumKey | ChoiceKey;

const TABS: { id: Tab; keys: Key[] }[] = [
  { id: 'pattern', keys: ['scale', 'angle', 'hue', 'sat', 'metal'] },
  { id: 'light', keys: ['glare', 'sharp', 'temp', 'sparkle', 'sparkleSize'] },
  { id: 'motion', keys: ['light', 'lightAngle', 'speed', 'tiltMax', 'idle'] },
];

const ICONS: Record<string, string> = {
  pattern: '<path d="M2 2h4v4H2zm8 0h4v4h-4zM6 6h4v4H6zm-4 4h4v4H2zm8 0h4v4h-4z"/>',
  light: '<path d="M7 1h2v3H7zm0 11h2v3H7zM1 7h3v2H1zm11 0h3v2h-3zM5 5h6v6H5zM3 2h1v1h1v1H3zm9 0h1v2h-2V3h1zM3 12h2v1H4v1H3zm8 0h2v2h-1v-1h-1z"/>',
  motion: '<path d="M2 9h2V7h2V5h2v2h2v2h2V7h2v2h-2v2h-2V9H8V7H6v2H4v2H2z"/>',
  pointer: '<path d="M4 1h2v1h1v1h1v1h1v1h1v1h1v1h1v2H9v1h1v2H8v-2H7v1H6v1H4z"/>',
  orbit: '<path d="M6 2h4v1h2v1h1v2h1v4h-1v2h-1v1h-2v1H6v-1H4v-1H3v-2H2V6h1V4h1V3h2zm0 2v1H5v1H4v4h1v1h1v1h4v-1h1v-1h1V6h-1V5h-1V4zm1 3h2v2H7zm4-6h3v3h-3z"/>',
  fixed: '<path d="M3 2h10v12H3zm2 2v8h6V4zm4 1h2v2H9z"/>',
  gyro: '<path d="M5 1h6v1h1v12h-1v1H5v-1H4V2h1zm1 2v9h4V3zm1 10h2v1H7z"/>',
  none: '<path d="M3 7h10v2H3z"/>',
  sway: '<path d="M1 8h2V6h2v2h2v2h2V8h2V6h2v2h2v2h-2v2h-2v-2H9v-2H7v2H5v2H3v-2H1z"/>',
  spin: '<path d="M6 2h5v1h1v1h1v3h-2V5h-1V4H6v1H5v2H3V4h1V3h2zm-3 7h2v2h1v1h4v-1h1V9h2v3h-1v1h-1v1H5v-1H4v-1H3z"/>',
  breathe: '<path d="M7 7h2v2H7zM5 4h6v1h1v1h1v4h-1v1h-1v1H5v-1H4v-1H3V6h1V5h1zm1 2v1H5v2h1v1h4V9h1V7h-1V6z"/>',
  gold: '<path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zm1 3v1H5v4h1v1h4v-1h1V6h-1V5z"/>',
  silver: '<path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zm0 3v6h6V5zm2 2h2v2H7z"/>',
  eye: '<path d="M5 4h6v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H5v-1H3v-1H2V9H1V7h1V6h1V5h2zm1 2v1H5v2h1v1h4V9h1V7h-1V6zm1 1h2v2H7z"/>',
  reset: '<path d="M7 2h4v1h1v1h1v1h1v5h-1v1h-1v1h-1v1H6v-2h4v-1h1V6h-1V5H7v1H6v1h2v2H2V3h2v2h1V4h1V3h1z"/>',
  chevron: '<path d="M5 3h2v2h2v2h2v2H9v2H7v2H5v-2h2V9h2V7H7V5H5z"/>',
};

/** Finishes with their own animation (they read the shader clock), so Speed always shows. */
const ANIMATED = new Set<EditionId>(['gold', 'galaxy', 'glitch', 'aurora', 'magma', 'sakura', 'shallows', 'kintsugi', 'opal', 'eclipse']);

const svg = (name: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);

function format(k: NumKey, v: number, t: Dict['tune']): string {
  switch (k) {
    case 'scale':
    case 'sharp':
    case 'sparkleSize':
      return `${Math.round(v * 100)}%`;
    case 'angle':
    case 'hue':
      return `${sign(Math.round(v))}°`;
    case 'lightAngle':
    case 'tiltMax':
      return `${Math.round(v)}°`;
    case 'sat':
    case 'glare':
      return `${Math.round(v * 100)}%`;
    case 'sparkle':
      return `${Math.round(v * 100)}%`;
    case 'temp':
      return `${Math.round(v)}K`;
    case 'speed':
      return v <= 0 ? t.stopped : `${Math.round(v * 100)}%`;
  }
}

const formatChoice = (k: ChoiceKey, v: string, t: Dict['tune']) =>
  k === 'light' ? t.lightMode[v as Tune['light']] : k === 'idle' ? t.idleMode[v as Tune['idle']] : t.metalMode[v as Tune['metal']];

const pct = (k: NumKey, v: number) => ((v - RANGES[k].min) / (RANGES[k].max - RANGES[k].min)) * 100;

/** Track art: most ranges fill from the left; signed ones fill outwards from their default. */
function trackFor(k: NumKey, v: number): string {
  const fill = 'var(--tune-fill)';
  const base = 'var(--panel-lo)';
  if (k === 'hue') {
    const stops = Array.from({ length: 7 }, (_, i) => `hsl(${-180 + i * 60 + 0} 80% 58%)`).join(',');
    return `linear-gradient(90deg, ${stops})`;
  }
  if (k === 'temp') return 'linear-gradient(90deg, #ff9a3c, #ffd6a0 38%, #ffffff 53%, #bcd6ff 76%, #7fb0ff)';
  if (k === 'sat') return 'linear-gradient(90deg, #7d8486, var(--accent))';
  // A direction, not an amount: no fill, just the thumb on its position round the card.
  if (k === 'lightAngle') return base;
  const at = pct(k, v);
  if (RANGES[k].bipolar) {
    const d = pct(k, TUNE_DEFAULTS[k]);
    const [a, b] = at < d ? [at, d] : [d, at];
    return `linear-gradient(90deg, ${base} ${a}%, ${fill} ${a}% ${b}%, ${base} ${b}%)`;
  }
  return `linear-gradient(90deg, ${fill} ${at}%, ${base} ${at}%)`;
}

export function mountTune(store: Store, after: Element): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hasGyro = gyroAvailable();
  let tab: Tab = 'pattern';
  let t = DICTS[store.get().lang].tune;
  let gyroNote: 'wait' | 'denied' | null = null;
  /** What "Reset all" replaced, offered back for a few seconds. */
  let undo: Tune | null = null;
  let undoTimer = 0;
  const touch = matchMedia('(pointer: coarse)').matches;
  const peek = mountPeek(() => sync(), () => Math.cos(motion.spinAngle));
  const sun = mountSunHandle((deg) => set({ lightAngle: deg }), () => Math.cos(motion.spinAngle));
  // A stamp on the card while "Hold to compare" shows the defaults.
  const stamp = document.createElement('span');
  stamp.className = 'tune-stamp';
  stamp.setAttribute('aria-hidden', 'true');
  document.getElementById('cardSlot')?.appendChild(stamp);

  // The drawer opens under the section's last slider; its toggle sits in the section's title
  // row, so a closed drawer adds no height and every control still fits above Export.
  const root = document.createElement('div');
  root.className = 'tune';
  after.after(root);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tune-toggle';
  toggle.setAttribute('aria-controls', 'tuneBody');
  root.closest('.sec')!.querySelector('.sec-title')!.after(toggle);

  const tuneNow = () => store.get().tune;
  const set = (patch: Partial<Tune>) => store.set({ tune: { ...tuneNow(), ...patch } });
  const reset = (k: Key) => {
    if (isDefault(tuneNow(), k)) return;
    sfx.tick();
    set({ [k]: TUNE_DEFAULTS[k] } as Partial<Tune>);
  };

  // ---------- Build ----------

  function build() {
    t = DICTS[store.get().lang].tune;
    const open = store.get().tuneOpen;
    toggle.innerHTML = `
      <span class="tune-toggle-label"></span>
      <span class="tune-badge" hidden></span>
      <span class="tune-chev">${svg('chevron')}</span>`;
    root.innerHTML = `
      <div class="tune-body" id="tuneBody">
        <div class="tune-tabbar">
          <div class="tune-tabs" role="tablist"></div>
          <button class="tune-close" type="button"><span></span>${svg('chevron')}</button>
        </div>
        <div class="tune-panes"></div>
        <div class="tune-dock">
          <p class="tune-hint"></p>
          <div class="tune-dock-row">
          <span class="tune-dock-peek"></span>
          <div class="tune-actions">
            <button class="tune-compare" type="button" aria-pressed="false">${svg('eye')}<span class="tune-long"></span><span class="tune-short"></span></button>
            <p class="tune-undo-msg" hidden><b></b><small></small></p>
            <button class="tune-reset-all" type="button">${svg('reset')}<span></span></button>
            <button class="tune-undo" type="button" hidden>${svg('reset')}<span></span></button>
          </div>
          </div>
        </div>
      </div>`;
    toggle.querySelector('.tune-toggle-label')!.textContent = t.toggleShort;
    toggle.title = t.toggle;
    root.querySelector('.tune-hint')!.textContent = touch ? t.hintTouch : t.hint;
    root.querySelector('.tune-reset-all span')!.textContent = t.resetAll;
    root.querySelector('.tune-undo span')!.textContent = t.undo;
    stamp.textContent = t.stamp;
    peek.setLabel(t.peek, t.peekCap);
    root.querySelector('.tune-dock-peek')!.replaceWith(peek.el);
    bindCompare(root.querySelector<HTMLButtonElement>('.tune-compare')!);
    // A way to close the drawer that stays in reach once the section title has scrolled away.
    const close = root.querySelector<HTMLButtonElement>('.tune-close')!;
    close.querySelector('span')!.textContent = t.close;
    close.addEventListener('click', () => {
      sfx.tick();
      store.set({ tuneOpen: false });
      toggle.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
      toggle.focus({ preventScroll: true });
    });
    const tabs = root.querySelector<HTMLElement>('.tune-tabs')!;
    tabs.setAttribute('aria-label', t.toggle);
    const panes = root.querySelector<HTMLElement>('.tune-panes')!;
    for (const def of TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tune-tab';
      b.id = `tuneTab-${def.id}`;
      b.dataset.tab = def.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', `tunePane-${def.id}`);
      b.innerHTML = `${svg(def.id)}<span></span><i class="tune-dot" aria-hidden="true"></i>`;
      b.querySelector('span')!.textContent = t.tabs[def.id];
      b.addEventListener('click', () => selectTab(def.id));
      tabs.appendChild(b);

      const pane = document.createElement('div');
      pane.className = 'tune-pane';
      pane.id = `tunePane-${def.id}`;
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', b.id);
      if (def.id === 'pattern') pane.appendChild(sampleRow());
      for (const k of def.keys)
        pane.appendChild(k === 'light' || k === 'idle' || k === 'metal' ? choiceRow(k) : k === 'lightAngle' ? dialRow(k) : rangeRow(k));
      if (def.id === 'motion') {
        const note = document.createElement('p');
        note.className = 'tune-note';
        note.setAttribute('role', 'status');
        pane.appendChild(note);
      }
      panes.appendChild(pane);
    }
    tabs.addEventListener('keydown', (e) => {
      const i = TABS.findIndex((d) => d.id === tab);
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
      if (n === null) return;
      e.preventDefault();
      selectTab(TABS[(n + TABS.length) % TABS.length].id);
      root.querySelector<HTMLElement>(`#tuneTab-${tab}`)?.focus();
    });
    toggle.onclick = () => {
      sfx.tick();
      const next = !store.get().tuneOpen;
      store.set({ tuneOpen: next });
      if (next) {
        // Bring the drawer into view without hiding it behind the sticky Export bar.
        requestAnimationFrame(() =>
          root.querySelector('.tune-body')!.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }),
        );
      }
    };
    root.querySelector('.tune-reset-all')!.addEventListener('click', () => {
      if (!changedKeys(tuneNow()).length) return;
      sfx.tick();
      const before = tuneNow();
      store.set({ tune: { ...TUNE_DEFAULTS } });
      gyroNote = null;
      announce(t.resetDone);
      // Offer the old settings back for a moment; focus moves to that offer.
      undo = before;
      clearTimeout(undoTimer);
      undoTimer = window.setTimeout(() => {
        const had = root.contains(document.activeElement) && document.activeElement?.classList.contains('tune-undo');
        undo = null;
        sync();
        if (had) root.querySelector<HTMLElement>(`#tuneTab-${tab}`)?.focus();
      }, 8000);
      sync();
      root.querySelector<HTMLElement>('.tune-undo')?.focus();
    });
    root.querySelector('.tune-undo')!.addEventListener('click', () => {
      if (!undo) return;
      sfx.tick();
      const back = undo;
      undo = null;
      clearTimeout(undoTimer);
      store.set({ tune: back });
      announce(t.undoDone);
      root.querySelector<HTMLElement>('.tune-reset-all')?.focus();
    });
    root.classList.toggle('is-open', open);
    selectTab(tab, true);
    sync();
  }

  /** Press and hold (pointer, Space or Enter) to see the card with the defaults. */
  function bindCompare(b: HTMLButtonElement) {
    b.querySelector('.tune-long')!.textContent = t.compare;
    b.querySelector('.tune-short')!.textContent = t.compareShort;
    // Phones show a shorter label (or just the eye); the full words stay the accessible name.
    b.setAttribute('aria-label', t.compare);
    b.title = t.compareHelp;
    const hold = (on: boolean) => {
      if (motion.comparing === on) return;
      motion.comparing = on;
      b.setAttribute('aria-pressed', String(on));
      root.classList.toggle('is-comparing', on);
      stamp.classList.toggle('is-on', on);
      sync();
    };
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId);
      hold(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'] as const) b.addEventListener(ev, () => hold(false));
    b.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        hold(true);
      }
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') hold(false);
    });
  }

  function head(k: Key, forId: string | null) {
    const h = document.createElement('div');
    h.className = 'tune-head';
    h.innerHTML = `<span class="tune-label"></span><span class="tune-extra" aria-hidden="true"></span><output class="tune-out"></output><button class="tune-reset" type="button">${svg('reset')}</button>`;
    const label = h.querySelector('.tune-label')!;
    if (forId) {
      const l = document.createElement('label');
      l.htmlFor = forId;
      l.textContent = t.label[k];
      label.replaceWith(l);
      l.className = 'tune-label';
    } else {
      label.textContent = t.label[k];
      label.id = `tuneLabel-${k}`;
    }
    if (forId) h.querySelector('output')!.htmlFor.add(forId);
    h.querySelector('.tune-reset')!.addEventListener('click', () => {
      reset(k);
      // Stay on the control rather than losing focus to the hidden reset button.
      root.querySelector<HTMLElement>(`[data-key="${k}"] :is(input, [role=slider], [aria-checked="true"])`)?.focus();
    });
    h.querySelector('.tune-out')!.addEventListener('dblclick', () => reset(k));
    return h;
  }

  function rangeRow(k: NumKey) {
    const r = RANGES[k];
    const row = document.createElement('div');
    row.className = 'tune-row';
    row.dataset.key = k;
    const id = `tune-${k}`;
    row.appendChild(head(k, id));
    const wrap = document.createElement('div');
    wrap.className = 'tune-track';
    wrap.style.setProperty('--def', `${pct(k, TUNE_DEFAULTS[k])}%`);
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'tune-range';
    input.id = id;
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(r.step);
    input.addEventListener('input', () => set({ [k]: +input.value } as Partial<Tune>));
    input.addEventListener('dblclick', () => reset(k));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        reset(k);
      }
    });
    wrap.append(input);
    // A notch under the track marks the default, so the way back is always visible.
    const notch = document.createElement('i');
    notch.className = 'tune-notch';
    notch.setAttribute('aria-hidden', 'true');
    wrap.append(notch);
    // While comparing, a ghost thumb shows where the default sits.
    const ghost = document.createElement('i');
    ghost.className = 'tune-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    wrap.append(ghost);
    // Plain words for the two ends. Every slider row keeps this line (empty where the track
    // already says it, like Hue), so all rows share one height.
    const ends = (t.ends as Partial<Record<NumKey, string[]>>)[k] ?? ['', ''];
    const cap = document.createElement('div');
    cap.className = 'tune-ends';
    cap.setAttribute('aria-hidden', 'true');
    for (const word of ends) cap.appendChild(document.createElement('span')).textContent = word;
    wrap.append(cap);
    row.appendChild(wrap);
    // Reset comes after the control in tab order; CSS still shows it beside the value.
    row.appendChild(row.querySelector('.tune-reset')!);
    return row;
  }

  /**
   * Light direction is a circle, so it gets a dial that wraps round: drag the sun on its rim,
   * or focus it and use the arrow keys. A mini card in the middle shows which way is up.
   */
  function dialRow(k: 'lightAngle') {
    const row = document.createElement('div');
    row.className = 'tune-row tune-row-dial';
    row.dataset.key = k;
    row.appendChild(head(k, null));
    const body = document.createElement('div');
    body.className = 'tune-dial-body';
    const dial = document.createElement('div');
    dial.className = 'tune-dial';
    dial.tabIndex = 0;
    dial.setAttribute('role', 'slider');
    dial.setAttribute('aria-labelledby', `tuneLabel-${k}`);
    dial.setAttribute('aria-valuemin', '0');
    dial.setAttribute('aria-valuemax', '359');
    dial.innerHTML = `<i class="tune-dial-card" aria-hidden="true"></i><i class="tune-dial-knob" aria-hidden="true">${svg('light')}</i>`;
    const turn = (deg: number) => set({ lightAngle: ((Math.round(deg) % 360) + 360) % 360 });
    const aim = (e: PointerEvent) => {
      const r = dial.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 4) return;
      turn((Math.atan2(dx, -dy) * 180) / Math.PI);
    };
    dial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dial.setPointerCapture(e.pointerId);
      dial.focus({ preventScroll: true });
      dial.classList.add('is-dragging');
      aim(e);
    });
    dial.addEventListener('pointermove', (e) => dial.hasPointerCapture(e.pointerId) && aim(e));
    for (const ev of ['pointerup', 'pointercancel'] as const) dial.addEventListener(ev, () => dial.classList.remove('is-dragging'));
    dial.addEventListener('dblclick', () => reset(k));
    dial.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 15 : 5;
      const map: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
      if (e.key in map) turn(tuneNow().lightAngle + map[e.key]);
      else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Home') reset(k);
      else return;
      e.preventDefault();
    });
    const help = document.createElement('p');
    help.className = 'tune-help';
    help.textContent = t.sunHelp;
    body.append(dial, help);
    row.appendChild(body);
    row.appendChild(row.querySelector('.tune-reset')!);
    return row;
  }

  /** A little holo swatch at the top of the Pattern tab that zooms, turns and tints live. */
  function sampleRow() {
    const row = document.createElement('div');
    row.className = 'tune-sample-row';
    row.innerHTML = '<div class="tune-sample" aria-hidden="true"><i></i></div><p class="tune-help"></p>';
    row.querySelector('p')!.textContent = t.swatch;
    return row;
  }

  function choiceRow(k: ChoiceKey) {
    const row = document.createElement('div');
    row.className = 'tune-row tune-row-choice';
    row.dataset.key = k;
    row.appendChild(head(k, null));
    const group = document.createElement('div');
    group.className = 'seg tune-seg';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', `tuneLabel-${k}`);
    const options: string[] = k === 'light' ? LIGHT_MODES.filter((m) => m !== 'gyro' || hasGyro) : k === 'idle' ? IDLE_MODES : METALS;
    group.style.gridTemplateColumns = `repeat(${options.length}, 1fr)`;
    for (const v of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn tune-opt';
      b.classList.toggle('is-default', v === TUNE_DEFAULTS[k]);
      b.dataset.value = v;
      b.setAttribute('role', 'radio');
      b.innerHTML = `${svg(v)}<span></span>`;
      b.querySelector('span')!.textContent = formatChoice(k, v, t);
      b.addEventListener('click', () => choose(k, v));
      group.appendChild(b);
    }
    group.addEventListener('keydown', (e) => {
      const items = [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        reset(k);
        group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
        return;
      }
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const n = (i + dir + items.length) % items.length;
      items[n].click();
      items[n].focus();
    });
    row.appendChild(group);
    const help = document.createElement('p');
    help.className = 'tune-help';
    row.appendChild(help);
    row.appendChild(row.querySelector('.tune-reset')!);
    return row;
  }

  function choose(k: ChoiceKey, v: string) {
    if (tuneNow()[k] === v) return;
    sfx.tick();
    // Picking Gyro starts the sensor from the store listener below (still inside this tap,
    // which iOS needs for its permission prompt).
    if (k === 'light') gyroNote = v === 'gyro' ? 'wait' : null;
    set({ [k]: v } as Partial<Tune>);
  }

  function selectTab(id: Tab, quiet = false) {
    if (!quiet && id !== tab) sfx.tick();
    tab = id;
    if (!quiet) {
      // Show the new tab's controls, not just its label, when the drawer runs past the fold.
      requestAnimationFrame(() =>
        root.querySelector('.tune-panes')?.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }),
      );
    }
    root.querySelectorAll<HTMLButtonElement>('.tune-tab').forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    root.querySelectorAll<HTMLElement>('.tune-pane').forEach((p) => (p.hidden = p.id !== `tunePane-${id}`));
  }

  // ---------- Sync ----------

  function sync() {
    const s = store.get();
    const tune = s.tune;
    const changed = changedKeys(tune);
    root.classList.toggle('is-open', s.tuneOpen);
    toggle.classList.toggle('is-open', s.tuneOpen);
    toggle.setAttribute('aria-expanded', String(s.tuneOpen));
    root.querySelector<HTMLElement>('.tune-body')!.hidden = !s.tuneOpen;
    const badge = toggle.querySelector<HTMLElement>('.tune-badge')!;
    badge.hidden = !changed.length;
    badge.textContent = t.changed.replace('{n}', String(changed.length));
    // The badge is just a number on screen; spell it out for screen readers.
    const label = changed.length ? `${t.toggle} (${t.changed.replace('{n}', String(changed.length))})` : t.toggle;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    if (undo && changed.length) {
      // Anything changed after a reset makes the undo offer stale.
      undo = null;
      clearTimeout(undoTimer);
    }
    root.querySelector<HTMLElement>('.tune-reset-all')!.hidden = !changed.length;
    root.querySelector<HTMLElement>('.tune-undo')!.hidden = !undo;
    // Right after a reset, the dock says what happened next to the Undo it offers.
    const done = root.querySelector<HTMLElement>('.tune-undo-msg')!;
    done.hidden = !undo;
    done.querySelector('b')!.textContent = t.resetDone;
    done.querySelector('small')!.textContent = t.undoHint;
    root.querySelector<HTMLElement>('.tune-compare')!.hidden = !changed.length;
    // The dock always carries the hint; its button row only when there is something to do.
    root.querySelector<HTMLElement>('.tune-dock-row')!.hidden = !changed.length && !undo && !peek.shown;
    peek.setActive(s.tuneOpen);

    for (const def of TABS) {
      const n = def.keys.filter((k) => changed.includes(k)).length;
      root.querySelector<HTMLElement>(`#tuneTab-${def.id} .tune-dot`)!.hidden = !n;
    }

    root.querySelectorAll<HTMLElement>('.tune-row').forEach((row) => {
      const k = row.dataset.key as Key;
      const isChanged = changed.includes(k);
      row.classList.toggle('is-changed', isChanged);
      const out = row.querySelector('output')!;
      const btn = row.querySelector<HTMLButtonElement>('.tune-reset')!;
      const label = t.label[k];
      if (k === 'light' || k === 'idle' || k === 'metal') {
        const v = tune[k];
        out.textContent = formatChoice(k, v, t);
        row.querySelectorAll<HTMLButtonElement>('[role=radio]').forEach((b) => {
          const on = b.dataset.value === v;
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on ? 0 : -1;
        });
        const help = row.querySelector('.tune-help')!;
        help.textContent = k === 'light' ? t.lightHelp[tune.light] : k === 'idle' ? t.idleHelp[tune.idle] : t.metalHelp;
        btn.setAttribute('aria-label', t.reset.replace('{name}', label).replace('{value}', formatChoice(k, TUNE_DEFAULTS[k], t)));
      } else if (k === 'lightAngle') {
        const v = tune[k];
        const dial = row.querySelector<HTMLElement>('.tune-dial')!;
        dial.style.setProperty('--a', `${v}deg`);
        out.textContent = format(k, v, t);
        dial.setAttribute('aria-valuenow', String(v));
        dial.setAttribute('aria-valuetext', format(k, v, t));
        btn.setAttribute('aria-label', t.reset.replace('{name}', label).replace('{value}', format(k, TUNE_DEFAULTS[k], t)));
      } else {
        const v = tune[k];
        const input = row.querySelector<HTMLInputElement>('input')!;
        if (+input.value !== v) input.value = String(v);
        const text = format(k, v, t);
        out.textContent = text;
        input.setAttribute('aria-valuetext', text);
        input.style.setProperty('--track', trackFor(k, v));
        btn.setAttribute('aria-label', t.reset.replace('{name}', label).replace('{value}', format(k, TUNE_DEFAULTS[k], t)));
        const extra = row.querySelector<HTMLElement>('.tune-extra')!;
        if (k === 'temp') extra.innerHTML = `<i class="tune-swatch" style="--sw:${lightCss(v)}"></i>`;
      }
      btn.title = btn.getAttribute('aria-label')!;
      btn.disabled = !isChanged;
    });

    const sample = root.querySelector<HTMLElement>('.tune-sample');
    if (sample) {
      sample.style.setProperty('--s', String(tune.scale));
      sample.style.setProperty('--a', `${tune.angle}deg`);
      sample.style.setProperty('--h', `${tune.hue}deg`);
      sample.style.setProperty('--sat', String(tune.sat));
    }

    // The direction only matters for a fixed light; the others are dimmed with a reason when
    // the current finish or mode makes them do nothing.
    const row = (k: Key) => root.querySelector<HTMLElement>(`.tune-row[data-key="${k}"]`)!;
    row('lightAngle').hidden = tune.light !== 'fixed';
    for (const def of TABS) {
      const reasons = new Map(def.keys.map((k) => [k, whyIdle(k, s)]));
      // A reason shared by several rows is said once at the top of the tab, not on each row.
      const counts = new Map<string, number>();
      for (const r of reasons.values()) if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
      const shared = [...counts].find(([, n]) => n > 1)?.[0] ?? null;
      const pane = root.querySelector<HTMLElement>(`#tunePane-${def.id}`)!;
      const banner = whyLine(pane, `tuneWhyTab-${def.id}`, pane.firstElementChild);
      banner.classList.add('tune-why-tab');
      banner.textContent = shared ?? '';
      banner.hidden = !shared;
      for (const k of def.keys) {
        const r = row(k);
        const reason = reasons.get(k) ?? null;
        r.classList.toggle('is-dim', !!reason);
        const why = whyLine(r, `tuneWhy-${k}`, r.querySelector('.tune-reset'));
        const own = reason && reason !== shared ? reason : null;
        why.textContent = own ?? '';
        why.hidden = !own;
        const control = r.querySelector('input, [role=radiogroup], [role=slider]')!;
        if (reason) control.setAttribute('aria-describedby', own ? why.id : banner.id);
        else control.removeAttribute('aria-describedby');
      }
    }
    sun.update({ show: s.tuneOpen && tune.light === 'fixed' && !motion.comparing, angle: tune.lightAngle, label: t.sun, title: t.sunHelp, keys: t.sunKeys });

    const note = root.querySelector<HTMLElement>('.tune-note')!;
    let msg = '';
    if (gyroNote === 'denied') msg = t.gyroDenied;
    else if (tune.light === 'gyro' && gyroNote === 'wait' && !motion.gyroLive()) msg = t.gyroWait;
    note.textContent = msg;
    note.hidden = !msg;
  }

  function whyLine(host: HTMLElement, id: string, before: Element | null) {
    let el = host.querySelector<HTMLElement>(`#${id}`);
    if (!el) {
      el = document.createElement('p');
      el.className = 'tune-why';
      el.id = id;
      host.insertBefore(el, before);
    }
    return el;
  }

  /** Why a control has no visible effect right now, or null when it does. */
  function whyIdle(k: Key, s: State): string | null {
    const tune = s.tune;
    if (k === 'metal' && s.edition !== 'relief') return t.why.relief;
    const finish = ['scale', 'angle', 'hue', 'sat', 'metal', 'sparkle', 'sparkleSize'].includes(k);
    if (finish && s.edition === 'base') return t.why.base;
    if ((finish || k === 'glare' || k === 'sharp' || k === 'temp') && s.intensity <= 0 && s.edition !== 'base') return t.why.strength;
    if (k === 'sparkleSize' && tune.sparkle <= 0) return t.why.sparkle;
    if (k === 'sharp' && tune.glare <= 0) return t.why.glare;
    if (k === 'temp' && tune.glare <= 0 && (tune.sparkle <= 0 || s.edition === 'base')) return t.why.temp;
    if (reduced.matches && (k === 'speed' || k === 'idle' || (k === 'light' && tune.light === 'orbit'))) return t.why.reduced;
    // Glitter twinkles on its own clock, so Speed matters whenever it shows.
    const glitter = tune.sparkle > 0 && s.edition !== 'base' && s.intensity > 0;
    if (k === 'speed' && tune.light !== 'orbit' && tune.idle === 'none' && !ANIMATED.has(s.edition) && !glitter) return t.why.still;
    return null;
  }

  function announce(msg: string) {
    const live = document.getElementById('announcer');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => (live.textContent = msg), 60);
  }

  build();
  // The actions dock and the phone preview sit just above the sticky Export bar; measure it
  // (and the dock) rather than guess, since both change with width and scaling.
  {
    const html = document.documentElement.style;
    const exp = document.querySelector<HTMLElement>('.sec-export');
    const measure = () => {
      if (exp) html.setProperty('--tune-export-h', `${exp.offsetHeight}px`);
      const dock = root.querySelector<HTMLElement>('.tune-dock');
      html.setProperty('--tune-dock-h', `${dock && !dock.hidden && store.get().tuneOpen ? dock.offsetHeight : 0}px`);
    };
    const ro = new ResizeObserver(measure);
    if (exp) ro.observe(exp);
    ro.observe(root);
    measure();
  }
  if (tuneNow().light === 'gyro') {
    // A gyro light saved last visit needs its sensor again. Where that takes a tap (iOS),
    // fall back to the pointer and say why.
    void motion.enableGyro().then((r) => {
      if (r === 'ok') return;
      gyroNote = 'denied';
      set({ light: 'pointer' });
    });
  }
  // The sensor runs only while Gyro is the light, however it got there (a pick, Reset all, Undo).
  let lightWas = tuneNow().light;
  store.on((s, changed) => {
    if (changed.has('tune') && s.tune.light !== lightWas) {
      lightWas = s.tune.light;
      if (lightWas !== 'gyro') motion.disableGyro();
      else
        void motion.enableGyro().then((r) => {
          if (r !== 'ok') {
            gyroNote = 'denied';
            set({ light: 'pointer' });
          } else sync();
        });
    }
    if (changed.has('lang')) build();
    else if (changed.has('tune') || changed.has('tuneOpen') || changed.has('edition') || changed.has('intensity')) sync();
  });
  reduced.addEventListener('change', sync);
  // A gyro that starts reporting clears the "tilt your device" note.
  setInterval(() => {
    if (gyroNote === 'wait' && motion.gyroLive()) {
      gyroNote = null;
      sync();
    }
  }, 500);
}
