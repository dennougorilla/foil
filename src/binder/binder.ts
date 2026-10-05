// The binder: Keep puts the card on the stage into it, and it opens like a real one, six pages of
// nine pockets holding still thumbnails (plain images, no WebGL). Cards stay in the pocket they are
// put in and are dragged to any other; pages turn over at the rings. Picking cards lifts them; To
// stage puts one back on the stage, Discard (or a card's own ×) throws cards away, with Undo.
// Loaded the first time it is used; see docs/binder.md.

import './binder.css';
import type { Card } from '../state';
import type { Dict, Lang } from '../i18n';
import { renderStill, type ExportInput } from '../exporter';
import { fitIn, opaqueBounds } from './fit';
import { formatBytes } from '../anim/apngUi';
import { discard, fillOf, kept, list, persist, place, put, restore, stored, thumb, type Kept, type Meta, type Stored } from './db';
import { packBrush, unpackBrush } from './brush';
import { RANGE_H, RANGE_W } from '../gl/range';
import type { Layers } from '../range';
import { arrange, firstFree, layout, MAX_BYTES, MAX_CARDS, PAGES, PER_PAGE, pocketsOn, refusal, swap, type Layout } from './limits';

type Placed = Meta & { slot: number };

const TEXT = {
  ja: {
    title: 'バインダー',
    hint: 'クリックで選ぶ・ドラッグで好きなポケットへ・ダブルクリックですぐステージへ',
    hintTouch: 'タップで選ぶ・長押しで持ち上げて好きなポケットへ',
    moved: '{page} ページへ移しました',
    swapped: '入れ替えました',
    pickedOne: '{card}・{date} にしまったカード',
    pickedMany: '{n} 枚を選択中・ステージに出せるのは 1 枚です',
    empty: 'まだ空です。カードができたら「しまう」で入れましょう',
    full: '54 枚の上限です。捨てて空きを作ってください',
    fullBytes: '60 MB の上限です。捨てて空きを作ってください',
    keepPocket: '今のカードをここにしまう',
    play: 'ステージに出す',
    playLabel: '選んだカードをステージに出す',
    playOne: '1 枚だけ選んでください',
    discard: '捨てる',
    discardN: '{n} 枚を捨てる',
    discardOne: '{card} を捨てる',
    undo: '元に戻す',
    back: '{n} 枚を戻しました',
    pages: '{a} / {n} ページ',
    pagesLabel: '{a} ページ目（全 {n} ページ）',
    prev: '前のページ',
    next: '次のページ',
    close: '閉じる',
    count: '{n} / {max} 枚',
    bytes: '容量 {used} / {max}',
    lost: 'プレビューなし・ステージには出せます',
    kept: 'バインダーにしまいました（{n} / {max}）',
    keepFailed: 'カードをしまえませんでした。もう一度お試しください。',
    playFailed: 'このカードは読み込めませんでした。',
    gone: '{n} 枚捨てました',
    card: '{name}（{finish}）',
  },
  en: {
    title: 'Binder',
    hint: 'Click to pick · drag to any pocket · double-click to put it on the stage',
    hintTouch: 'Tap to pick · hold to lift it into any pocket',
    moved: 'Moved to page {page}',
    swapped: 'Swapped two cards',
    pickedOne: '{card}, kept {date}',
    pickedMany: '{n} picked · only one goes on the stage',
    empty: 'Empty for now. Finish a card, then press Keep.',
    full: '54-card limit reached. Discard to make room.',
    fullBytes: '60 MB limit reached. Discard to make room.',
    keepPocket: 'Put the current card here',
    play: 'To stage',
    playLabel: 'Put the picked card on the stage',
    playOne: 'Pick just one card',
    discard: 'Discard',
    discardN: 'Discard {n}',
    discardOne: 'Discard {card}',
    undo: 'Undo',
    back: 'Brought back {n}',
    pages: 'Page {a} / {n}',
    pagesLabel: 'Page {a} of {n}',
    prev: 'Previous page',
    next: 'Next page',
    close: 'Close',
    count: '{n} / {max} cards',
    bytes: 'Space {used} / {max}',
    lost: 'No preview · can still go on stage',
    kept: 'Kept in the binder ({n} / {max})',
    keepFailed: "Couldn't keep the card. Please try again.",
    playFailed: "This card couldn't be read.",
    gone: 'Discarded {n}',
    card: '{name} ({finish})',
  },
} satisfies Record<Lang, Record<string, string>>;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));

/** The thumbnail's size: a pocket's card at twice its size on a phone. */
const TW = 250;
const TH = 350;

export interface BinderHost {
  lang: () => Lang;
  dict: () => Dict;
  /** The header chip: it shows the count, and kept cards fly into it. */
  chip: HTMLElement;
  /** Where the card on the stage is, for the kept card's flight. */
  cardRect: () => DOMRect;
  /** The card on the stage now. */
  card: () => Card;
  input: () => ExportInput;
  /** The person's picture on the card (null for a sample): its still, and its own file when it moves. */
  picture: () => { still: HTMLCanvasElement; file: Blob | null } | null;
  /** The finish area's brush strokes on the card now, layer 1 and layer 2. */
  brush: () => Layers[];
  /** Puts a kept card on the stage. */
  /** Puts a kept card on the stage, with its brush strokes (null: none). */
  play: (k: Kept, id: string, brush: Layers[] | null) => Promise<void>;
  /** The stage rests while the binder covers it. */
  pause: (on: boolean) => void;
  toast: (msg: string, error?: boolean) => void;
  /** Said to screen readers only: the binder and the chip already show it. */
  announce: (msg: string) => void;
  onCount: (n: number) => void;
  /** The card on the stage is now in the binder, as this card. */
  onKept: (id: string) => void;
  /** Cards were thrown away, or brought back by Undo. */
  onGone: (ids: string[]) => void;
  onBack: (ids: string[]) => void;
  sfx: { tick(): void; coin(): void; error(): void; flip(): void };
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The still card cut to its own outline and shrunk to fit the pocket: a trading card fills it, a
 * card of another shape (when the card has one) keeps its shape and sits in the middle.
 */
async function thumbnail(input: ExportInput): Promise<Blob> {
  const src = await renderStill(input);
  const box = opaqueBounds(src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data, src.width, src.height);
  const size = fitIn(box.w, box.h, TW, TH);
  const c = document.createElement('canvas');
  c.width = size.w;
  c.height = size.h;
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.85));
  if (!blob) throw new Error('thumbnail');
  return blob;
}

/** The longest side a kept still picture keeps, and the biggest moving picture kept as its own file. */
const PICTURE_SIDE = 1280;
const MAX_MOVING = 8_000_000;

/** The person's picture as kept: a moving one as its own file while it is small enough, else the still shrunk. */
async function keptPicture(p: ReturnType<BinderHost['picture']>): Promise<Blob | null> {
  if (!p) return null;
  if (p.file && p.file.size <= MAX_MOVING) return p.file;
  const k = Math.min(1, PICTURE_SIDE / Math.max(p.still.width, p.still.height));
  const c = document.createElement('canvas');
  c.width = Math.round(p.still.width * k);
  c.height = Math.round(p.still.height * k);
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(p.still, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.9));
  if (!blob) throw new Error('picture');
  return blob;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function mountBinder(host: BinderHost) {
  const text = () => TEXT[host.lang()];
  let view: { refresh: (note?: 'count' | 'bytes') => Promise<void> } | null = null;

  /** The kept card's thumbnail flies from the stage into the chip, which bumps. */
  function fly(blob: Blob) {
    const chip = host.chip;
    const bump = () => {
      chip.classList.remove('is-bump');
      void chip.offsetWidth;
      chip.classList.add('is-bump');
    };
    if (still()) return bump();
    const from = host.cardRect();
    const to = chip.getBoundingClientRect();
    const img = document.createElement('img');
    const url = URL.createObjectURL(blob);
    img.src = url;
    img.className = 'bd-fly';
    img.alt = '';
    Object.assign(img.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.append(img);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const k = Math.max(0.08, to.height / from.height);
    const a = img.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 60}px) scale(0.6) rotate(-8deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(4deg)`, opacity: 0.4 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
    );
    a.onfinish = () => {
      img.remove();
      URL.revokeObjectURL(url);
      bump();
    };
  }

  /** Keeps the card on the stage, in pocket `at` when it is empty, else in the first empty one. */
  async function keep(at?: number): Promise<void> {
    const t = text();
    // The card as it is at the press: edits made while it is being kept don't change it.
    const card = host.card();
    const input = host.input();
    const source = host.picture();
    const brush = packBrush(host.brush());
    // A full binder is said before the strokes are awaited; their failure then goes unseen.
    brush.catch(() => {});
    try {
      const metas = await list();
      // A full binder needs no picture to say so.
      const full = refusal(fillOf(metas), 0);
      if (full) return open(full);
      const [picture, thumb, strokes] = await Promise.all([keptPicture(source), thumbnail(input), brush]);
      const bytes = thumb.size + (picture?.size ?? 0) + (strokes?.size ?? 0);
      const no = refusal(fillOf(metas), bytes);
      if (no) return open(no);
      const lay = layout(arrange(metas));
      const slot = at !== undefined && lay[at] === null ? at : firstFree(lay);
      const meta: Meta = { id: newId(), at: Date.now(), name: input.name, edition: input.edition.id, bytes, slot };
      await put(meta, thumb, { card, picture, brush: strokes });
      // Now there is something worth keeping, and the person has just asked to keep it.
      void persist().catch(() => {});
      const n = metas.length + 1;
      host.onCount(n);
      host.onKept(meta.id);
      host.sfx.coin();
      // From the stage into the chip; kept from the open binder, it simply lands in its pocket.
      if (!view) fly(thumb);
      host.announce(fill(t.kept, { n, max: MAX_CARDS }));
      await view?.refresh();
    } catch (err) {
      console.error(err);
      host.sfx.error();
      host.toast(t.keepFailed, true);
    }
  }

  function open(note?: 'count' | 'bytes') {
    if (view) return void view.refresh(note);
    const t = text();
    const wide = matchMedia('(min-width: 900px) and (min-height: 600px)');
    /** Every card, each in its own pocket; the layout follows from them. */
    let metas: Placed[] = [];
    let lay: Layout = layout([]);
    let spread = 0;
    const picked = new Set<string>();
    const urls = new Map<string, string>();
    /** The last change, which the bar over the foot can take back for a few seconds. */
    let undo: { gone: Stored[] } | { moved: [string, number][] } | null = null;
    let undoTimer = 0;
    /** A page is being turned (the leaf is in the air). */
    let turning = false;
    /** Settles when the page in the air has landed. */
    let turned: Promise<unknown> = Promise.resolve();

    const root = document.createElement('div');
    root.className = 'bd';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bdTitle');
    root.innerHTML = `
      <div class="bd-box">
        <header class="bd-head">
          <h2 class="bd-title" id="bdTitle"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1h10v14H3zm2 2v10h6V3zM1 3h2v2H1zm0 4h2v2H1zm0 4h2v2H1z"/></svg><span></span></h2>
          <b class="bd-count" aria-live="polite"></b>
          <span class="bd-room"><span class="bd-meter" aria-hidden="true"><i></i></span><small class="bd-bytes"></small></span>
          <button class="bd-x" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2h2v2h2V5h2V3h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2V9H7v2H5v2H3v-2h2V9h2V7H5V5H3z"/></svg></button>
        </header>
        <p class="bd-note"></p>
        <div class="bd-spread">
          <i class="bd-edge bd-edge-prev" aria-hidden="true"></i>
          <i class="bd-edge bd-edge-next" aria-hidden="true"></i>
        </div>
        <footer class="bd-foot">
          <nav class="bd-nav">
            <button class="bd-turn bd-prev" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2h2v2H9zM7 4h2v2H7zM5 6h2v4H5zm2 4h2v2H7zm2 2h2v2H9z"/></svg></button>
            <span class="bd-page"></span>
            <button class="bd-turn bd-next" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2h2v2H5zm2 2h2v2H7zm2 2h2v4H9zm-2 4h2v2H7zm-2 2h2v2H5z"/></svg></button>
          </nav>
          <button class="bd-btn bd-play" type="button"><span></span></button>
          <button class="bd-btn bd-discard" type="button"><span></span></button>
          <div class="bd-undo" role="status" hidden><span></span><button class="bd-undo-btn" type="button"></button></div>
        </footer>
      </div>`;
    const $ = <T extends HTMLElement = HTMLElement>(q: string) => root.querySelector(q) as T;
    const spreadEl = $('.bd-spread');
    const playBtn = $<HTMLButtonElement>('.bd-play');
    const discardBtn = $<HTMLButtonElement>('.bd-discard');
    $('.bd-title span').textContent = t.title;
    for (const [q, label] of [['.bd-x', t.close], ['.bd-prev', t.prev], ['.bd-next', t.next]]) {
      $(q).setAttribute('aria-label', label);
      $(q).title = label;
    }
    $('.bd-play span').textContent = t.play;
    playBtn.title = t.playLabel;
    $('.bd-undo-btn').textContent = t.undo;

    /** The card on the stage, faint in the pocket it would go into: its flat face, no finish drawn. */
    const ghost = () => {
      const face = host.input().face;
      const size = fitIn(face.width, face.height, TW / 2, TH / 2);
      const c = document.createElement('canvas');
      c.width = size.w;
      c.height = size.h;
      c.getContext('2d')!.drawImage(face, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.8);
    };
    const perSpread = () => (wide.matches ? 2 : 1);
    const spreads = () => PAGES / perSpread();
    const spreadOf = (slot: number) => Math.floor(slot / PER_PAGE / perSpread());

    /** A pocket's thumbnail is read when its page is shown, and kept while the binder is open. */
    async function picture(img: HTMLImageElement, id: string): Promise<boolean> {
      let url = urls.get(id);
      if (!url) {
        const blob = await thumb(id).catch(() => undefined);
        if (!blob) return false;
        url = URL.createObjectURL(blob);
        urls.set(id, url);
      }
      img.src = url;
      return true;
    }

    function syncButtons() {
      const n = picked.size;
      playBtn.disabled = n !== 1;
      playBtn.setAttribute('aria-label', n > 1 ? t.playOne : t.playLabel);
      discardBtn.disabled = n === 0;
      $('.bd-discard span').textContent = n ? fill(t.discardN, { n }) : t.discard;
      renderNote();
    }

    function pocketCard(m: Placed): HTMLElement {
      const editions = host.dict().edition;
      // The pocket holds the card and, on its corner, a way to throw just this one away.
      const slot = document.createElement('div');
      slot.className = 'bd-pocket bd-slot';
      slot.dataset.slot = String(m.slot);
      // Its own pocket stays dimmed while it is carried, even after a page turn.
      slot.classList.toggle('is-lifted', drag?.m.id === m.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bd-card';
      b.dataset.id = m.id;
      b.setAttribute('aria-pressed', String(picked.has(m.id)));
      const label = fill(t.card, { name: m.name, finish: editions[m.edition] ?? m.edition });
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Delete');
      b.title = label;
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      b.append(img);
      void picture(img, m.id).then((ok) => {
        if (ok) return;
        // A thumbnail that can't be read still says which card it is.
        b.classList.add('is-lost');
        const lost = document.createElement('span');
        lost.className = 'bd-lost';
        lost.innerHTML = '<b></b><small></small><em></em>';
        lost.querySelector('b')!.textContent = m.name;
        lost.querySelector('small')!.textContent = editions[m.edition] ?? m.edition;
        lost.querySelector('em')!.textContent = t.lost;
        b.append(lost);
      });
      b.addEventListener('click', () => {
        // The end of a drag is not a pick.
        if (dragged) return void (dragged = false);
        host.sfx.tick();
        if (picked.has(m.id)) picked.delete(m.id);
        else picked.add(m.id);
        b.setAttribute('aria-pressed', String(picked.has(m.id)));
        syncButtons();
      });
      b.addEventListener('dblclick', () => {
        picked.clear();
        picked.add(m.id);
        void play();
      });
      b.addEventListener('pointerdown', (e) => press(e, m, b));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'bd-del';
      del.innerHTML = '<i aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 3h2v2h2v2h2V5h2V3h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2V9H7v2H5v2H3v-2h2V9h2V7H5V5H3z"/></svg></i>';
      del.setAttribute('aria-label', fill(t.discardOne, { card: label }));
      del.title = fill(t.discardOne, { card: label });
      del.addEventListener('click', () => void remove([m.id]));
      slot.append(b, del);
      return slot;
    }

    function render() {
      const f = fillOf(metas);
      $('.bd-count').textContent = fill(t.count, { n: f.count, max: MAX_CARDS });
      $('.bd-bytes').textContent = fill(t.bytes, { used: formatBytes(f.bytes), max: formatBytes(MAX_BYTES) });
      // The bar is the space; the count says the cards. Whichever ran out turns red.
      $('.bd-meter i').style.setProperty('--f', Math.min(1, f.bytes / MAX_BYTES).toFixed(3));
      root.dataset.full = refusal(f, 0) ?? '';
      root.classList.toggle('is-empty', f.count === 0);
      spread = Math.min(spread, spreads() - 1);
      const byId = new Map(metas.map((m) => [m.id, m]));
      const first = spread * perSpread();
      // While there is room, the first empty pocket on these pages keeps the card on the stage.
      const keepAt = refusal(f, 0) ? -1 : firstFree(lay, first * PER_PAGE);
      spreadEl.querySelectorAll(':scope > .bd-sheet:not(.bd-copy)').forEach((e) => e.remove());
      spreadEl.style.setProperty('--pages', String(perSpread()));
      for (let p = first; p < first + perSpread(); p++) {
        const sheet = document.createElement('div');
        sheet.className = 'bd-sheet';
        sheet.setAttribute('role', 'group');
        sheet.setAttribute('aria-label', fill(t.pagesLabel, { a: p + 1, n: PAGES }));
        pocketsOn(lay, p).forEach((id, i) => {
          const at = p * PER_PAGE + i;
          if (id) return sheet.append(pocketCard(byId.get(id)!));
          if (at === keepAt) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bd-pocket bd-keep';
            b.dataset.slot = String(at);
            b.innerHTML = '<img class="bd-ghost" alt=""><i aria-hidden="true">+</i><span></span>';
            b.querySelector('img')!.src = ghost();
            b.lastElementChild!.textContent = t.keepPocket;
            b.addEventListener('click', () => {
              host.sfx.tick();
              void keep(at);
            });
            return sheet.append(b);
          }
          const e = document.createElement('span');
          e.className = 'bd-pocket bd-empty';
          e.dataset.slot = String(at);
          sheet.append(e);
        });
        // Two open pages meet at the binder's rings, which run through the left page's holes.
        if (perSpread() > 1 && p === first) {
          sheet.classList.add('is-left');
          sheet.insertAdjacentHTML('beforeend', '<div class="bd-rings" aria-hidden="true"><i></i><i></i><i></i></div>');
        }
        spreadEl.append(sheet);
      }
      const last = first + perSpread();
      $('.bd-page').textContent = fill(t.pages, { a: last - first > 1 ? `${first + 1}–${last}` : first + 1, n: PAGES });
      $<HTMLButtonElement>('.bd-prev').disabled = spread === 0;
      $<HTMLButtonElement>('.bd-next').disabled = spread >= spreads() - 1;
      syncButtons();
    }

    let noteNow: 'count' | 'bytes' | undefined;
    /** One line under the head: why it is full, what is picked, or how to use it. */
    function renderNote(shake = false) {
      const f = fillOf(metas);
      const full = refusal(f, 0) ?? noteNow;
      const p = $('.bd-note');
      p.classList.toggle('bd-full', !!full);
      const [one] = picked;
      const m = one && metas.find((x) => x.id === one);
      // Full, the reason leads and what is picked follows it.
      const pick = picked.size > 1 ? fill(t.pickedMany, { n: picked.size })
        : m ? fill(t.pickedOne, { card: fill(t.card, { name: m.name, finish: host.dict().edition[m.edition] ?? m.edition }), date: new Date(m.at).toLocaleDateString(host.lang()) })
        : '';
      const why = full === 'count' ? t.full : full === 'bytes' ? t.fullBytes : '';
      p.textContent = why && pick ? `${why} ${pick}`
        : why || pick || (metas.length ? (matchMedia('(pointer: coarse)').matches ? t.hintTouch : t.hint) : t.empty);
      if (!shake) return;
      // Asked to keep a card it had no room for: the note shakes.
      p.classList.remove('is-shake');
      void p.offsetWidth;
      p.classList.add('is-shake');
      host.sfx.error();
    }

    async function refresh(note?: 'count' | 'bytes') {
      noteNow = note;
      const stored = await list();
      metas = arrange(stored);
      // A card that had no pocket of its own (or shared one) keeps the one it was given.
      const moved = metas.filter((m) => stored.find((s) => s.id === m.id)?.slot !== m.slot);
      if (moved.length) await place(moved);
      lay = layout(metas);
      for (const id of [...picked]) if (!metas.some((m) => m.id === id)) picked.delete(id);
      host.onCount(metas.length);
      render();
      renderNote(!!note);
    }

    async function play() {
      const [id] = picked;
      if (!id) return;
      const k = await kept(id).catch(() => undefined);
      if (!k) {
        host.sfx.error();
        host.toast(t.playFailed, true);
        return;
      }
      const brush = await unpackBrush(k.brush, RANGE_W * RANGE_H);
      close();
      await host.play(k, id, brush);
    }

    // ---------- Undo: the bar over the foot ----------

    function offerUndo(next: NonNullable<typeof undo>, msg: string) {
      if (undo && 'gone' in undo) forgetUrls(undo.gone);
      undo = next;
      const bar = $('.bd-undo');
      bar.querySelector('span')!.textContent = msg;
      bar.hidden = false;
      bar.classList.remove('is-in');
      void bar.offsetWidth;
      bar.classList.add('is-in');
      clearTimeout(undoTimer);
      undoTimer = window.setTimeout(forget, 6000);
    }

    function forgetUrls(cards: Stored[]) {
      for (const c of cards) {
        const url = urls.get(c.meta.id);
        if (url) URL.revokeObjectURL(url);
        urls.delete(c.meta.id);
      }
    }

    /** The bar goes, and with it the change it could have taken back. */
    function forget() {
      clearTimeout(undoTimer);
      if (undo && 'gone' in undo) forgetUrls(undo.gone);
      undo = null;
      $('.bd-undo').hidden = true;
    }

    $('.bd-undo-btn').addEventListener('click', async () => {
      const was = undo;
      undo = null;
      forget();
      if (!was) return;
      let focus: string | undefined;
      if ('gone' in was) {
        await restore(was.gone);
        host.onBack(was.gone.map((c) => c.meta.id));
        host.announce(fill(t.back, { n: was.gone.length }));
        focus = was.gone[0]?.meta.id;
      } else {
        await place(was.moved.map(([id, slot]) => ({ ...metas.find((m) => m.id === id)!, slot })));
        focus = was.moved[0][0];
      }
      host.sfx.tick();
      await refresh();
      const slot = metas.find((m) => m.id === focus)?.slot;
      if (slot !== undefined && spreadOf(slot) !== spread) await turnTo(spreadOf(slot));
      root.querySelector<HTMLElement>(`.bd-card[data-id="${focus}"]`)?.focus({ preventScroll: true });
    });

    /**
     * Throws cards away at once, no question asked: they are read back whole first, so the bar can
     * put them back for a few seconds (more discards meanwhile join them). Focus stays where the card was.
     */
    async function remove(ids: string[]) {
      const slots = metas.filter((m) => ids.includes(m.id)).map((m) => m.slot);
      const gone = await Promise.all(metas.filter((m) => ids.includes(m.id)).map(stored));
      await discard(ids);
      host.onGone(ids);
      for (const id of ids) picked.delete(id);
      const all = undo && 'gone' in undo ? [...undo.gone, ...gone] : gone;
      if (undo && 'gone' in undo) undo = null;
      host.sfx.flip();
      await refresh();
      offerUndo({ gone: all }, fill(t.gone, { n: all.length }));
      const at = Math.min(...slots);
      (root.querySelector<HTMLElement>(`[data-slot="${at}"] .bd-card, .bd-keep[data-slot="${at}"]`) ?? root.querySelector<HTMLElement>('.bd-card, .bd-keep') ?? $('.bd-x')).focus({ preventScroll: true });
    }

    /** The card in pocket `from` goes to pocket `to` (a card there takes its place), kept at once. */
    async function move(from: number, to: number) {
      if (from === to || to < 0 || to >= MAX_CARDS || !lay[from]) return;
      const next = swap(lay, from, to);
      const changed = metas.filter((m) => next[m.slot] !== m.id);
      const before: [string, number][] = changed.map((m) => [m.id, m.slot]);
      const after = changed.map((m) => ({ ...m, slot: next.indexOf(m.id) }));
      metas = metas.map((m) => after.find((a) => a.id === m.id) ?? m);
      lay = next;
      render();
      host.sfx.tick();
      await place(after);
      offerUndo({ moved: before }, changed.length > 1 ? t.swapped : fill(t.moved, { page: Math.floor(to / PER_PAGE) + 1 }));
    }

    playBtn.addEventListener('click', () => void play());
    discardBtn.addEventListener('click', () => picked.size && void remove([...picked]));

    // ---------- Turning pages ----------

    /** A copy of a page, for the leaf that turns; nothing in it can be pressed. */
    function copy(sheet: Element, rect: DOMRect, box: DOMRect): HTMLElement {
      const c = sheet.cloneNode(true) as HTMLElement;
      c.classList.add('bd-copy');
      c.setAttribute('aria-hidden', 'true');
      c.inert = true;
      Object.assign(c.style, { position: 'absolute', margin: '0', left: `${rect.left - box.left}px`, top: `${rect.top - box.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      return c;
    }

    /**
     * Turns to another spread like a binder's page: the page on that side lifts at the rings and
     * turns over, showing the next page on its back. Held still, the pages just change.
     */
    async function turnTo(next: number) {
      next = Math.max(0, Math.min(spreads() - 1, next));
      if (next === spread || turning) return;
      const dir = next > spread ? 1 : -1;
      host.sfx.flip();
      if (still()) {
        spread = next;
        return render();
      }
      turning = true;
      const box = spreadEl.getBoundingClientRect();
      const old = [...spreadEl.querySelectorAll(':scope > .bd-sheet:not(.bd-copy)')];
      const lifting = dir > 0 ? old[old.length - 1] : old[0];
      const liftRect = lifting.getBoundingClientRect();
      const front = copy(lifting, liftRect, box);
      // One page: the old page stays under the one that comes back (turning to the previous page).
      const under = old.length === 1 && dir < 0 ? copy(lifting, liftRect, box) : null;
      spread = next;
      render();
      const fresh = [...spreadEl.querySelectorAll<HTMLElement>(':scope > .bd-sheet:not(.bd-copy)')];
      const landing = fresh.length > 1 ? (dir > 0 ? fresh[0] : fresh[fresh.length - 1]) : fresh[0];
      const back = copy(landing, landing.getBoundingClientRect(), box);
      const leaf = document.createElement('div');
      leaf.className = 'bd-leaf';
      leaf.setAttribute('aria-hidden', 'true');
      Object.assign(leaf.style, { left: front.style.left, top: front.style.top, width: front.style.width, height: front.style.height });
      for (const face of [front, back]) Object.assign(face.style, { left: '0', top: '0', width: '100%', height: '100%' });
      back.classList.add('bd-leaf-back');
      let frames: Keyframe[];
      if (fresh.length > 1) {
        // Two pages: the leaf turns on the rings between them and lands on the other side.
        const [l, r] = fresh.map((s) => s.getBoundingClientRect());
        const rings = (r.left - l.right) / 2;
        leaf.style.transformOrigin = dir > 0 ? `${-rings}px center` : `calc(100% + ${rings}px) center`;
        leaf.append(front, back);
        landing.style.visibility = 'hidden';
        frames = [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${dir > 0 ? -180 : 180}deg)` }];
      } else if (dir > 0) {
        // One page: it turns away over the rings, the next one under it.
        leaf.style.transformOrigin = 'left center';
        back.classList.add('is-blank');
        leaf.append(front, back);
        frames = [{ transform: 'rotateY(0deg)', opacity: 1 }, { transform: 'rotateY(-110deg)', opacity: 0 }];
      } else {
        // One page, going back: the previous page turns back over this one.
        leaf.style.transformOrigin = 'left center';
        front.replaceChildren(...back.cloneNode(true).childNodes);
        leaf.append(front);
        spreadEl.append(under!);
        landing.style.visibility = 'hidden';
        frames = [{ transform: 'rotateY(-110deg)', opacity: 0 }, { transform: 'rotateY(0deg)', opacity: 1 }];
      }
      spreadEl.append(leaf);
      turned = leaf.animate(frames, { duration: 480, easing: 'cubic-bezier(0.45, 0.05, 0.3, 1)' }).finished.catch(() => {});
      await turned;
      leaf.remove();
      under?.remove();
      landing.style.visibility = '';
      turning = false;
    }

    $('.bd-prev').addEventListener('click', () => void turnTo(spread - 1));
    $('.bd-next').addEventListener('click', () => void turnTo(spread + 1));
    const onWide = () => render();
    wide.addEventListener('change', onWide);

    // ---------- Dragging a card to another pocket ----------

    /** The end of a drag also fires a click on the card; it is not a pick. */
    let dragged = false;
    let held: { m: Placed; card: HTMLElement; x: number; y: number; id: number; timer: number; touch: boolean } | null = null;
    let drag: { m: Placed; float: HTMLElement; dx: number; dy: number; x: number; y: number; over: number | null; edge: -1 | 0 | 1; edgeTimer: number } | null = null;

    /** A press on a card: a mouse drags once it moves; a finger has to hold first, then lifts the card. */
    function press(e: PointerEvent, m: Placed, card: HTMLElement) {
      if (e.button !== 0 || drag || turning) return;
      const touch = e.pointerType !== 'mouse';
      held = { m, card, x: e.clientX, y: e.clientY, id: e.pointerId, touch, timer: touch ? window.setTimeout(() => lift(e.clientX, e.clientY), 380) : 0 };
    }

    function lift(x: number, y: number) {
      if (!held) return;
      const { m, card } = held;
      const r = card.getBoundingClientRect();
      const float = document.createElement('div');
      float.className = 'bd-float';
      float.setAttribute('aria-hidden', 'true');
      float.append(card.cloneNode(true));
      Object.assign(float.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      root.append(float);
      // Under a finger the card rides above it, so the pocket under the finger stays in sight.
      const touch = held.touch;
      drag = { m, float, dx: touch ? r.width / 2 : x - r.left, dy: touch ? r.height + 18 : y - r.top, x, y, over: null, edge: 0, edgeTimer: 0 };
      card.closest('.bd-slot')!.classList.add('is-lifted');
      root.classList.add('is-dragging');
      navigator.vibrate?.(8);
      host.sfx.tick();
      follow(x, y);
    }

    /** The real pocket at a point (not one on a page copy that is turning), or null. */
    function pocketAt(x: number, y: number): HTMLElement | null {
      const p = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
      return p && root.contains(p) && !p.closest('.bd-copy, .bd-leaf') ? p : null;
    }

    function follow(x: number, y: number) {
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      drag.float.style.translate = `${x - drag.dx - parseFloat(drag.float.style.left)}px ${y - drag.dy - parseFloat(drag.float.style.top)}px`;
      // The pocket under the finger lights up; held at a page's outer edge, the page turns.
      const under = pocketAt(x, y);
      const over = under ? +under.dataset.slot! : null;
      if (over !== drag.over) {
        root.querySelector('.is-target')?.classList.remove('is-target');
        if (over !== null && over !== drag.m.slot) under!.classList.add('is-target');
        drag.over = over;
      }
      const box = spreadEl.getBoundingClientRect();
      const nearPrev = x < box.left + 24 || !!document.elementFromPoint(x, y)?.closest('.bd-prev');
      const nearNext = x > box.right - 24 || !!document.elementFromPoint(x, y)?.closest('.bd-next');
      const edge = nearPrev && spread > 0 ? -1 : nearNext && spread < spreads() - 1 ? 1 : 0;
      if (edge !== drag.edge) {
        drag.edge = edge;
        clearTimeout(drag.edgeTimer);
        root.classList.toggle('is-edge-prev', edge < 0);
        root.classList.toggle('is-edge-next', edge > 0);
        if (edge) armEdge();
      }
    }

    /** Held at an edge, the page turns, and keeps turning while it stays there. */
    function armEdge() {
      if (!drag) return;
      drag.edgeTimer = window.setTimeout(async () => {
        if (!drag?.edge) return;
        await turnTo(spread + drag.edge);
        // The pockets under a finger that held still are new ones now.
        if (drag) follow(drag.x, drag.y);
        armEdge();
      }, 650);
    }

    function release(drop: boolean) {
      if (held) clearTimeout(held.timer);
      held = null;
      if (!drag) return;
      const { m, float, x, y, edgeTimer } = drag;
      clearTimeout(edgeTimer);
      drag = null;
      dragged = true;
      // A click comes only when the pointer ends on the card itself; don't let a later one be eaten.
      setTimeout(() => (dragged = false), 0);
      float.remove();
      root.classList.remove('is-dragging', 'is-edge-prev', 'is-edge-next');
      root.querySelector('.is-target')?.classList.remove('is-target');
      root.querySelector('.is-lifted')?.classList.remove('is-lifted');
      // Dropped while a page turns, it lands in the pocket under it once the page is down.
      if (drop)
        void turned.then(() => {
          const to = pocketAt(x, y)?.dataset.slot;
          if (to !== undefined && +to !== m.slot) return move(m.slot, +to);
        });
    }

    const onMove = (e: PointerEvent) => {
      if (held && !drag && e.pointerId === held.id) {
        const d = Math.hypot(e.clientX - held.x, e.clientY - held.y);
        // A mouse lifts the card as it moves; a finger that moves before the hold is up lets go.
        if (!held.touch && d > 6) lift(e.clientX, e.clientY);
        else if (held.touch && d > 10) release(false);
      }
      if (drag) {
        e.preventDefault();
        follow(e.clientX, e.clientY);
      }
    };
    const onUp = (e: PointerEvent) => release(e.type === 'pointerup');
    addEventListener('pointermove', onMove, { passive: false });
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
    // A held finger brings up no menu or text selection on the card.
    root.addEventListener('contextmenu', (e) => (e.target as Element).closest('.bd-card') && e.preventDefault());

    const back = document.activeElement as HTMLElement | null;
    function close() {
      view = null;
      release(false);
      root.classList.remove('is-in');
      removeEventListener('keydown', onKey, true);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      wide.removeEventListener('change', onWide);
      forget();
      host.pause(false);
      setTimeout(() => {
        root.remove();
        for (const url of urls.values()) URL.revokeObjectURL(url);
      }, 180);
      (back?.isConnected ? back : host.chip).focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      const card = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.bd-slot');
      const at = card ? +card.dataset.slot! : -1;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (drag) return release(false);
        close();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // The card under focus, or else the picked ones.
        if (at >= 0) void remove([lay[at]!]);
        else if (picked.size) void remove([...picked]);
      } else if (e.altKey && at >= 0 && e.key.startsWith('Arrow')) {
        // Alt+arrows move the focused card a pocket along, or a row up or down, across pages too.
        e.preventDefault();
        const to = at + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 } as Record<string, number>)[e.key];
        if (!(to >= 0 && to < MAX_CARDS)) return;
        const id = lay[at]!;
        void move(at, to).then(async () => {
          if (spreadOf(to) !== spread) await turnTo(spreadOf(to));
          root.querySelector<HTMLElement>(`.bd-card[data-id="${id}"]`)?.focus({ preventScroll: true });
        });
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')].filter((b) => b.offsetParent && !b.closest('[inert]'));
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        items[e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1].focus();
      }
    };
    addEventListener('keydown', onKey, true);
    $('.bd-x').addEventListener('click', () => {
      host.sfx.tick();
      close();
    });
    root.addEventListener('pointerdown', (e) => e.target === root && close());
    view = { refresh };
    host.pause(true);
    document.body.append(root);
    requestAnimationFrame(() => root.classList.add('is-in'));
    void refresh(note).then(() => root.querySelector<HTMLElement>('.bd-keep, .bd-card')?.focus({ preventScroll: true }));
  }

  return { keep, open };
}
