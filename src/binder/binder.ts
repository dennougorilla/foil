// The binder: Keep puts the card on the stage into it, and it opens as pages of nine pockets
// holding still thumbnails (plain images, no WebGL). Picking cards lifts them; Play puts one back
// on the stage, Discard throws the picked ones away. Loaded the first time it is used; see docs/binder.md.

import './binder.css';
import type { Card } from '../state';
import type { Dict, Lang } from '../i18n';
import { renderStill, STILL_PAD, type ExportInput } from '../exporter';
import { FACE_H, FACE_W } from '../card/face';
import { formatBytes } from '../anim/apngUi';
import { discard, fillOf, kept, list, put, thumb, type Kept, type Meta } from './db';
import { MAX_BYTES, MAX_CARDS, pageCount, pocketsOn, refusal } from './limits';

const TEXT = {
  ja: {
    title: 'バインダー',
    hint: 'クリックで選ぶ・ダブルクリックですぐステージへ',
    hintTouch: 'タップで選んで「ステージに出す」',
    pickedOne: '{card}・{date} にしまったカード',
    pickedMany: '{n} 枚を選択中・ステージに出せるのは 1 枚です',
    empty: 'まだ空です。カードができたら「しまう」で入れましょう',
    full: '54 枚の上限です。捨てて空きを作ってください',
    fullBytes: '60 MB の上限です。捨てて空きを作ってください',
    keepPocket: '今のカードをしまう',
    play: 'ステージに出す',
    playLabel: '選んだカードをステージに出す',
    playOne: '1 枚だけ選んでください',
    discard: '捨てる',
    confirm: '{n} 枚を捨てる？',
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
    hint: 'Click to pick · double-click to put it on the stage',
    hintTouch: 'Tap to pick, then To stage',
    pickedOne: '{card}, kept {date}',
    pickedMany: '{n} picked · only one goes on the stage',
    empty: 'Empty for now. Finish a card, then press Keep.',
    full: '54-card limit reached. Discard to make room.',
    fullBytes: '60 MB limit reached. Discard to make room.',
    keepPocket: 'Keep the card on the stage',
    play: 'To stage',
    playLabel: 'Put the picked card on the stage',
    playOne: 'Pick just one card',
    discard: 'Discard',
    confirm: 'Discard {n}?',
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
  /** Puts a kept card on the stage. */
  play: (k: Kept) => Promise<void>;
  /** The stage rests while the binder covers it. */
  pause: (on: boolean) => void;
  toast: (msg: string, error?: boolean) => void;
  /** Said to screen readers only: the binder and the chip already show it. */
  announce: (msg: string) => void;
  onCount: (n: number) => void;
  /** The card on the stage is now in the binder. */
  onKept: () => void;
  sfx: { tick(): void; coin(): void; error(): void; flip(): void };
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The still card, without its clear margin, shrunk to the thumbnail. */
async function thumbnail(input: ExportInput): Promise<Blob> {
  const src = await renderStill(input);
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, STILL_PAD, STILL_PAD, FACE_W, FACE_H, 0, 0, TW, TH);
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

  async function keep(): Promise<void> {
    const t = text();
    // The card as it is at the press: edits made while it is being kept don't change it.
    const card = host.card();
    const input = host.input();
    const source = host.picture();
    try {
      const metas = await list();
      // A full binder needs no picture to say so.
      const full = refusal(fillOf(metas), 0);
      if (full) return open(full);
      const [picture, thumb] = await Promise.all([keptPicture(source), thumbnail(input)]);
      const bytes = thumb.size + (picture?.size ?? 0);
      const no = refusal(fillOf(metas), bytes);
      if (no) return open(no);
      const meta: Meta = { id: newId(), at: Date.now(), name: input.name, edition: input.edition.id, bytes };
      await put(meta, thumb, { card, picture });
      const n = metas.length + 1;
      host.onCount(n);
      host.onKept();
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
    let metas: Meta[] = [];
    let spread = 0;
    const picked = new Set<string>();
    const urls = new Map<string, string>();
    let confirmTimer = 0;

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
        <div class="bd-spread"></div>
        <footer class="bd-foot">
          <nav class="bd-nav">
            <button class="bd-turn bd-prev" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2h2v2H9zM7 4h2v2H7zM5 6h2v4H5zm2 4h2v2H7zm2 2h2v2H9z"/></svg></button>
            <span class="bd-page"></span>
            <button class="bd-turn bd-next" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2h2v2H5zm2 2h2v2H7zm2 2h2v4H9zm-2 4h2v2H7zm-2 2h2v2H5z"/></svg></button>
          </nav>
          <button class="bd-btn bd-play" type="button"><span></span></button>
          <button class="bd-btn bd-discard" type="button"><span></span></button>
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

    /** The card on the stage, faint in the pocket it would go into: its flat face, no finish drawn. */
    const ghost = () => {
      const c = document.createElement('canvas');
      c.width = TW / 2;
      c.height = TH / 2;
      c.getContext('2d')!.drawImage(host.input().face, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.8);
    };
    const perSpread = () => (wide.matches ? 2 : 1);
    const spreads = () => Math.ceil(pageCount(metas.length) / perSpread());

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
      if (!n) unconfirm();
      const confirming = discardBtn.dataset.confirm === 'true';
      $('.bd-discard span').textContent = confirming ? fill(t.confirm, { n }) : t.discard;
      renderNote();
    }

    function unconfirm() {
      clearTimeout(confirmTimer);
      delete discardBtn.dataset.confirm;
    }

    function render() {
      const f = fillOf(metas);
      const editions = host.dict().edition;
      $('.bd-count').textContent = fill(t.count, { n: f.count, max: MAX_CARDS });
      $('.bd-bytes').textContent = fill(t.bytes, { used: formatBytes(f.bytes), max: formatBytes(MAX_BYTES) });
      // The bar is the space; the count says the cards. Whichever ran out turns red.
      $('.bd-meter i').style.setProperty('--f', Math.min(1, f.bytes / MAX_BYTES).toFixed(3));
      root.dataset.full = refusal(f, 0) ?? '';
      root.classList.toggle('is-empty', f.count === 0);
      spread = Math.min(spread, spreads() - 1);
      const ids = metas.map((m) => m.id);
      const byId = new Map(metas.map((m) => [m.id, m]));
      spreadEl.textContent = '';
      spreadEl.style.setProperty('--pages', String(perSpread()));
      for (let p = spread * perSpread(); p < (spread + 1) * perSpread(); p++) {
        const sheet = document.createElement('div');
        sheet.className = 'bd-sheet';
        sheet.setAttribute('role', 'group');
        sheet.setAttribute('aria-label', fill(t.pagesLabel, { a: p + 1, n: pageCount(metas.length) }));
        for (const pocket of pocketsOn(ids, p)) {
          if (pocket === 'keep') {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bd-pocket bd-keep';
            b.innerHTML = '<img class="bd-ghost" alt=""><i aria-hidden="true">+</i><span></span>';
            b.querySelector('img')!.src = ghost();
            b.lastElementChild!.textContent = t.keepPocket;
            b.addEventListener('click', () => {
              host.sfx.tick();
              void keep();
            });
            sheet.append(b);
          } else if (pocket) {
            const m = byId.get(pocket)!;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bd-pocket bd-card';
            b.dataset.id = m.id;
            b.setAttribute('aria-pressed', String(picked.has(m.id)));
            const label = fill(t.card, { name: m.name, finish: editions[m.edition] ?? m.edition });
            b.setAttribute('aria-label', label);
            b.title = label;
            const img = document.createElement('img');
            img.alt = '';
            img.decoding = 'async';
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
              host.sfx.tick();
              if (picked.has(m.id)) picked.delete(m.id);
              else picked.add(m.id);
              b.setAttribute('aria-pressed', String(picked.has(m.id)));
              unconfirm();
              syncButtons();
            });
            b.addEventListener('dblclick', () => {
              picked.clear();
              picked.add(m.id);
              void play();
            });
            sheet.append(b);
          } else {
            const e = document.createElement('span');
            e.className = 'bd-pocket bd-empty';
            sheet.append(e);
          }
        }
        // Two open pages meet at the binder's rings.
        if (spreadEl.childElementCount) spreadEl.insertAdjacentHTML('beforeend', '<div class="bd-rings" aria-hidden="true"><i></i><i></i><i></i></div>');
        spreadEl.append(sheet);
      }
      const first = spread * perSpread() + 1;
      const last = Math.min(pageCount(metas.length), first + perSpread() - 1);
      const n = pageCount(metas.length);
      $('.bd-page').textContent = fill(t.pages, { a: first === last ? first : `${first}–${last}`, n });
      $<HTMLButtonElement>('.bd-prev').disabled = spread === 0;
      $<HTMLButtonElement>('.bd-next').disabled = spread >= spreads() - 1;
      $('.bd-nav').hidden = spreads() < 2;
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
      metas = await list();
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
      close();
      await host.play(k);
    }

    playBtn.addEventListener('click', () => void play());
    discardBtn.addEventListener('click', async () => {
      if (!picked.size) return;
      if (discardBtn.dataset.confirm !== 'true') {
        host.sfx.tick();
        discardBtn.dataset.confirm = 'true';
        clearTimeout(confirmTimer);
        confirmTimer = window.setTimeout(() => {
          unconfirm();
          syncButtons();
        }, 3000);
        syncButtons();
        return;
      }
      unconfirm();
      const ids = [...picked];
      picked.clear();
      await discard(ids);
      for (const id of ids) {
        const url = urls.get(id);
        if (url) URL.revokeObjectURL(url);
        urls.delete(id);
      }
      host.sfx.flip();
      host.announce(fill(t.gone, { n: ids.length }));
      await refresh();
      root.querySelector<HTMLElement>('.bd-card, .bd-keep')?.focus({ preventScroll: true });
    });
    $('.bd-prev').addEventListener('click', () => {
      host.sfx.tick();
      spread = Math.max(0, spread - 1);
      render();
    });
    $('.bd-next').addEventListener('click', () => {
      host.sfx.tick();
      spread = Math.min(spreads() - 1, spread + 1);
      render();
    });
    const onWide = () => render();
    wide.addEventListener('change', onWide);

    const back = document.activeElement as HTMLElement | null;
    function close() {
      view = null;
      root.classList.remove('is-in');
      removeEventListener('keydown', onKey, true);
      wide.removeEventListener('change', onWide);
      unconfirm();
      host.pause(false);
      setTimeout(() => {
        root.remove();
        for (const url of urls.values()) URL.revokeObjectURL(url);
      }, 180);
      (back?.isConnected ? back : host.chip).focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (picked.size) discardBtn.click();
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')].filter((b) => b.offsetParent);
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
