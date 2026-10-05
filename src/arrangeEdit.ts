// Free placement on the card itself (docs/arrange.md): a short tap opens a piece's print menu,
// a drag moves it, the corner handle sizes it and the handle above it turns it (two fingers do
// both), guides snap it, a small bar beside it offers print, level, Auto and done, and while a
// piece is selected the card holds still and takes no toss or flick.

import './arrange.css';
import type { Store } from './state';
import type { Dict } from './i18n';
import type { Stage } from './stage';
import { sfx } from './audio';
import { artOf, LINE, S } from './card/face';
import { freeBox } from './card/messageFace';
import { clampTurn, halfExtent, MAX_SIZE, MAX_TURN, MIN_SIZE, snapInside, type FreeField, type Placement } from './arrange';
import type { TextRun } from './lettering';

interface Options {
  store: Store;
  stage: Stage;
  /** The card's button on the stage. */
  slot: HTMLElement;
  /** The face canvas (its art window gives the guides). */
  face: HTMLCanvasElement;
  dict: () => Dict;
  /** The text the face last painted, to start Free where Auto had each piece. */
  runs: () => TextRun[];
  /** Opens a piece's print menu at an element or a point of the page. */
  openPrint: (f: FreeField, at: HTMLElement | { x: number; y: number }) => void;
}

/** Movement (px) that turns a tap into a drag. */
const TAP = 6;
/** How near (face uv) a guide pulls. */
const NEAR = 0.012;
const DEG = 180 / Math.PI;

const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  e.setAttribute('class', cls);
  return e;
};

export function mountArrange(o: Options): void {
  const { store, stage } = o;

  // ---------- Overlay: the selection box, its handles, the guides, a readout and a bar ----------
  const svg = svgEl('svg', 'ar');
  svg.setAttribute('aria-hidden', 'true');
  const idle = { message: svgEl('polygon', 'ar-idle'), name: svgEl('polygon', 'ar-idle') };
  const boxUnder = svgEl('polygon', 'ar-box-under');
  const box = svgEl('polygon', 'ar-box');
  const stalk = svgEl('line', 'ar-stalk');
  const guideX = svgEl('line', 'ar-guide');
  const guideY = svgEl('line', 'ar-guide');
  const underX = svgEl('line', 'ar-guide-under');
  const underY = svgEl('line', 'ar-guide-under');
  svg.append(idle.message, idle.name, underX, underY, guideX, guideY, boxUnder, box, stalk);
  const handle = (cls: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ar-handle ${cls}`;
    b.hidden = true;
    return b;
  };
  const sizer = handle('ar-size');
  const turner = handle('ar-turn');
  sizer.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M7 5h4v4M5 7v4h4" /></svg>';
  turner.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 8a4 4 0 1 1-1.2-2.9M12 3v3H9" /></svg>';
  const read = document.createElement('output');
  read.className = 'ar-read';
  read.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'ar-bar';
  bar.setAttribute('role', 'toolbar');
  bar.hidden = true;
  const tool = (key: 'print' | 'level' | 'auto' | 'done') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ar-tool ar-${key}`;
    b.dataset.k = key;
    bar.append(b);
    return b;
  };
  const which = document.createElement('b');
  which.className = 'ar-which';
  bar.append(which);
  const tPrint = tool('print');
  const tLevel = tool('level');
  const tAuto = tool('auto');
  const tDone = tool('done');
  document.body.append(svg, sizer, turner, read, bar);

  let selected: FreeField | null = null;
  let guides: { gx: number | null; gy: number | null } = { gx: null, gy: null };
  let swallowClick = false;

  const free = () => store.get().arrange === 'free';
  /** The pieces that may move now. */
  const movable = (): FreeField[] => {
    const s = store.get();
    const out: FreeField[] = [];
    if (s.message.text.trim() && s.placements.message) out.push('message');
    if (s.layout === 'classic' && s.plate && s.placements.name) out.push('name');
    return out;
  };

  /** The piece under a point of the face, the selected one first. */
  function hit(uv: [number, number]): FreeField | null {
    const all = movable();
    const order = selected && all.includes(selected) ? [selected, ...all.filter((f) => f !== selected)] : all;
    for (const f of order) {
      const b = freeBox(f);
      if (!b) continue;
      const dx = (uv[0] - b.x) * o.face.width;
      const dy = (uv[1] - b.y) * o.face.height;
      const c = Math.cos(-b.rot);
      const s = Math.sin(-b.rot);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      // A finger is wider than a stroke: a little room round the words.
      const pad = 18 * S;
      if (Math.abs(lx) <= (b.w * o.face.width) / 2 + pad && Math.abs(ly) <= (b.h * o.face.height) / 2 + pad) return f;
    }
    return null;
  }

  const place = (f: FreeField) => store.get().placements[f]!;
  const setPlace = (f: FreeField, p: Placement) => store.set({ placements: { ...store.get().placements, [f]: p } });

  function select(f: FreeField | null) {
    if (selected === f) return;
    selected = f;
    stage.hold = !!f;
    for (const el of [sizer, turner, bar]) el.hidden = !f;
    if (f) which.textContent = o.dict().arrange.piece[f];
    document.body.classList.toggle('is-arranging', !!f);
    labels();
    draw();
  }

  function labels() {
    const t = o.dict().arrange;
    sizer.setAttribute('aria-label', t.size);
    sizer.title = t.size;
    turner.setAttribute('aria-label', t.turn);
    turner.title = t.turn;
    bar.setAttribute('aria-label', t.bar);
    if (selected) which.textContent = t.piece[selected];
    tPrint.textContent = t.print;
    tLevel.textContent = t.level;
    tAuto.textContent = t.back;
    tDone.textContent = t.done;
  }

  // ---------- Geometry ----------
  /** The guides in face uv: the centre lines, the picture's edges and the frame's inner edge. */
  function lines() {
    const a = artOf(o.face);
    return {
      x: [0.5, a.x / o.face.width, (a.x + a.w) / o.face.width],
      y: [0.5, a.y / o.face.height, (a.y + a.h) / o.face.height],
    };
  }
  const inner = () => {
    const ix = (LINE + 10 * S) / o.face.width;
    const iy = (LINE + 10 * S) / o.face.height;
    return { x: ix, y: iy, w: 1 - ix * 2, h: 1 - iy * 2 };
  };

  /** A piece's half extent in face uv at a placement (its painted box scaled to the new size and turn). */
  function half(f: FreeField, p: Placement) {
    const b = freeBox(f)!;
    const k = p.size / place(f).size;
    const e = halfExtent(b.w * o.face.width * k, b.h * o.face.height * k, p.rot);
    return { x: e.x / o.face.width, y: e.y / o.face.height };
  }

  /** A size and turn kept inside the frame: too big shrinks to fit, and the centre is pulled in. */
  function fit(f: FreeField, p: Placement): Placement {
    const box = inner();
    let h = half(f, p);
    const k = Math.min(1, box.w / 2 / h.x, box.h / 2 / h.y);
    const q = { ...p, size: p.size * k };
    h = half(f, q);
    const s = snapInside(q.x, q.y, h, { x: [], y: [] }, box, 0);
    return { ...q, x: s.x, y: s.y };
  }

  /** Pulls every placed piece back inside the frame (after the shape, the words or their face changed). */
  function refit() {
    const cur = store.get().placements;
    const next = { ...cur };
    let moved = false;
    for (const f of Object.keys(cur) as FreeField[]) {
      const p = cur[f];
      if (!p || !freeBox(f)) continue;
      const q = fit(f, p);
      if (q.x !== p.x || q.y !== p.y || q.size !== p.size) {
        next[f] = q;
        moved = true;
      }
    }
    if (moved) store.set({ placements: next });
  }

  // ---------- Gestures ----------
  type Drag = { kind: 'drag'; f: FreeField; id: number; sx: number; sy: number; uv0: [number, number]; p0: Placement; moved: boolean };
  type Handle = { kind: 'size' | 'turn'; f: FreeField; id: number; c: [number, number]; v0: [number, number]; p0: Placement };
  type Pinch = { kind: 'pinch'; f: FreeField; d0: number; a0: number; p0: Placement };
  let g: Drag | Handle | Pinch | null = null;
  const pts = new Map<number, [number, number]>();

  const pinchOf = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(b[0] - a[0], b[1] - a[1]), a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };

  /** Shows the size and turn while they change, relative to where the gesture began. */
  function readout(p: Placement, p0: Placement, what: 'size' | 'turn' | 'both') {
    const t = o.dict().arrange;
    read.hidden = false;
    // Level and the ±15° limit are named, so a turn that stops there does not feel stuck.
    const turn = p.rot === 0 ? t.levelNow : Math.abs(p.rot) >= MAX_TURN - 1e-6 ? t.turnMax : t.turnNow.replace('{deg}', String(Math.round(p.rot * DEG)));
    const size = t.sizeNow.replace('{pct}', String(Math.round((p.size / p0.size) * 100)));
    read.textContent = what === 'turn' ? turn : what === 'size' ? size : `${turn} · ${size}`;
    read.classList.toggle('is-level', p.rot === 0);
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!free()) return;
      const target = e.target as HTMLElement;
      // The handles hold their symbols: a press on the symbol is a press on the handle.
      const grip = target.closest?.<HTMLElement>('.ar-handle');
      if (grip && selected) {
        e.stopPropagation();
        const p = place(selected);
        const c = stage.pageAt(p.x, p.y);
        if (!c) return;
        grip.setPointerCapture(e.pointerId);
        g = { kind: grip === sizer ? 'size' : 'turn', f: selected, id: e.pointerId, c, v0: [e.clientX - c[0], e.clientY - c[1]], p0: { ...p } };
        return;
      }
      if (bar.contains(target)) return;
      if (!o.slot.contains(target)) {
        // Anywhere but the card, its handles and bar lets go (the panel and the print menu keep it).
        if (selected && !target.closest('.panel, .pp')) select(null);
        return;
      }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      // A second finger on a selected piece: pinch to size and turn.
      if (pts.size === 2 && selected && g?.kind === 'drag') {
        const { d, a } = pinchOf();
        g = { kind: 'pinch', f: selected, d0: d, a0: a, p0: { ...place(selected) } };
        e.stopPropagation();
        return;
      }
      const uv = stage.uvAt(e.clientX, e.clientY);
      const f = uv && hit(uv);
      if (!f) {
        if (selected) {
          // A selected piece keeps the card still: a touch beside it lets go instead of tossing.
          e.stopPropagation();
          swallowClick = true;
          select(null);
        }
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      swallowClick = true;
      g = { kind: 'drag', f, id: e.pointerId, sx: e.clientX, sy: e.clientY, uv0: uv!, p0: { ...place(f) }, moved: false };
    },
    true,
  );

  addEventListener(
    'pointermove',
    (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (!g) return;
      if (g.kind === 'pinch') {
        if (pts.size < 2) return;
        const { d, a } = pinchOf();
        const p = fit(g.f, { ...g.p0, size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, (g.p0.size * d) / Math.max(g.d0, 1))), rot: clampTurn(g.p0.rot + a - g.a0) });
        setPlace(g.f, p);
        readout(p, g.p0, 'both');
        return;
      }
      if (e.pointerId !== g.id) return;
      if (g.kind !== 'drag') {
        const v: [number, number] = [e.clientX - g.c[0], e.clientY - g.c[1]];
        const p =
          g.kind === 'size'
            ? { ...g.p0, size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, (g.p0.size * Math.hypot(...v)) / Math.max(Math.hypot(...g.v0), 1))) }
            : { ...g.p0, rot: clampTurn(g.p0.rot + Math.atan2(v[1], v[0]) - Math.atan2(g.v0[1], g.v0[0])) };
        const q = fit(g.f, p);
        // A click as the turn settles level.
        if (q.rot === 0 && place(g.f).rot !== 0) sfx.tick();
        setPlace(g.f, q);
        readout(q, g.p0, g.kind);
        return;
      }
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < TAP) return;
      if (!g.moved) {
        g.moved = true;
        select(g.f);
        sfx.tick();
      }
      const uv = stage.uvAt(e.clientX, e.clientY);
      if (!uv) return;
      const snapped = snapInside(g.p0.x + uv[0] - g.uv0[0], g.p0.y + uv[1] - g.uv0[1], half(g.f, g.p0), lines(), inner(), NEAR);
      // A click as it catches a new guide.
      if ((snapped.gx !== null && snapped.gx !== guides.gx) || (snapped.gy !== null && snapped.gy !== guides.gy)) sfx.tick();
      guides = { gx: snapped.gx, gy: snapped.gy };
      setPlace(g.f, { ...g.p0, x: snapped.x, y: snapped.y });
    },
    true,
  );

  const end = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'pinch') {
      if (pts.size < 2) {
        g = null;
        read.hidden = true;
      }
      return;
    }
    if (e.pointerId !== g.id) return;
    if (g.kind === 'drag' && !g.moved && e.type === 'pointerup') {
      // A short tap: select it and open its print menu.
      select(g.f);
      o.openPrint(g.f, { x: e.clientX, y: e.clientY });
    }
    g = null;
    read.hidden = true;
    guides = { gx: null, gy: null };
    draw();
  };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
  // The click that ends a claimed press is ours, not the card's (no bounce, no second menu).
  document.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      if (o.slot.contains(e.target as Node)) e.stopPropagation();
    },
    true,
  );

  // The bar beside the selection.
  bar.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).closest<HTMLButtonElement>('.ar-tool')?.dataset.k;
    if (!k || !selected) return;
    sfx.tick();
    if (k === 'print') o.openPrint(selected, tPrint);
    else if (k === 'level') setPlace(selected, fit(selected, { ...place(selected), rot: 0 }));
    else if (k === 'auto') store.set({ arrange: 'auto', placements: {} });
    else select(null);
  });

  // Keys move, size and turn the selected piece.
  document.addEventListener('keydown', (e) => {
    if (!selected || !free()) return;
    const t = e.target as HTMLElement;
    if (t.matches('input, textarea, [contenteditable]')) return;
    const p = { ...place(selected) };
    const step = e.shiftKey ? 0.03 : 0.005;
    if (e.key === 'Escape') {
      select(null);
      return;
    }
    if (e.key === 'ArrowLeft') p.x -= step;
    else if (e.key === 'ArrowRight') p.x += step;
    else if (e.key === 'ArrowUp') p.y -= step;
    else if (e.key === 'ArrowDown') p.y += step;
    else if (e.key === '+' || e.key === '=') p.size = Math.min(MAX_SIZE, p.size * 1.06);
    else if (e.key === '-') p.size = Math.max(MIN_SIZE, p.size / 1.06);
    else if (e.key === '[') p.rot = clampTurn(p.rot - 4 / DEG);
    else if (e.key === ']') p.rot = clampTurn(p.rot + 4 / DEG);
    else return;
    e.preventDefault();
    setPlace(selected, fit(selected, p));
  });

  // ---------- Drawing the overlay (every frame while something is selected: the card settles) ----------
  const at = (q: [number, number] | null, el: HTMLElement) => {
    if (!q) return;
    el.style.left = `${q[0]}px`;
    el.style.top = `${q[1]}px`;
  };

  /** The page polygon round a piece, with a margin (face px). */
  function outline(f: FreeField, pad: number) {
    const b = freeBox(f);
    if (!b) return null;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const hw = (b.w * o.face.width) / 2 + pad;
    const hh = (b.h * o.face.height) / 2 + pad;
    const q = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([lx, ly]) => stage.pageAt(b.x + (lx * c - ly * s) / o.face.width, b.y + (lx * s + ly * c) / o.face.height));
    return q.some((v) => !v) ? null : q.map((v) => v!.join(',')).join(' ');
  }

  /** While Free is on and nothing is selected, a faint outline says which words can be picked up. */
  function drawIdle() {
    const show = free() && !selected && !g;
    svg.classList.toggle('is-idle', show);
    for (const f of ['message', 'name'] as FreeField[]) {
      const pts = show && movable().includes(f) ? outline(f, 10 * S) : null;
      idle[f].setAttribute('points', pts ?? '');
    }
  }

  function draw() {
    const b = selected && freeBox(selected);
    svg.classList.toggle('is-on', !!b);
    if (!b) return;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const pad = 10 * S;
    const hw = (b.w * o.face.width) / 2 + pad;
    const hh = (b.h * o.face.height) / 2 + pad;
    const uvOf = (lx: number, ly: number): [number, number] => [b.x + (lx * c - ly * s) / o.face.width, b.y + (lx * s + ly * c) / o.face.height];
    const page = (lx: number, ly: number) => stage.pageAt(...uvOf(lx, ly));
    const corners = [page(-hw, -hh), page(hw, -hh), page(hw, hh), page(-hw, hh)];
    if (corners.some((q) => !q)) return;
    box.setAttribute('points', corners.map((q) => q!.join(',')).join(' '));
    boxUnder.setAttribute('points', box.getAttribute('points')!);
    at(corners[2], sizer);
    // The turn handle stands on a short stalk above the middle of the top edge.
    const top = page(0, -hh)!;
    const knob = page(0, -hh - 46 * S)!;
    stalk.setAttribute('x1', String(top[0]));
    stalk.setAttribute('y1', String(top[1]));
    stalk.setAttribute('x2', String(knob[0]));
    stalk.setAttribute('y2', String(knob[1]));
    at(knob, turner);
    at(knob, read);
    // The bar sits under the card (never over it), or above it when there is no room below.
    const card = [stage.pageAt(0, 0), stage.pageAt(1, 0), stage.pageAt(1, 1), stage.pageAt(0, 1)];
    if (card.every(Boolean)) {
      const low = Math.max(...card.map((q) => q![1]));
      const high = Math.min(...card.map((q) => q![1]));
      const mid = (card[0]![0] + card[2]![0]) / 2;
      const bw = bar.offsetWidth;
      const bh = bar.offsetHeight;
      const below = low + 14 + bh < innerHeight - 8;
      bar.style.left = `${Math.min(Math.max(8, mid - bw / 2), innerWidth - bw - 8)}px`;
      bar.style.top = `${below ? low + 14 : Math.max(8, high - 14 - bh)}px`;
    }
    for (const [els, v, axis] of [[[underX, guideX], guides.gx, 'x'], [[underY, guideY], guides.gy, 'y']] as const) {
      for (const el of els) el.classList.toggle('is-on', v !== null);
      if (v === null) continue;
      const a = stage.pageAt(axis === 'x' ? v : 0.02, axis === 'x' ? 0.02 : v);
      const z = stage.pageAt(axis === 'x' ? v : 0.98, axis === 'x' ? 0.98 : v);
      if (!a || !z) continue;
      for (const el of els) {
        el.setAttribute('x1', String(a[0]));
        el.setAttribute('y1', String(a[1]));
        el.setAttribute('x2', String(z[0]));
        el.setAttribute('y2', String(z[1]));
      }
    }
  }
  const loop = () => {
    if (selected) draw();
    drawIdle();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // ---------- Starting Free where Auto had each piece ----------
  const measure = document.createElement('canvas').getContext('2d')!;
  function seed() {
    const s = store.get();
    const runs = o.runs();
    const short = Math.min(o.face.width, o.face.height);
    const next = { ...s.placements };
    for (const f of ['message', 'name'] as FreeField[]) {
      if (next[f]) continue;
      const rs = runs.filter((r) => r.part === f);
      if (!rs.length) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const r of rs) {
        measure.font = r.font;
        x0 = Math.min(x0, r.x);
        x1 = Math.max(x1, r.x + measure.measureText(r.text).width);
      }
      const y0 = Math.min(...rs.map((r) => r.y));
      const y1 = Math.max(...rs.map((r) => r.y));
      next[f] = { x: (x0 + x1) / 2 / o.face.width, y: (y0 + y1) / 2 / o.face.height, size: rs[0].size / short, rot: 0 };
    }
    if (JSON.stringify(next) !== JSON.stringify(s.placements)) store.set({ placements: next });
  }

  store.on((s, changed) => {
    if (changed.has('arrange') && s.arrange === 'free') seed();
    if (s.arrange === 'free' && ['shape', 'name', 'message', 'text', 'layout', 'cardType'].some((k) => changed.has(k as keyof typeof s))) requestAnimationFrame(refit);
    if (changed.has('lang')) labels();
    // A piece that can no longer move is let go.
    if (selected && (!free() || !movable().includes(selected))) select(null);
    if (changed.has('placements')) requestAnimationFrame(draw);
  });
  labels();
  if (free()) requestAnimationFrame(seed);
}
