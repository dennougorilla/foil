// The "Fine-tune light & motion" drawer in the Tune section. Closed by default; opening it
// reveals three tabs of controls. Every control shows its value, can be reset on its own,
// and double-click / Delete puts it back to the default.
import './tune.css';
import { DICTS, type Dict } from '../i18n';
import type { Store } from '../state';
import { sfx } from '../audio';
import {
  changedKeys,
  fixedLight,
  IDLE_MODES,
  isDefault,
  LIGHT_MODES,
  lightCss,
  RANGES,
  TUNE_DEFAULTS,
  type ChoiceKey,
  type NumKey,
  type Tune,
} from './model';
import { gyroAvailable, motion } from './motion';
import { mountPeek } from './peek';

type Tab = 'pattern' | 'light' | 'motion';
type Key = NumKey | ChoiceKey;

const TABS: { id: Tab; keys: Key[] }[] = [
  { id: 'pattern', keys: ['scale', 'angle', 'hue', 'sat'] },
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
  reset: '<path d="M7 2h4v1h1v1h1v1h1v5h-1v1h-1v1h-1v1H6v-2h4v-1h1V6h-1V5H7v1H6v1h2v2H2V3h2v2h1V4h1V3h1z"/>',
  chevron: '<path d="M5 3h2v2h2v2h2v2H9v2H7v2H5v-2h2V9h2V7H7V5H5z"/>',
};

const svg = (name: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);

function format(k: NumKey, v: number, t: Dict['tune']): string {
  switch (k) {
    case 'scale':
    case 'sharp':
    case 'sparkleSize':
      return `×${v.toFixed(2)}`;
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
      return v <= 0 ? t.off : `${Math.round(v * 100)}%`;
    case 'temp':
      return `${Math.round(v)}K`;
    case 'speed':
      return v <= 0 ? t.stopped : `×${v.toFixed(2)}`;
  }
}

const formatChoice = (k: ChoiceKey, v: string, t: Dict['tune']) =>
  k === 'light' ? t.lightMode[v as Tune['light']] : t.idleMode[v as Tune['idle']];

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
  const peek = mountPeek();
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
        <div class="tune-tabs" role="tablist"></div>
        <div class="tune-panes"></div>
        <div class="tune-foot">
          <p class="tune-hint"></p>
          <div class="tune-actions">
            <button class="tune-compare" type="button" aria-pressed="false"><span></span></button>
            <button class="tune-reset-all" type="button">${svg('reset')}<span></span></button>
            <button class="tune-undo" type="button" hidden>${svg('reset')}<span></span></button>
          </div>
        </div>
      </div>`;
    toggle.querySelector('.tune-toggle-label')!.textContent = t.toggleShort;
    toggle.title = t.toggle;
    root.querySelector('.tune-hint')!.textContent = touch ? t.hintTouch : t.hint;
    root.querySelector('.tune-reset-all span')!.textContent = t.resetAll;
    root.querySelector('.tune-undo span')!.textContent = t.undo;
    stamp.textContent = t.stamp;
    peek.setLabel(t.peek);
    bindCompare(root.querySelector<HTMLButtonElement>('.tune-compare')!);
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
      for (const k of def.keys) pane.appendChild(k === 'light' || k === 'idle' ? choiceRow(k) : rangeRow(k));
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
    b.querySelector('span')!.textContent = t.compare;
    b.title = t.compareHelp;
    const hold = (on: boolean) => {
      if (motion.comparing === on) return;
      motion.comparing = on;
      b.setAttribute('aria-pressed', String(on));
      root.classList.toggle('is-comparing', on);
      stamp.classList.toggle('is-on', on);
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
      (root.querySelector<HTMLElement>(`[data-key="${k}"] input`) ??
        root.querySelector<HTMLElement>(`[data-key="${k}"] [aria-checked="true"]`))?.focus();
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
    row.appendChild(wrap);
    // Reset comes after the control in tab order; CSS still shows it beside the value.
    row.appendChild(row.querySelector('.tune-reset')!);
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
    const options: string[] = k === 'light' ? LIGHT_MODES.filter((m) => m !== 'gyro' || hasGyro) : IDLE_MODES;
    group.style.gridTemplateColumns = `repeat(${options.length}, 1fr)`;
    for (const v of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn tune-opt';
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
    if (k === 'light' && v === 'gyro') {
      gyroNote = 'wait';
      set({ light: 'gyro' });
      void motion.enableGyro().then((r) => {
        if (r !== 'ok') {
          gyroNote = 'denied';
          set({ light: 'pointer' });
        } else sync();
      });
      return;
    }
    if (k === 'light') gyroNote = null;
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
    badge.textContent = String(changed.length);
    // The badge is just a number on screen; spell it out for screen readers.
    toggle.setAttribute('aria-label', changed.length ? `${t.toggle} (${t.changed.replace('{n}', String(changed.length))})` : t.toggle);
    if (undo && changed.length) {
      // Anything changed after a reset makes the undo offer stale.
      undo = null;
      clearTimeout(undoTimer);
    }
    root.querySelector<HTMLElement>('.tune-reset-all')!.hidden = !changed.length;
    root.querySelector<HTMLElement>('.tune-undo')!.hidden = !undo;
    root.querySelector<HTMLElement>('.tune-compare')!.hidden = !changed.length;
    root.querySelector<HTMLElement>('.tune-foot')!.classList.toggle('has-actions', !!changed.length || !!undo);
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
      if (k === 'light' || k === 'idle') {
        const v = tune[k];
        out.textContent = formatChoice(k, v, t);
        row.querySelectorAll<HTMLButtonElement>('[role=radio]').forEach((b) => {
          const on = b.dataset.value === v;
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on ? 0 : -1;
        });
        const help = row.querySelector('.tune-help')!;
        help.textContent = k === 'light' ? t.lightHelp[tune.light] : t.idleHelp[tune.idle];
        btn.setAttribute('aria-label', t.reset.replace('{name}', label).replace('{value}', formatChoice(k, TUNE_DEFAULTS[k], t)));
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
        else if (k === 'lightAngle') {
          const [x, y] = fixedLight(v);
          const pad = extra.querySelector<HTMLElement>('.tune-pad') ?? lightPad(extra);
          pad.style.setProperty('--x', `${(x * 100).toFixed(1)}%`);
          pad.style.setProperty('--y', `${(y * 100).toFixed(1)}%`);
        }
      }
      btn.title = btn.getAttribute('aria-label')!;
      btn.disabled = !isChanged;
    });

    // Only show the controls that do something right now.
    const row = (k: Key) => root.querySelector<HTMLElement>(`.tune-row[data-key="${k}"]`)!;
    row('lightAngle').hidden = tune.light !== 'fixed';
    const dim = tune.sparkle <= 0;
    row('sparkleSize').classList.toggle('is-dim', dim);
    row('sparkleSize').title = dim ? t.sparkleDim : '';

    const note = root.querySelector<HTMLElement>('.tune-note')!;
    let msg = '';
    if (reduced.matches) msg = t.reduced;
    else if (gyroNote === 'denied') msg = t.gyroDenied;
    else if (tune.light === 'gyro' && gyroNote === 'wait' && !motion.gyroLive()) msg = t.gyroWait;
    note.textContent = msg;
    note.hidden = !msg;
  }

  /**
   * A tiny card you can drag the light around. Pointer-only shortcut: the slider beside it
   * stays the accessible control, so the pad is hidden from assistive tech.
   */
  function lightPad(host: HTMLElement) {
    const pad = document.createElement('i');
    pad.className = 'tune-pad';
    pad.innerHTML = '<b></b>';
    host.appendChild(pad);
    const aim = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      if (Math.hypot(dx, dy) < 0.04) return;
      const deg = (Math.round((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360;
      set({ lightAngle: deg });
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      pad.classList.add('is-dragging');
      aim(e);
    });
    pad.addEventListener('pointermove', (e) => pad.hasPointerCapture(e.pointerId) && aim(e));
    const end = () => pad.classList.remove('is-dragging');
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    return pad;
  }

  function announce(msg: string) {
    const live = document.getElementById('announcer');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => (live.textContent = msg), 60);
  }

  build();
  store.on((_s, changed) => {
    if (changed.has('lang')) build();
    else if (changed.has('tune') || changed.has('tuneOpen')) sync();
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
