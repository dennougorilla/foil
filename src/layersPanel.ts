// The layer list at the top of the Layers tab (docs/layering.md): layer 2 over layer 1, each with its
// finish, where it goes (a pixel card lit where it lands) and, for layer 2, how it meets layer 1.
// Choosing a row hands the area controls below it to that layer.
import { editionById, layerChoices, type Area, type EditionId, type Layer2 } from './editions';
import { owned, packOf, type PackId } from './packs';
import { packs } from './packStore';
import { sfx } from './audio';
import type { Dict } from './i18n';
import type { Store } from './state';

export interface LayersHost {
  store: Store;
  t: () => Dict;
  announce: (msg: string) => void;
  root: HTMLElement;
  /** Layer n's area as a small grid of 0..255 (-1 off the card). */
  map: (n: 1 | 2, w: number, h: number) => Int16Array;
  /** Whether a finish can be drawn yet (its pack has arrived and its shader is compiled). */
  ready: (id: EditionId) => boolean;
  /** Whether layer n has brush strokes, and wiping them (when layer 2 is removed). */
  painted: (n: 1 | 2) => boolean;
  clearPaint: (n: 1 | 2) => void;
}

/** The diagram's grid: one cell per pixel of a tiny pixel-art card. */
const GW = 15;
const GH = 21;
const TONE_NAMES: [number, number, 'toneLight' | 'toneMid' | 'toneDark'][] = [
  [0.6, 1, 'toneLight'],
  [0.3, 0.7, 'toneMid'],
  [0, 0.4, 'toneDark'],
];

const NEW_LAYER: Omit<Layer2, 'edition'> = { region: 'all', lo: 0, hi: 1, invert: false, blend: 'light', strength: 1 };

export function initLayers(host: LayersHost) {
  const { store, root } = host;
  root.innerHTML = `
    <div class="layer-stack" role="radiogroup"></div>
    <button class="layer-add" type="button"><b>+</b><span></span></button>
    <div class="layer-blend" hidden>
      <div class="field-head"><span class="field-label" id="blendLabel"></span></div>
      <div class="seg seg-two seg-blend" role="radiogroup" aria-labelledby="blendLabel">
        <button class="seg-btn" type="button" role="radio" data-b="light"><i class="blend-ico is-light" aria-hidden="true"></i><span></span></button>
        <button class="seg-btn" type="button" role="radio" data-b="over"><i class="blend-ico is-over" aria-hidden="true"></i><span></span></button>
      </div>
      <p class="hint blend-hint"></p>
      <div class="row">
        <label class="field-label" for="layerK"></label>
        <output for="layerK"></output>
        <input type="range" id="layerK" min="0" max="1" step="0.01" />
      </div>
    </div>
    <div class="layer-pick" hidden>
      <div class="layer-chips" role="radiogroup"></div>
      <p class="hint layer-solo"></p>
    </div>
  `;
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const stack = q('.layer-stack');
  const pick = q('.layer-pick');
  const chips = q('.layer-chips');
  const k = q<HTMLInputElement>('#layerK');
  /** The layer whose finish list is open, or 0. */
  let picking: 0 | 1 | 2 = 0;

  const t = () => host.t();
  const name = (id: EditionId) => t().edition[id];
  const layer2 = () => store.get().layer2;
  const areaOf = (n: 1 | 2): Area => {
    const s = store.get();
    return n === 2 && s.layer2 ? s.layer2 : { region: s.rangeRegion, lo: s.rangeLo, hi: s.rangeHi, invert: s.rangeInvert };
  };

  /** Where a layer goes, in words: a region, a band of tones, inverted, plus the brush. */
  function place(n: 1 | 2, painted: boolean): string {
    const tt = t();
    const at = areaOf(n);
    // A card that is all picture has no art, frame or name of its own: those places are the whole card.
    const a: Area = store.get().frameless && at.region !== 'none' ? { ...at, region: 'all' } : at;
    const band = a.lo > 0 || a.hi < 1;
    const tone = TONE_NAMES.find(([lo, hi]) => Math.abs(lo - a.lo) < 0.005 && Math.abs(hi - a.hi) < 0.005);
    let what =
      a.region === 'none' ? (painted ? tt.placePainted : tt.region.none)
      : !band ? tt.region[a.region]
      : (a.region === 'all' ? '' : `${tt.region[a.region]}・`) + (tone ? tt[tone[2]] : tt.toneBand.replace('{lo}', String(Math.round(a.lo * 100))).replace('{hi}', String(Math.round(a.hi * 100))));
    if (a.invert) what = tt.placeExcept.replace('{x}', what);
    if (painted && a.region !== 'none') what += tt.placeBrush;
    return what;
  }

  /**
   * A pixel card lit in the finish's colour where the layer lands, with one band of sheen across it.
   * Layer 2's card hatches layer 1's area beneath it, so the overlap can be seen.
   */
  function drawMap(canvas: HTMLCanvasElement, n: 1 | 2, id: EditionId) {
    const g = host.map(n, GW, GH);
    const under = n === 2 ? host.map(1, GW, GH) : null;
    const below = store.get().edition !== 'base';
    const x = canvas.getContext('2d')!;
    const img = x.createImageData(GW, GH);
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lit = hex(editionById(id).color);
    const off = [30, 41, 46];
    for (let i = 0; i < GW * GH; i++) {
      const v = g[i];
      if (v < 0) continue;
      const o = i * 4;
      const cx = i % GW;
      const cy = (i / GW) | 0;
      // The band runs corner to corner like light on foil; it brightens lit cells only.
      const d = Math.abs(cx - cy * 0.7 - 3);
      const band = d < 1 ? 0.55 : d < 2 ? 0.25 : 0;
      const f = v / 255;
      // Diagonal hatching in light slate where layer 1 lies, whatever its colour.
      const hatch = under && below && (cx + cy) % 3 === 0 ? (Math.max(0, under[i]) / 255) * 0.5 : 0;
      const base = off.map((c) => c + (150 - c) * hatch);
      for (let c = 0; c < 3; c++) {
        const on = lit[c] + (255 - lit[c]) * band;
        img.data[o + c] = Math.round(base[c] + (on - base[c]) * f);
      }
      img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }

  function row(n: 1 | 2): HTMLElement {
    const s = store.get();
    const id = n === 2 ? s.layer2!.edition : s.edition;
    const on = (s.layer2 ? s.areaLayer : 1) === n;
    const r = document.createElement('div');
    r.className = `layer-row${on ? ' is-on' : ''}`;
    r.dataset.n = String(n);
    r.setAttribute('role', 'radio');
    r.setAttribute('aria-checked', String(on));
    r.tabIndex = on ? 0 : -1;
    r.setAttribute('aria-label', t().layerN.replace('{n}', String(n)).replace('{x}', name(id)));
    r.style.setProperty('--c', editionById(id).color);
    r.innerHTML = `
      <canvas class="layer-map" width="${GW}" height="${GH}" aria-hidden="true"></canvas>
      <i class="layer-no" aria-hidden="true">${n}</i>
      <button class="layer-finish" type="button" aria-haspopup="true"><i aria-hidden="true"></i><b></b><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2v2h2v2h2V8h2V6h2v2h-2v2H9v2H7v-2H5V8H3z" /></svg></button>
      <button class="layer-place" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h10v12H3zm2 2v8h6V4z" /></svg><span></span></button>
      ${n === 2 ? '<button class="layer-x" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z" /></svg></button>' : ''}
    `;
    const fin = r.querySelector<HTMLButtonElement>('.layer-finish')!;
    fin.querySelector('b')!.textContent = name(id);
    fin.setAttribute('aria-expanded', String(picking === n));
    fin.title = t().layerPick;
    const pl = r.querySelector<HTMLButtonElement>('.layer-place')!;
    const waiting = !host.ready(id);
    pl.querySelector('span')!.textContent = waiting ? t().layerWaiting : place(n, host.painted(n));
    pl.classList.toggle('is-waiting', waiting);
    if (waiting) wait();
    pl.title = t().layerWhereTip;
    const map = r.querySelector('canvas')!;
    drawMap(map, n, id);
    if (n === 2) map.title = t().mapHatch;
    r.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.classList.contains('layer-finish')) return togglePick(n);
      if (b?.classList.contains('layer-x')) return remove();
      choose(n);
      // The place chip leads straight to the area controls below.
      if (b?.classList.contains('layer-place')) {
        const seg = document.querySelector<HTMLElement>('#pane-range .seg-region');
        seg?.scrollIntoView({ block: 'nearest' });
        seg?.querySelector<HTMLElement>('[aria-checked=true]')?.focus({ preventScroll: true });
      }
    });
    return r;
  }

  function choose(n: 1 | 2) {
    if ((store.get().areaLayer === n) || (!layer2() && n === 1)) return;
    sfx.tick();
    store.set({ areaLayer: n });
  }

  function remove() {
    const l = layer2();
    if (!l) return;
    sfx.tick();
    picking = 0;
    host.clearPaint(2);
    store.set({ layer2: null, areaLayer: 1 });
    host.announce(t().layerRemoved.replace('{x}', name(l.edition)));
    q<HTMLElement>('.layer-add').focus({ preventScroll: true });
  }

  function togglePick(n: 1 | 2) {
    sfx.tick();
    picking = picking === n ? 0 : n;
    // The list belongs to that layer, so its row is the chosen one too.
    if (picking && layer2() && store.get().areaLayer !== n) store.set({ areaLayer: n });
    render();
    if (picking) {
      chips.querySelector<HTMLElement>('[aria-checked=true], [role=radio]')?.focus({ preventScroll: true });
      reveal(pick);
    }
  }

  /** While a finish is still being prepared, its row says so and is redrawn once it is ready. */
  let waitTimer = 0;
  function wait() {
    if (waitTimer) return;
    waitTimer = window.setTimeout(() => {
      waitTimer = 0;
      render();
    }, 400);
  }

  /** Puts `id` on layer n (layer 2 is made if it is not there yet). */
  function set(n: 1 | 2, id: EditionId) {
    const s = store.get();
    sfx.tick();
    picking = 0;
    if (n === 1) {
      if (id !== s.edition) store.set({ edition: id });
    } else {
      store.set({ layer2: { ...(s.layer2 ?? NEW_LAYER), edition: id }, areaLayer: 2 });
      host.announce((s.layer2 ? t().layerChanged : t().layerAdded).replace('{x}', name(id)));
    }
    render();
    stack.querySelector<HTMLElement>(`.layer-row[data-n="${n}"] .layer-finish`)?.focus({ preventScroll: true });
  }

  /** The finishes for the open list: any owned one for layer 1, the ones that layer for layer 2. */
  function buildChips() {
    const s = store.get();
    const n = picking as 1 | 2;
    const all = owned(packs.get());
    const ids = n === 1 ? all : layerChoices(all, s.edition);
    const current = n === 1 ? s.edition : s.layer2?.edition;
    chips.textContent = '';
    chips.setAttribute('aria-label', n === 1 ? t().layerList1 : t().layerList2);
    let group: PackId | 'open' | null = null;
    for (const id of ids) {
      const g = packOf(id)?.id ?? 'open';
      if (g !== group) {
        group = g;
        const h = document.createElement('p');
        h.className = 'layer-group';
        h.textContent = g === 'open' ? t().pack.deckStarters : t().pack.name[g];
        chips.append(h);
      }
      const e = editionById(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'layer-chip';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === current));
      b.tabIndex = id === current ? 0 : -1;
      b.dataset.v = id;
      for (const [v, c] of [['--c', e.color], ['--c1', e.swirl[0]], ['--c2', e.swirl[1]], ['--c3', e.swirl[2]]]) b.style.setProperty(v, c);
      b.innerHTML = '<i aria-hidden="true"></i><span></span>';
      b.lastElementChild!.textContent = name(id);
      b.onclick = () => set(n, id);
      chips.append(b);
    }
    if (!chips.querySelector('[tabindex="0"]')) chips.querySelector<HTMLElement>('[role=radio]')!.tabIndex = 0;
    // Layer 2 says, once, why some owned finishes are missing from its list.
    const solo = n === 2 ? all.filter((id) => !ids.includes(id) && id !== 'base' && id !== s.edition) : [];
    q('.layer-solo').hidden = !solo.length;
    q('.layer-solo').textContent = solo.length ? t().layerSolo.replace('{x}', name(solo[0])).replace('{n}', String(solo.length)).replace('{m}', String(solo.length - 1)) : '';
    q('.layer-solo').title = solo.map(name).join(t().listSep);
  }

  function render() {
    const s = store.get();
    const tt = t();
    stack.textContent = '';
    stack.setAttribute('aria-label', tt.layers);
    // As in a paint program, the upper layer is listed on top.
    if (s.layer2) stack.append(row(2));
    stack.append(row(1));
    stack.classList.toggle('is-two', !!s.layer2);
    const add = q<HTMLButtonElement>('.layer-add');
    add.hidden = !!s.layer2;
    add.querySelector('span')!.textContent = tt.layerAdd;
    add.setAttribute('aria-expanded', String(picking === 2));
    q('.layer-blend').hidden = !s.layer2;
    if (s.layer2) {
      // Areas that never meet leave the blend nothing to do: say so and set the controls back.
      const a = host.map(1, GW, GH);
      const b = host.map(2, GW, GH);
      // Measured against the smaller area, so the cells two neighbouring areas share at their edge don't count.
      let shared = 0;
      let sa = 0;
      let sb = 0;
      for (let i = 0; i < a.length; i++) {
        const [va, vb] = [Math.max(0, a[i]) / 255, Math.max(0, b[i]) / 255];
        shared += Math.min(va, vb);
        sa += va;
        sb += vb;
      }
      const apart = s.edition === 'base' || shared < 0.25 * Math.min(sa, sb);
      q('.layer-blend').classList.toggle('is-apart', apart);
      q('#blendLabel').textContent = tt.blendLabel;
      root.querySelectorAll<HTMLButtonElement>('.seg-blend [role=radio]').forEach((b) => {
        const on = b.dataset.b === s.layer2!.blend;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        b.querySelector('span')!.textContent = b.dataset.b === 'light' ? tt.blendLight : tt.blendOver;
      });
      q('.blend-hint').textContent = (apart ? tt.blendApart : s.layer2.blend === 'light' ? tt.blendLightHint : tt.blendOverHint).replace('{a}', name(s.edition)).replace('{b}', name(s.layer2.edition));
      q('label[for=layerK]').textContent = tt.layerStrength.replace('{b}', name(s.layer2.edition));
      k.value = String(s.layer2.strength);
      k.style.setProperty('--fill', `${s.layer2.strength * 100}%`);
      q('output[for=layerK]').textContent = `${Math.round(s.layer2.strength * 100)}%`;
    }
    pick.hidden = !picking;
    if (picking) buildChips();
  }

  q('.layer-add').addEventListener('click', () => togglePick(2));
  root.querySelectorAll<HTMLButtonElement>('.seg-blend [role=radio]').forEach((b) =>
    b.addEventListener('click', () => {
      const l = layer2();
      if (!l || l.blend === b.dataset.b) return;
      sfx.tick();
      store.set({ layer2: { ...l, blend: b.dataset.b as Layer2['blend'] } });
    }),
  );
  k.addEventListener('input', () => {
    const l = layer2();
    if (l) store.set({ layer2: { ...l, strength: +k.value } });
  });
  // Arrow keys move within the rows, the blend pair and the finish list, like the panel's other groups.
  root.addEventListener('keydown', (e) => {
    const group = (e.target as HTMLElement).closest('[role=radiogroup]');
    if (e.key === 'Escape' && picking) {
      e.stopPropagation();
      const n = picking;
      picking = 0;
      render();
      stack.querySelector<HTMLElement>(`.layer-row[data-n="${n}"] .layer-finish`)?.focus() ?? q<HTMLElement>('.layer-add').focus();
      return;
    }
    if (!group) return;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    const items = [...group.querySelectorAll<HTMLElement>(':scope > [role=radio], :scope > * > [role=radio]')].filter((x) => x.closest('[role=radiogroup]') === group);
    const i = items.indexOf((e.target as HTMLElement).closest('[role=radio]') as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[(i + dir + items.length) % items.length];
    next.focus();
    // Rows and blend modes follow the focus; finish chips wait for Enter, since each one changes the card.
    if (!next.classList.contains('layer-chip')) next.click();
  });

  /** Scrolls an opened part clear of the Save box (and the fade above it), never past the sticky tabs. */
  function reveal(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const save = document.querySelector('.sec-export')?.getBoundingClientRect().top ?? innerHeight;
    const tabs = document.querySelector('.tabs-bar')?.getBoundingClientRect().bottom ?? 0;
    const by = Math.min(r.bottom - (save - 48), r.top - tabs - 8);
    if (by <= 0) return;
    const panel = document.getElementById('panel')!;
    // The panel scrolls on its own beside the stage; on phones the page does.
    (getComputedStyle(panel).overflowY === 'visible' ? window : panel).scrollBy({ top: by });
  }

  store.on((_s, changed) => {
    if ((['edition', 'layer2', 'areaLayer', 'lang', 'rangeRegion', 'rangeLo', 'rangeHi', 'rangeInvert'] as const).some((key) => changed.has(key))) render();
  });
  packs.on(() => picking && render());
  render();
  return {
    /** After either area changes (the brush included): the diagrams and place names follow. */
    sync: render,
  };
}
