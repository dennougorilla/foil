// The panel's Layers tab and brush mode: choose where on the card the finish lands. It loads with
// Fine-tune and edits what areas.ts keeps on the card.
import { BRUSH_MAX, BRUSH_MIN, MIN_BAND, type RangeRegion } from './featureState';
import { RANGE_H, RANGE_W } from './gl/range';
import { sfx } from './audio';
import { editionById, type Area } from './editions';
import { MiniPreview } from './miniPreview';
import { initLayers } from './layersPanel';
import type { Areas } from './areas';
import type { Dict } from './i18n';
import type { Stage } from './stage';
import type { State, Store } from './state';

export interface RangeHost {
  store: Store;
  stage: Stage;
  t: () => Dict;
  announce: (msg: string) => void;
}

const REGIONS: RangeRegion[] = ['all', 'art', 'frame', 'text', 'none'];
/** Brightness presets: all, highlights, midtones, shadows. */
const TONES: [number, number][] = [
  [0, 1],
  [0.6, 1],
  [0.3, 0.7],
  [0, 0.4],
];
const SIZE_MIN = BRUSH_MIN;
const SIZE_MAX = BRUSH_MAX;

/** Tiny card pictograms: the lit part is where the finish goes. */
const CARD = '<rect class="off" x="1" y="1" width="16" height="22" rx="2"/>';
const WIN = '<rect class="off" x="3.5" y="3.5" width="11" height="12"/>';
const REGION_ICON: Record<RangeRegion, string> = {
  all: '<rect class="on" x="1" y="1" width="16" height="22" rx="2"/><rect class="line" x="3.5" y="3.5" width="11" height="12"/>',
  art: `${CARD}<rect class="on" x="3.5" y="3.5" width="11" height="12"/>`,
  frame: '<path class="on" fill-rule="evenodd" d="M3 1h12a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zm.5 2.5v12h11v-12z"/>',
  text: `${CARD}${WIN}<rect class="on" x="3.5" y="18" width="7" height="2.5"/>`,
  none: `${CARD}${WIN}`,
};

const ICON = {
  undo: '<path d="M5 3 2 6l3 3M2.5 6H10a4 4 0 0 1 0 8H7" />',
  redo: '<path d="m11 3 3 3-3 3M13.5 6H6a4 4 0 0 0 0 8h3" />',
  clear: '<path d="M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10" />',
  add: '<path d="M8 3v10M3 8h10" />',
  erase: '<path d="M3 8h10" />',
  brush: '<path d="M10 2l4 4-6 6-4-4zM4 8l-2 6 6-2" />',
};
const svg = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function radio(btn: HTMLElement, on: boolean) {
  btn.setAttribute('aria-checked', String(on));
  btn.tabIndex = on ? 0 : -1;
}

/** Arrow keys move the choice within a radio group, like the panel's other groups. */
function roving(group: HTMLElement) {
  group.addEventListener('keydown', (e) => {
    const items = [...group.querySelectorAll<HTMLElement>('[role=radio]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + items.length) % items.length;
    items[n].click();
    items[n].focus();
  });
}

function fill(input: HTMLInputElement) {
  const p = ((+input.value - +input.min) / (+input.max - +input.min)) * 100;
  input.style.setProperty('--fill', `${p}%`);
}

export function initRangePanel(host: RangeHost, areas: Areas) {
  const { store, stage } = host;
  const { model, paints, which, areaOf, push } = areas;
  // The editor below works on the layer chosen in the list.
  const paint = () => {
    const p = paints[which() - 1];
    p.cellAspect = model.cellAspect;
    return p;
  };
  const area = (s = store.get()) => areaOf(which(s), s);
  function setArea(p: Partial<Area>) {
    const s = store.get();
    if (which(s) === 2) return store.set({ layer2: { ...s.layer2!, ...p } });
    const patch: Partial<State> = {};
    if (p.region !== undefined) patch.rangeRegion = p.region;
    if (p.lo !== undefined) patch.rangeLo = p.lo;
    if (p.hi !== undefined) patch.rangeHi = p.hi;
    if (p.invert !== undefined) patch.rangeInvert = p.invert;
    store.set(patch);
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Tab ----------

  const sec = document.getElementById('pane-range')!;
  sec.innerHTML = `
    <div class="layers"></div>
    <div class="pane-tools"><button class="link range-reset" type="button" data-r="rangeReset"></button></div>
    <div class="field">
      <div class="field-head">
        <span class="field-label" id="rangeWhereLabel" data-r="rangeWhere"></span>
        <span class="where-tag" hidden>${svg('<path d="M10 2l4 4-6 6-4-4zM4 8l-2 6 6-2" />')}<span data-r="whereBrushed"></span></span>
      </div>
      <div class="seg seg-region" role="radiogroup" aria-labelledby="rangeWhereLabel" aria-describedby="rangeRegionHint"></div>
      <p class="hint region-hint" id="rangeRegionHint"></p>
    </div>
    <div class="field tone-field">
      <div class="field-head">
        <span class="field-label" id="rangeToneLabel" data-r="rangeTone"></span>
        <output class="tone-out" aria-hidden="true"></output>
      </div>
      <div class="tone">
        <canvas class="tone-hist" width="160" height="14" aria-hidden="true"></canvas>
        <div class="tone-track" aria-hidden="true"><i class="tone-band"></i></div>
        <input type="range" class="tone-lo" min="0" max="1" step="0.01" />
        <input type="range" class="tone-hi" min="0" max="1" step="0.01" />
      </div>
      <div class="tone-presets" role="group" aria-labelledby="rangeToneLabel"></div>
    </div>
    <div class="range-row">
      <button class="chip range-chip" type="button" data-k="rangeInvert" aria-pressed="false"><span data-r="rangeInvert"></span></button>
      <button class="chip range-chip" type="button" data-k="rangeShow" aria-pressed="false"><span data-r="rangeShow"></span></button>
    </div>
    <button class="btn btn-quiet range-paint" type="button">
      ${svg(ICON.brush)}
      <span class="btn-text"><b data-r="paint"></b><small data-r="paintSub"></small></span>
    </button>
    <div class="range-cover">
      <p class="cover-head" aria-live="polite"><span data-r="coverLabel"></span><b class="cover-val"></b></p>
      <i class="cover-bar" aria-hidden="true"><i></i></i>
      <p class="cover-empty" hidden><span></span> <button class="link cover-fix" type="button"></button></p>
      <p class="legend" aria-hidden="true"><i class="lg lg-foil"></i><span data-r="legendFoil"></span><i class="lg lg-paper"></i><span data-r="legendPaper"></span></p>
    </div>
  `;

  const q = <T extends HTMLElement>(s: string, root: ParentNode = sec) => root.querySelector<T>(s)!;
  const regionSeg = q('.seg-region');
  const lo = q<HTMLInputElement>('.tone-lo');
  const hi = q<HTMLInputElement>('.tone-hi');
  const tone = q('.tone');
  const toneOut = q('.tone-out');
  const tonePresets = q('.tone-presets');
  const paintBtn = q<HTMLButtonElement>('.range-paint');
  const cover = q('.range-cover');
  const layers = initLayers({
    store,
    t: host.t,
    announce: host.announce,
    root: q('.layers'),
    map: (n, w, h) => model.map(areaOf(n), paints[n - 1], w, h),
    painted: (n) => paints[n - 1].painted,
    ready: (id) => stage.cards.ready(editionById(id).shader),
    clearPaint: (n) => {
      paints[n - 1].reset();
      void paints[n - 1].save();
    },
  });

  REGIONS.forEach((r) => {
    const b = el('button', 'seg-btn region-btn', `<svg class="rgn" viewBox="0 0 18 24" aria-hidden="true">${REGION_ICON[r]}</svg><span></span>`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.v = r;
    b.onclick = () => {
      if (area().region === r) return;
      sfx.tick();
      setArea({ region: r });
    };
    regionSeg.appendChild(b);
  });
  roving(regionSeg);

  TONES.forEach(([a, b], i) => {
    const c = el('button', 'tone-chip');
    c.type = 'button';
    c.dataset.i = String(i);
    c.onclick = () => {
      sfx.tick();
      setArea({ lo: a, hi: b });
    };
    tonePresets.appendChild(c);
  });

  lo.addEventListener('input', () => {
    const v = Math.min(+lo.value, area().hi - MIN_BAND);
    lo.value = String(v);
    setArea({ lo: Math.max(0, v) });
  });
  hi.addEventListener('input', () => {
    const v = Math.max(+hi.value, area().lo + MIN_BAND);
    hi.value = String(v);
    setArea({ hi: Math.min(1, v) });
  });
  // The thumb nearest the pointer takes the drag, so a narrow band never traps the other one.
  tone.addEventListener('pointerdown', (e) => {
    const r = tone.getBoundingClientRect();
    const v = (e.clientX - r.left) / r.width;
    const s = area();
    const takeLo = Math.abs(v - s.lo) < Math.abs(v - s.hi) || (s.lo === s.hi - MIN_BAND && v < s.lo);
    lo.style.zIndex = takeLo ? '3' : '2';
    hi.style.zIndex = takeLo ? '2' : '3';
  });

  sec.querySelectorAll<HTMLButtonElement>('.range-chip').forEach((b) => {
    b.addEventListener('click', () => {
      sfx.tick();
      if (b.dataset.k === 'rangeInvert') setArea({ invert: !area().invert });
      else store.set({ rangeShow: !store.get().rangeShow });
    });
  });

  q('.range-reset').addEventListener('click', () => {
    sfx.tick();
    const p = paint();
    if (p.painted) {
      p.checkpoint();
      p.clear();
      void p.save();
    }
    setArea({ region: 'all', lo: 0, hi: 1, invert: false });
    push();
  });

  // While painting, the panel button points to the brush tools; Done (or Esc) is the one way out.
  paintBtn.addEventListener('click', () => {
    if (!painting) return enterPaint();
    const done = q<HTMLElement>('.brush-done', bar);
    done.focus({ preventScroll: true });
    done.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
    done.classList.remove('is-nudge');
    void done.offsetWidth;
    done.classList.add('is-nudge');
  });

  /** What is holding the finish back, most direct cause first. */
  const blocker = () => {
    const s = area();
    if (s.invert) return 'invert';
    if (s.lo > 0 || s.hi < 1) return 'tone';
    if (s.region === 'none') return painting ? 'painting' : 'paint';
    return 'region';
  };
  q('.cover-fix').addEventListener('click', () => {
    sfx.tick();
    const b = blocker();
    if (b === 'invert') setArea({ invert: false });
    else if (b === 'tone') setArea({ lo: 0, hi: 1 });
    else if (b === 'paint') enterPaint();
    else if (b === 'region') setArea({ region: 'all' });
  });

  // ---------- Overlay: shown while the section is in use, while painting, or when pinned ----------

  // Only the area controls bring the overlay up: in the layer list the card shows both layers as they are.
  const layersEl = q('.layers');
  const editing = () => sec.matches(':hover, :focus-within') && !layersEl.matches(':hover, :focus-within');

  /** While painting, the brush layer keeps over the card as it moves. */
  const follow = () => {
    if (!painting) return;
    placeLayer();
    requestAnimationFrame(follow);
  };

  // ---------- Brush mode ----------

  const showcase = document.querySelector<HTMLElement>('.showcase')!;
  const cardSlot = document.getElementById('cardSlot')!;
  const stageEl = document.getElementById('stage')!;
  const layer = el('div', 'paint-layer');
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  const ring = el('i', 'paint-ring');
  layer.appendChild(ring);
  showcase.appendChild(layer);

  const bar = el('div', 'brush');
  bar.hidden = true;
  bar.setAttribute('role', 'group');
  bar.innerHTML = `
    <div class="brush-box">
      <p class="brush-title">${svg(ICON.brush)}<b data-r="brush"></b></p>
      <p class="brush-lead" data-r="brushLead"></p>
      <div class="seg seg-brush" role="radiogroup">
        <button class="seg-btn" type="button" role="radio" data-m="add">${svg(ICON.add)}<span data-r="brushAdd"></span></button>
        <button class="seg-btn" type="button" role="radio" data-m="erase">${svg(ICON.erase)}<span data-r="brushErase"></span></button>
      </div>
      <div class="row">
        <label class="field-label" for="brushSize" data-r="brushSize"></label>
        <input type="range" id="brushSize" min="${SIZE_MIN}" max="${SIZE_MAX}" step="1" />
        <output for="brushSize" class="dot-out"><i></i></output>
      </div>
      <div class="row">
        <label class="field-label" for="brushSoft" data-r="brushSoft"></label>
        <input type="range" id="brushSoft" min="0" max="1" step="0.01" />
        <output for="brushSoft" class="dot-out is-soft"><i></i></output>
      </div>
      <div class="brush-tools">
        <button class="tool" type="button" data-a="undo" aria-keyshortcuts="Control+Z">${svg(ICON.undo)}<span data-r="undo"></span></button>
        <button class="tool" type="button" data-a="redo" aria-keyshortcuts="Control+Shift+Z">${svg(ICON.redo)}<span data-r="redo"></span></button>
        <button class="tool" type="button" data-a="clear">${svg(ICON.clear)}<span data-r="brushClear"></span></button>
      </div>
      <button class="btn btn-quiet brush-done" type="button"><span class="btn-text"><b data-r="brushDone"></b><small data-r="brushDoneSub"></small></span></button>
    </div>
    <p class="card-hint brush-keys"></p>
  `;
  showcase.appendChild(bar);
  const modeSeg = q('.seg-brush', bar);
  const size = q<HTMLInputElement>('#brushSize', bar);
  const soft = q<HTMLInputElement>('#brushSoft', bar);
  modeSeg.querySelectorAll<HTMLButtonElement>('[role=radio]').forEach((b) => {
    b.onclick = () => {
      sfx.tick();
      store.set({ brushMode: b.dataset.m as 'add' | 'erase' });
    };
  });
  roving(modeSeg);
  size.addEventListener('input', () => {
    store.set({ brushSize: +size.value });
    showRingAtCentre();
  });
  soft.addEventListener('input', () => store.set({ brushSoft: +soft.value }));
  bar.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => b.addEventListener('click', () => act(b.dataset.a!)));
  q('.brush-done', bar).addEventListener('click', () => exitPaint());

  let painting = false;
  const narrow = matchMedia('(max-width: 900px)');
  const preview = new MiniPreview({ store, section: sec, card: cardSlot, isPainting: () => painting, reduced, view: () => ({ rangeView: stage.rangeView, layer: stage.rangeLayer }) });

  function enterPaint() {
    painting = true;
    stage.hold = true;
    stageEl.classList.add('is-painting');
    layer.hidden = false;
    bar.hidden = false;
    paintBtn.setAttribute('aria-pressed', 'true');
    sync();
    // With everything already covered, adding can't show anything: start with the eraser.
    if (store.get().brushMode === 'add' && model.coverage(area(), paint()) > 0.995) store.set({ brushMode: 'erase' });
    follow();
    sfx.tick();
    host.announce(host.t().brushOn);
    preview.hide();
    // On phones the tools dock at the bottom; bring the whole card into view above them.
    if (narrow.matches) cardSlot.scrollIntoView({ block: 'start', behavior: reduced.matches ? 'auto' : 'smooth' });
    modeSeg.querySelector<HTMLElement>('[aria-checked=true]')?.focus({ preventScroll: true });
  }

  function exitPaint() {
    if (!painting) return;
    painting = false;
    // A stroke still under way when painting ends (Esc) is finished and saved, not dropped.
    up();
    stage.hold = false;
    stageEl.classList.remove('is-painting');
    layer.hidden = true;
    bar.hidden = true;
    paintBtn.setAttribute('aria-pressed', 'false');
    sync();
    preview.hide();
    sfx.tick();
    host.announce(host.t().brushOff);
    paintBtn.focus({ preventScroll: true });
  }

  function act(a: string) {
    const t = host.t();
    const p = paint();
    if (a === 'undo' && p.undo()) host.announce(t.brushUndone);
    else if (a === 'redo' && p.redo()) host.announce(t.brushRedone);
    else if (a === 'clear' && p.painted) {
      p.checkpoint();
      p.clear();
      host.announce(t.brushCleared);
    } else return;
    sfx.tick();
    push();
    void p.save();
  }

  function placeLayer() {
    const s = showcase.getBoundingClientRect();
    const c = cardSlot.getBoundingClientRect();
    Object.assign(layer.style, {
      left: `${c.left - s.left}px`,
      top: `${c.top - s.top}px`,
      width: `${c.width}px`,
      height: `${c.height}px`,
    });
  }

  let down = false;
  let lastX = 0;
  let lastY = 0;
  const toTex = (e: PointerEvent) => {
    const r = layer.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * RANGE_W, ((e.clientY - r.top) / r.height) * RANGE_H] as const;
  };
  // While the size slider moves, the real brush ring sits in the middle of the card.
  let ringTimer = 0;
  function showRingAtCentre() {
    const r = layer.getBoundingClientRect();
    if (!r.width) return;
    const d = ((store.get().brushSize * 2) / RANGE_W) * r.width;
    ring.style.width = ring.style.height = `${d}px`;
    ring.style.transform = `translate(${r.width / 2 - d / 2}px, ${r.height / 2 - d / 2}px)`;
    layer.classList.add('has-ring');
    clearTimeout(ringTimer);
    ringTimer = window.setTimeout(() => layer.classList.remove('has-ring'), 900);
  }
  const moveRing = (e: PointerEvent) => {
    const r = layer.getBoundingClientRect();
    const d = ((store.get().brushSize * 2) / RANGE_W) * r.width;
    ring.style.width = ring.style.height = `${d}px`;
    ring.style.transform = `translate(${e.clientX - r.left - d / 2}px, ${e.clientY - r.top - d / 2}px)`;
    layer.classList.add('has-ring');
  };
  layer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    down = true;
    paint().checkpoint();
    [lastX, lastY] = toTex(e);
    const s = store.get();
    paint().dab(lastX, lastY, s.brushSize, s.brushSoft, s.brushMode);
    sparkle(e, true);
    sfx.tick();
    push();
  });
  layer.addEventListener('pointermove', (e) => {
    moveRing(e);
    if (!down) return;
    const [x, y] = toTex(e);
    const s = store.get();
    paint().stroke(lastX, lastY, x, y, s.brushSize, s.brushSoft, s.brushMode);
    lastX = x;
    lastY = y;
    sparkle(e, false);
    push();
  });
  // Foil flakes fly off the brush as it lays the finish down; erasing sheds grey dust instead.
  const HOLO = ['#ff6b8b', '#f2c14e', '#59f2b0', '#5fb4ff', '#c58bff', '#ffffff'];
  let lastSpark = 0;
  let sparks = 0;
  function sparkle(e: PointerEvent, burst: boolean) {
    if (reduced.matches) return;
    const now = performance.now();
    if (!burst && now - lastSpark < 28) return;
    lastSpark = now;
    const r = layer.getBoundingClientRect();
    const rad = ((store.get().brushSize / RANGE_W) * r.width) / 2;
    const erase = store.get().brushMode === 'erase';
    for (let i = 0; i < (burst ? 6 : 2) && sparks < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * rad;
      const f = el('i', `flake${erase ? ' is-dust' : ''}`);
      f.style.left = `${e.clientX - r.left + Math.cos(a) * d}px`;
      f.style.top = `${e.clientY - r.top + Math.sin(a) * d}px`;
      f.style.setProperty('--c', erase ? '#8a9a9c' : HOLO[Math.floor(Math.random() * HOLO.length)]);
      f.style.setProperty('--dx', `${(Math.random() - 0.5) * 36}px`);
      f.style.setProperty('--dy', `${erase ? 18 + Math.random() * 20 : -16 - Math.random() * 26}px`);
      f.style.animationDelay = `${Math.random() * 60}ms`;
      sparks++;
      f.addEventListener('animationend', () => {
        f.remove();
        sparks--;
      });
      layer.appendChild(f);
    }
  }

  const up = () => {
    if (!down) return;
    down = false;
    syncBrush();
    void paint().save();
  };
  layer.addEventListener('pointerup', up);
  layer.addEventListener('pointercancel', up);
  layer.addEventListener('pointerleave', () => layer.classList.remove('has-ring'));

  document.addEventListener(
    'keydown',
    (e) => {
      if (!painting) return;
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text');
      if (typing) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let handled = true;
      if (k === 'escape') exitPaint();
      else if (mod && k === 'z') act(e.shiftKey ? 'redo' : 'undo');
      else if (mod && k === 'y') act('redo');
      else if (mod) handled = false;
      else if (k === '[' || k === ']') {
        const v = Math.min(SIZE_MAX, Math.max(SIZE_MIN, store.get().brushSize + (k === ']' ? 6 : -6)));
        store.set({ brushSize: v });
      } else if (k === 'x') store.set({ brushMode: store.get().brushMode === 'add' ? 'erase' : 'add' });
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  // ---------- Sync ----------


  let coverTimer = 0;
  function measure() {
    clearTimeout(coverTimer);
    coverTimer = window.setTimeout(() => {
      coverTimer = 0;
      const t = host.t();
      const s = store.get();
      const f = model.coverage(area(s), paint());
      // Never round a partial area up to 100% or down to 0%.
      const n = f >= 0.9995 ? 100 : Math.min(99, Math.round(f * 100));
      const none = f <= 0.0005;
      const few = f < 0.02;
      q('.cover-val').textContent = none ? '0%' : f < 0.01 ? t.rangeTiny : `${n}%`;
      cover.classList.toggle('is-none', few);
      q('.cover-empty').hidden = !few;
      // Name the thing that is holding the finish back, and offer the change that undoes it.
      const b = blocker();
      q('.cover-empty > span').textContent = b === 'painting' ? t.fixPainting : none ? t.rangeNone : t.rangeFew;
      const fix = q<HTMLButtonElement>('.cover-fix');
      fix.hidden = b === 'painting';
      fix.textContent = { invert: t.fixInvert, tone: t.fixTone, paint: t.fixPaint, region: t.fixRegion, painting: '' }[b];
      drawHistogram(model.histogram());
      cover.style.setProperty('--cover', `${n}%`);
    }, 140);
  }

  const hist = q<HTMLCanvasElement>('.tone-hist');
  /** The card's own tones, drawn as pixel bars along the brightness track. */
  function drawHistogram(h: number[]) {
    const x = hist.getContext('2d')!;
    x.clearRect(0, 0, hist.width, hist.height);
    const w = hist.width / h.length;
    // A stepped skyline in the finish's own colour: a faint baseline, then columns with a light cap.
    const c = editionById(store.get().edition).color;
    x.fillStyle = c;
    x.globalAlpha = 0.3;
    x.fillRect(0, hist.height - 1, hist.width, 1);
    h.forEach((v, i) => {
      const bh = Math.max(v > 0 ? 2 : 0, Math.round(Math.sqrt(v) * hist.height));
      if (!bh) return;
      const x0 = Math.round(i * w);
      const x1 = Math.round((i + 1) * w);
      x.fillStyle = c;
      x.globalAlpha = 0.75;
      x.fillRect(x0, hist.height - bh, x1 - x0, bh);
      x.fillStyle = '#fff';
      x.globalAlpha = 0.85;
      x.fillRect(x0, hist.height - bh, x1 - x0, 1);
    });
    x.globalAlpha = 1;
  }

  function syncBrush() {
    const p = paint();
    bar.querySelector<HTMLButtonElement>('[data-a=undo]')!.disabled = !p.canUndo;
    bar.querySelector<HTMLButtonElement>('[data-a=redo]')!.disabled = !p.canRedo;
    bar.querySelector<HTMLButtonElement>('[data-a=clear]')!.disabled = !p.painted;
  }

  function sync() {
    const s = store.get();
    const a = area(s);
    // With two layers, the area controls name the finish they place.
    const placing = which(s) === 2 ? s.layer2!.edition : s.edition;
    q('#rangeWhereLabel').textContent = s.layer2 ? host.t().layerWhere.replace('{n}', String(which(s))).replace('{x}', host.t().edition[placing]) : host.t().rangeWhere;
    regionSeg.querySelectorAll<HTMLButtonElement>('[role=radio]').forEach((b) => radio(b, b.dataset.v === a.region));
    lo.value = String(a.lo);
    hi.value = String(a.hi);
    tone.style.setProperty('--lo', String(a.lo));
    tone.style.setProperty('--hi', String(a.hi));
    tone.classList.toggle('is-invert', a.invert);
    tone.classList.toggle('is-full', a.lo <= 0 && a.hi >= 1);
    regionSeg.classList.toggle('is-invert', a.invert);
    // Brush strokes make the area custom: the chosen preset becomes its base, and the panel says so.
    const custom = paint().painted;
    regionSeg.classList.toggle('is-custom', custom && !a.invert);
    const tt = host.t();
    // Invert flips region and brightness together, so name both when the band is narrowed.
    const narrowed = a.lo > 0 || a.hi < 1;
    const what = narrowed
      ? tt.toneAt.replace('{r}', tt.region[a.region]).replace('{lo}', String(Math.round(a.lo * 100))).replace('{hi}', String(Math.round(a.hi * 100)))
      : tt.regionQ.replace('{r}', tt.region[a.region]);
    q('.region-hint').textContent = a.invert
      ? tt.invertHint.replace('{x}', what)
      : custom
        ? tt.customHint.replace('{r}', tt.region[a.region])
        : tt.regionHint[a.region];
    q('.where-tag').hidden = !paint().painted;
    paintBtn.querySelector('b')!.textContent = painting ? host.t().paintActive : host.t().paint;
    paintBtn.querySelector('small')!.textContent = painting ? host.t().paintActiveSub : host.t().paintSub;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    toneOut.textContent = `${Math.round(a.lo * 100)}${s.lang === 'ja' ? '〜' : '–'}${pct(a.hi)}`;
    lo.setAttribute('aria-valuetext', pct(a.lo));
    hi.setAttribute('aria-valuetext', pct(a.hi));
    tonePresets.querySelectorAll<HTMLButtonElement>('.tone-chip').forEach((c) => {
      const [x, y] = TONES[+c.dataset.i!];
      c.setAttribute('aria-pressed', String(Math.abs(x - a.lo) < 0.005 && Math.abs(y - a.hi) < 0.005));
    });
    sec.querySelectorAll<HTMLButtonElement>('.range-chip').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.k === 'rangeInvert' ? a.invert : s.rangeShow));
    });
    modeSeg.querySelectorAll<HTMLButtonElement>('[role=radio]').forEach((b) => radio(b, b.dataset.m === s.brushMode));
    layer.dataset.mode = s.brushMode;
    size.value = String(s.brushSize);
    soft.value = String(s.brushSoft);
    fill(size);
    fill(soft);
    const sizePct = Math.round(((s.brushSize * 2) / RANGE_W) * 100);
    // The outputs draw the brush itself: a dot as wide as the stroke, blurred by the softness.
    const sizeOut = size.nextElementSibling as HTMLElement;
    sizeOut.style.setProperty('--d', `${6 + ((s.brushSize - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 22}px`);
    sizeOut.title = host.t().sizeOf.replace('{n}', String(sizePct));
    size.setAttribute('aria-valuetext', host.t().sizeOf.replace('{n}', String(sizePct)));
    const softOut = soft.nextElementSibling as HTMLElement;
    softOut.style.setProperty('--blur', `${(s.brushSoft * 5).toFixed(1)}px`);
    softOut.title = pct(s.brushSoft);
    soft.setAttribute('aria-valuetext', pct(s.brushSoft));
    q<HTMLElement>('.pane-tools').hidden = !(a.region !== 'all' || a.lo > 0 || a.hi < 1 || a.invert || paint().painted);
  }

  function applyText() {
    const t = host.t();
    const all = [...sec.querySelectorAll<HTMLElement>('[data-r]'), ...bar.querySelectorAll<HTMLElement>('[data-r]')];
    for (const e of all) {
      const v = t[e.dataset.r as keyof Dict];
      if (typeof v === 'string') e.textContent = v;
    }
    regionSeg.querySelectorAll<HTMLButtonElement>('[role=radio]').forEach((b) => {
      b.lastElementChild!.textContent = t.region[b.dataset.v as RangeRegion];
    });
    tonePresets.querySelectorAll<HTMLButtonElement>('.tone-chip').forEach((c) => (c.textContent = t.tonePresets[+c.dataset.i!]));
    const keys = q('.brush-keys', bar);
    keys.textContent = '';
    for (const [ks, label] of t.brushKeys) {
      const item = el('span');
      ks.forEach((k) => (item.appendChild(el('kbd')).textContent = k));
      item.append(` ${label}`);
      keys.appendChild(item);
    }
    regionSeg.querySelectorAll<HTMLElement>('[role=radio]').forEach((b) => {
      b.dataset.except = t.invertBadge;
      b.dataset.base = t.baseBadge;
    });
    preview.applyText(t);
    lo.setAttribute('aria-label', t.rangeLo);
    hi.setAttribute('aria-label', t.rangeHi);
    modeSeg.setAttribute('aria-label', t.brushMode);
    bar.setAttribute('aria-label', t.brush);
    sync();
    measure();
  }

  store.on((_s, changed) => {
    if (changed.has('lang')) applyText();
    if (changed.has('edition')) measure();
    sync();
  });

  areas.attach({
    view: () => painting || editing(),
    pushed(snap, snap2) {
      preview.setRange(snap);
      if (snap2) preview.setRange2(snap2);
      layers.sync();
      syncBrush();
      sync();
      measure();
    },
    faced(face, mask, moved) {
      preview.setFace(face, mask);
      // Animated sources redraw faster than the debounce; measure at most once per window instead.
      if (!moved && !coverTimer) measure();
    },
  });
  applyText();
}
