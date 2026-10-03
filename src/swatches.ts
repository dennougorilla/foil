// Custom colours: extra frame colours after the frame presets, and a backdrop row for the swirl.
// Picked colours are kept as swatches (in the store, so they come back next visit) and can be removed.
import { sfx } from './audio';
import { editionById } from './editions';
import { BACKDROPS, backdropSwirl, isHex, swirlFrom, type Swirl } from './palette';
import type { Dict } from './i18n';
import type { Stage } from './stage';
import type { State, Store } from './state';

export interface SwatchHost {
  store: Store;
  stage: Stage;
  t: () => Dict;
  announce: (msg: string) => void;
  redrawFace: () => void;
  rebuildFrames: () => void;
}

const MAX = 8;

interface Strip {
  /** Saved custom colours, oldest first. */
  list: keyof Pick<State, 'frameSwatches' | 'stageSwatches'>;
  /** The store field the choice is written to. */
  field: keyof Pick<State, 'frameColor' | 'stageColor'>;
  addLabel: () => string;
}

const FRAME: Strip = { list: 'frameSwatches', field: 'frameColor', addLabel: () => '' };
const STAGE: Strip = { list: 'stageSwatches', field: 'stageColor', addLabel: () => '' };

const swirlVars = (s: Swirl) => `--a:${s[0]};--b:${s[1]};--c:${s[2]}`;
const PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z" /></svg>';
const CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z" /></svg>';

export function initSwatches(host: SwatchHost) {
  const { store, stage } = host;
  FRAME.addLabel = () => host.t().addFrameColor;
  STAGE.addLabel = () => host.t().addStageColor;

  function radio(btn: HTMLElement, on: boolean) {
    btn.setAttribute('aria-checked', String(on));
    btn.tabIndex = on ? 0 : -1;
  }

  /** Moves a colour to the end of its list (newest), dropping the oldest past the limit. */
  function remember(strip: Strip, hex: string) {
    const t = host.t();
    const list = store.get()[strip.list].filter((c) => c.toLowerCase() !== hex.toLowerCase());
    list.push(hex);
    const full = list.length > MAX;
    if (full) list.shift();
    store.set({ [strip.list]: list, [strip.field]: hex } as Partial<State>);
    host.announce(full ? t.colorFull.replace('{n}', String(MAX)) : t.colorAdded.replace('{hex}', hex.toUpperCase()));
  }

  function forget(strip: Strip, hex: string) {
    const s = store.get();
    const patch: Partial<State> = { [strip.list]: s[strip.list].filter((c) => c !== hex) } as Partial<State>;
    if (s[strip.field] === hex) (patch as Record<string, string>)[strip.field] = '';
    sfx.tick();
    store.set(patch);
    host.announce(host.t().colorRemoved.replace('{hex}', hex.toUpperCase()));
  }

  /** One saved colour: a radio, with a small remove button that shows on hover or when chosen. */
  function chip(strip: Strip, hex: string, cls: string, style: string): HTMLElement {
    const t = host.t();
    const wrap = document.createElement('span');
    wrap.className = 'sw-item';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sw-chip ${cls}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('style', style);
    b.setAttribute('aria-label', t.myColor.replace('{hex}', hex.toUpperCase()));
    b.setAttribute('aria-keyshortcuts', 'Delete');
    b.setAttribute('aria-description', t.colorKeys);
    b.title = `${hex.toUpperCase()} — ${t.colorKeys}`;
    b.dataset.v = hex;
    radio(b, store.get()[strip.field] === hex);
    b.addEventListener('click', () => {
      if (store.get()[strip.field] === hex) return;
      sfx.tick();
      store.set({ [strip.field]: hex } as Partial<State>);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      e.stopPropagation();
      // Keep focus in the group: land on the neighbour, or the add button if it was the last one.
      const group = b.closest('[role=radiogroup]')!;
      forget(strip, hex);
      requestAnimationFrame(() => group.querySelector<HTMLElement>('[role=radio][tabindex="0"]')?.focus() ?? group.querySelector<HTMLElement>('.sw-add')?.focus());
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sw-del';
    del.tabIndex = -1;
    del.innerHTML = CROSS;
    del.setAttribute('aria-label', t.removeColor.replace('{hex}', hex.toUpperCase()));
    del.title = del.getAttribute('aria-label')!;
    del.addEventListener('click', () => forget(strip, hex));
    wrap.append(b, del);
    return wrap;
  }

  // One colour input serves every "+": it lives outside the strips, which are rebuilt as the preview changes.
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'sw-input';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  document.body.appendChild(input);
  let target: Strip = FRAME;
  let before = '';
  input.addEventListener('input', () => {
    store.set({ [target.field]: input.value } as Partial<State>);
  });
  input.addEventListener('change', () => {
    if (input.value === before) return;
    remember(target, input.value);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[role=radio][data-v="${input.value}"]`)?.focus());
  });

  /**
   * The "+" opens the system colour picker. Dragging in it previews live on the card;
   * closing it with a new colour saves that colour as a swatch.
   */
  function addButton(strip: Strip, wide: boolean): HTMLElement {
    const t = host.t();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sw-add${wide ? ' is-wide' : ''}`;
    b.innerHTML = `${PLUS}<span>${t.addColor}</span>`;
    b.setAttribute('aria-label', strip.addLabel());
    b.title = strip.addLabel();
    b.addEventListener('click', () => {
      sfx.tick();
      target = strip;
      before = store.get()[strip.field];
      input.value = isHex(before) ? before : strip === FRAME ? '#e8b04a' : '#2a7a4f';
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

  // ---------- Frame: custom colours sit under the four presets, in the same radio group ----------

  /** Hook for main.ts: called each time the frame group is rebuilt. */
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
    for (const hex of s.frameSwatches) strip.appendChild(chip(FRAME, hex, 'sw-frame', `--sw:${hex}`));
    strip.appendChild(addButton(FRAME, !s.frameSwatches.length));
    fs.appendChild(strip);
    // A colour being previewed in the picker but not yet saved still needs one tabbable radio.
    if (custom && !s.frameSwatches.includes(s.frameColor)) {
      const cur = presets.find((b) => b.getAttribute('aria-checked') === 'true');
      if (!cur && presets[0]) presets[0].tabIndex = 0;
    }
  }

  // ---------- Backdrop: auto (follows the finish), a few presets, then custom colours ----------

  const bdField = document.createElement('div');
  bdField.className = 'field field-backdrop';
  bdField.innerHTML = '<span class="field-label" id="backdropLabel"></span><div class="sw-strip sw-strip-stage" role="radiogroup" aria-labelledby="backdropLabel"></div>';
  document.getElementById('frameSeg')!.closest('.field')!.after(bdField);
  const bdGroup = bdField.querySelector<HTMLElement>('.sw-strip')!;
  bdGroup.addEventListener('keydown', (e) => {
    const items = [...bdGroup.querySelectorAll<HTMLElement>('[role=radio]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (i < 0 || !dir) return;
    e.preventDefault();
    const n = (i + dir + items.length) % items.length;
    items[n].click();
    bdGroup.querySelectorAll<HTMLElement>('[role=radio]')[n]?.focus();
  });

  function buildBackdrop() {
    const s = store.get();
    const t = host.t();
    bdField.querySelector('.field-label')!.textContent = t.backdrop;
    bdGroup.textContent = '';
    const pick = (b: HTMLElement, v: string) =>
      b.addEventListener('click', () => {
        if (store.get().stageColor === v) return;
        sfx.tick();
        store.set({ stageColor: v });
      });
    const auto = document.createElement('button');
    auto.type = 'button';
    auto.className = 'sw-chip sw-stage sw-auto';
    auto.setAttribute('role', 'radio');
    auto.setAttribute('style', swirlVars(editionById(s.edition).swirl));
    auto.setAttribute('aria-label', t.backdropAuto);
    auto.title = t.backdropAuto;
    auto.innerHTML = `<i aria-hidden="true"></i><span>${t.backdropAutoShort}</span>`;
    auto.dataset.v = '';
    radio(auto, !s.stageColor);
    pick(auto, '');
    bdGroup.appendChild(auto);
    for (const p of BACKDROPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw-chip sw-stage';
      b.setAttribute('role', 'radio');
      b.setAttribute('style', swirlVars(p.swirl));
      b.setAttribute('aria-label', t.backdropName[p.id]);
      b.title = t.backdropName[p.id];
      b.dataset.v = p.id;
      radio(b, s.stageColor === p.id);
      pick(b, p.id);
      bdGroup.appendChild(b);
    }
    const sep = document.createElement('i');
    sep.className = 'sw-sep';
    sep.setAttribute('aria-hidden', 'true');
    bdGroup.appendChild(sep);
    for (const hex of s.stageSwatches) bdGroup.appendChild(chip(STAGE, hex, 'sw-stage', swirlVars(swirlFrom(hex))));
    bdGroup.appendChild(addButton(STAGE, false));
    // Previewing an unsaved colour: keep one radio reachable by Tab.
    if (!bdGroup.querySelector('[role=radio][tabindex="0"]')) auto.tabIndex = 0;
  }

  function syncStage() {
    stage.backdrop = backdropSwirl(store.get().stageColor);
  }

  // Anything odd left in storage falls back to the defaults rather than breaking the card.
  {
    const s = store.get();
    const clean = (v: unknown) => (Array.isArray(v) ? v.filter(isHex).slice(-MAX) : []);
    store.set({
      frameSwatches: clean(s.frameSwatches),
      stageSwatches: clean(s.stageSwatches),
      frameColor: isHex(s.frameColor) ? s.frameColor : '',
      stageColor: isHex(s.stageColor) || BACKDROPS.some((b) => b.id === s.stageColor) ? s.stageColor : '',
    });
  }

  store.on((_s, changed) => {
    if (changed.has('frameColor')) host.redrawFace();
    if (changed.has('frameColor') || changed.has('frameSwatches')) host.rebuildFrames();
    if (['stageColor', 'stageSwatches', 'edition', 'lang'].some((k) => changed.has(k as keyof State))) buildBackdrop();
    if (changed.has('stageColor')) syncStage();
  });

  syncStage();
  buildBackdrop();

  return {
    decorateFrames,
    applyText: buildBackdrop,
    /** Backdrop swirl for exported clips, or undefined to use the finish's own. */
    swirl: () => backdropSwirl(store.get().stageColor) ?? undefined,
  };
}
