// The panel's "Shine" tab: three groups of controls (pattern, light, motion). Every
// control shows its value, can be reset on its own, and double-click / Delete puts it back.
import './tune.css';
import { dictOf, type Dict } from '../i18n';
import type { State, Store } from '../state';
import { editionById, type EditionId } from '../editions';
import { sfx } from '../audio';
import {
  changedKeys,
  exportLoop,
  isDefault,
  LIGHT_MODES,
  lightCss,
  METALS,
  MOTION_GROUPS,
  MOTION_ORDER,
  OWN_LIGHT,
  RANGES,
  TUNE_DEFAULTS,
  type ChoiceKey,
  type IdleMode,
  type NumKey,
  type Tune,
} from './model';
import { motion } from './motion';
import { mountPeek } from './peek';
import { mountSunHandle } from './handle';
import { svg } from './icons';
import './motionIcons';
import { format } from './format';
import './acts.css';

type Group = 'pattern' | 'light' | 'motion';
type Key = NumKey | ChoiceKey;

const GROUPS: { id: Group; keys: Key[] }[] = [
  { id: 'pattern', keys: ['scale', 'angle', 'hue', 'sat', 'metal'] },
  { id: 'light', keys: ['glare', 'sharp', 'temp', 'sparkle', 'sparkleSize'] },
  { id: 'motion', keys: ['light', 'lightAngle', 'speed', 'tiltMax', 'idle', 'idleAmp'] },
];


/** Finishes with their own animation (they read the shader clock), so Speed always shows. */
const ANIMATED = new Set<EditionId>(['gold', 'galaxy', 'glitch', 'aurora', 'magma', 'sakura', 'shallows', 'warmth', 'glow', 'blacklight', 'neon', 'plasma', 'stardust', 'snowglobe', 'rain', 'kintsugi', 'opal', 'confetti', 'fireworks', 'liquidmetal']);


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

export function mountTune(store: Store, root: HTMLElement): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let t = dictOf(store.get().lang).tune;
  /** What "Reset all" replaced, offered back for a few seconds. */
  let undo: Tune | null = null;
  let undoTimer = 0;
  const touch = matchMedia('(pointer: coarse)').matches;
  const peek = mountPeek();
  document.querySelector('.sec-export')?.prepend(peek.el);
  const sun = mountSunHandle((deg) => set({ lightAngle: deg }), () => Math.cos(motion.spinAngle));
  // A stamp on the card while "Hold to compare" shows the defaults.
  const stamp = document.createElement('span');
  stamp.className = 'tune-stamp';
  stamp.setAttribute('aria-hidden', 'true');
  document.getElementById('cardSlot')?.appendChild(stamp);

  root.classList.add('tune');
  /** True while this tab is the one showing. */
  const shown = () => store.get().adjustOpen && store.get().panelTab === 'light';

  const tuneNow = () => store.get().tune;
  const set = (patch: Partial<Tune>) => store.set({ tune: { ...tuneNow(), ...patch } });
  const reset = (k: Key) => {
    if (isDefault(tuneNow(), k)) return;
    sfx.tick();
    set({ [k]: TUNE_DEFAULTS[k] } as Partial<Tune>);
  };

  // ---------- Build ----------

  function build() {
    t = dictOf(store.get().lang).tune;
    root.innerHTML = `
        <div class="tune-groups"></div>
        <p class="hint tune-hint"></p>
        <div class="tune-dock">
          <div class="tune-actions">
            <button class="tune-compare" type="button" aria-pressed="false">${svg('eye')}<span class="tune-long"></span><span class="tune-short"></span></button>
            <p class="tune-undo-msg" hidden><b></b><small></small></p>
            <button class="tune-reset-all" type="button">${svg('reset')}<span></span></button>
            <button class="tune-undo" type="button" hidden>${svg('reset')}<span></span></button>
          </div>
        </div>`;
    root.querySelector('.tune-hint')!.textContent = touch ? t.hintTouch : t.hint;
    root.querySelector('.tune-reset-all span')!.textContent = t.resetAll;
    root.querySelector('.tune-undo span')!.textContent = t.undo;
    stamp.textContent = t.stamp;
    peek.setLabel(t.peek, t.peekCap);
    bindCompare(root.querySelector<HTMLButtonElement>('.tune-compare')!);
    const groups = root.querySelector<HTMLElement>('.tune-groups')!;
    for (const def of GROUPS) {
      const group = document.createElement('section');
      group.className = 'tune-group';
      group.id = `tuneGroup-${def.id}`;
      group.setAttribute('aria-labelledby', `tuneGroupTitle-${def.id}`);
      group.innerHTML = `<h3 class="group-title" id="tuneGroupTitle-${def.id}">${svg(def.id)}<span></span></h3>`;
      group.querySelector('span')!.textContent = t.groups[def.id];
      if (def.id === 'pattern') group.appendChild(sampleRow());
      for (const k of def.keys)
        group.appendChild(k === 'light' || k === 'idle' || k === 'metal' ? choiceRow(k) : k === 'lightAngle' ? dialRow(k) : rangeRow(k));
      groups.appendChild(group);
    }
    root.querySelector('.tune-reset-all')!.addEventListener('click', () => {
      if (!changedKeys(tuneNow()).length) return;
      sfx.tick();
      const before = tuneNow();
      store.set({ tune: { ...TUNE_DEFAULTS } });
      announce(t.resetDone);
      // Offer the old settings back for a moment; focus moves to that offer.
      undo = before;
      clearTimeout(undoTimer);
      undoTimer = window.setTimeout(() => {
        const had = root.contains(document.activeElement) && document.activeElement?.classList.contains('tune-undo');
        undo = null;
        sync();
        if (had) root.querySelector<HTMLElement>('.tune-range')?.focus();
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

  /** A little holo swatch at the top of the Pattern group that zooms, turns and tints live. */
  function sampleRow() {
    const row = document.createElement('div');
    row.className = 'tune-sample-row';
    row.innerHTML = '<div class="tune-sample" aria-hidden="true"><i></i></div><p class="tune-help"></p>';
    row.querySelector('p')!.textContent = t.sampleNote;
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
    const options: string[] = k === 'light' ? LIGHT_MODES : k === 'idle' ? MOTION_ORDER : METALS;
    // The motions show in their four groups (as in the tray above the deck), None closing the first.
    const motions = k === 'idle' ? motionRows(group) : null;
    if (!motions) group.style.gridTemplateColumns = `repeat(${options.length}, 1fr)`;
    for (const v of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn tune-opt';
      b.classList.toggle('is-default', v === TUNE_DEFAULTS[k]);
      b.dataset.value = v;
      b.setAttribute('role', 'radio');
      b.innerHTML = `${svg(v)}<span></span>`;
      b.querySelector('span')!.textContent = formatChoice(k, v, t);
      // What each motion does, before it is picked.
      if (k === 'idle') b.title = t.idleHelp[v as Tune['idle']];
      b.addEventListener('click', () => choose(k, v));
      (motions?.get(v as IdleMode) ?? group).appendChild(b);
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

  /** The motion groups as labelled rows inside the radio group; answers which row each motion goes in. */
  function motionRows(group: HTMLElement): Map<IdleMode, HTMLElement> {
    group.classList.add('tune-motions');
    const rows = new Map<IdleMode, HTMLElement>();
    for (const g of MOTION_GROUPS) {
      const label = document.createElement('p');
      label.className = 'tune-mgroup';
      label.dataset.group = g.id;
      label.textContent = t.motionGroup[g.id];
      const line = document.createElement('div');
      line.className = 'tune-mrow';
      line.dataset.group = g.id;
      group.append(label, line);
      for (const m of g.motions) rows.set(m, line);
    }
    rows.set('none', rows.get('sway')!);
    return rows;
  }

  function choose(k: ChoiceKey, v: string) {
    if (tuneNow()[k] === v) return;
    sfx.tick();
    set({ [k]: v } as Partial<Tune>);
  }

  // ---------- Sync ----------

  function sync() {
    const s = store.get();
    const tune = s.tune;
    const changed = changedKeys(tune);
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
    // The dock only shows when it has something to offer: changes to compare or reset, or an undo.
    root.querySelector<HTMLElement>('.tune-dock')!.hidden = !changed.length && !undo;
    peek.setActive(shown());

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
        help.textContent = k === 'light' ? t.lightHelp[tune.light] : k === 'idle' ? motionHelp(s) : t.metalHelp;
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
    // The metal only shows on Relief, so it stays out of sight until the Metal pack is opened and Relief picked.
    row('metal').hidden = s.edition !== 'relief';
    for (const def of GROUPS) {
      const reasons = new Map(def.keys.map((k) => [k, whyIdle(k, s)]));
      // A reason shared by several rows is said once at the top of the group, not on each row.
      const counts = new Map<string, number>();
      for (const r of reasons.values()) if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
      const shared = [...counts].find(([, n]) => n > 1)?.[0] ?? null;
      const group = root.querySelector<HTMLElement>(`#tuneGroup-${def.id}`)!;
      const banner = whyLine(group, `tuneWhyGroup-${def.id}`, group.querySelector('.group-title')!.nextElementSibling);
      banner.classList.add('tune-why-group');
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
    sun.update({ show: shown() && tune.light === 'fixed' && !motion.comparing, angle: tune.lightAngle, label: t.sun, title: t.sunHelp, keys: t.sunKeys });
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

  /** What the motion does, how long its loop is, and that a file moves just so. */
  function motionHelp(s: State): string {
    if (s.tune.idle === 'none') return t.idleHelp.none;
    const secs = exportLoop(s.tune, undefined, !!editionById(s.edition).torch).loopMs / 1000;
    const loop = t.loopLen.replace('{s}', String(Math.round(secs * 10) / 10));
    return t.motionHelp.replace('{help}', t.idleHelp[s.tune.idle]).replace('{loop}', loop).replace('{note}', t.trayNote);
  }

  /** Why a control has no visible effect right now, or null when it does. */
  function whyIdle(k: Key, s: State): string | null {
    const tune = s.tune;
    if (k === 'metal' && s.edition !== 'relief') return null;
    const finish = ['scale', 'angle', 'hue', 'sat', 'metal', 'sparkle', 'sparkleSize'].includes(k);
    if (finish && s.edition === 'base') return t.why.base;
    if ((finish || k === 'glare' || k === 'sharp' || k === 'temp') && s.intensity <= 0 && s.edition !== 'base') return t.why.strength;
    if (k === 'sparkleSize' && tune.sparkle <= 0) return t.why.sparkle;
    if (k === 'sharp' && tune.glare <= 0) return t.why.glare;
    if (k === 'temp' && tune.glare <= 0 && (tune.sparkle <= 0 || s.edition === 'base')) return t.why.temp;
    if ((k === 'light' || k === 'lightAngle') && OWN_LIGHT.has(tune.idle)) return t.why.ownLight;
    if (reduced.matches && (k === 'speed' || k === 'idle' || k === 'idleAmp' || (k === 'light' && tune.light === 'orbit'))) return t.why.reduced;
    if (k === 'idleAmp' && tune.idle === 'none') return t.why.noIdle;
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
  // The actions dock sits just above the sticky Export bar (see --export-h in main.ts); measure
  // it rather than guess, since it changes with width and scaling.
  {
    const measure = () => {
      const dock = root.querySelector<HTMLElement>('.tune-dock');
      document.documentElement.style.setProperty('--tune-dock-h', `${dock && !dock.hidden && shown() ? dock.offsetHeight : 0}px`);
    };
    new ResizeObserver(measure).observe(root);
    measure();
  }
  store.on((_, changed) => {
    if (changed.has('lang')) build();
    else if (['tune', 'adjustOpen', 'panelTab', 'edition', 'intensity'].some((k) => changed.has(k as keyof State))) sync();
  });
  reduced.addEventListener('change', sync);
}
