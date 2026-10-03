// Hidden finishes for supporters.
//
// This is an honour system with no server: opening either of the app's existing
// support links (GitHub Sponsors or Buy Me a Coffee, in the header's Support menu)
// unlocks four extra finishes in this browser right away. Nothing checks that a
// payment happened, and the flag lives in localStorage, so clearing site data
// locks them again. That's deliberate: it's a thank-you, not DRM.
//
// The flag is kept under its own key rather than in the State store so that undo,
// resets or a store schema bump can never take an unlock back.

import './sponsor.css';
import { type EditionId, editionById } from './editions';
import { CardRenderer } from './gl/renderers';
import { sfx } from './audio';
import type { Dict } from './i18n';
import type { HandMode, Stage } from './stage';
import type { Store } from './state';

export const SPONSOR_EDITIONS: EditionId[] = ['kintsugi', 'opal', 'eclipse', 'raden'];

const KEY = 'foil:sponsor';
/** Where a card restored from storage lands if its hidden finish is locked (the store's default). */
const FALLBACK: EditionId = 'holo';

const readUnlocked = () => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
};

let unlocked = readUnlocked();

export const isSponsorEdition = (id: EditionId) => SPONSOR_EDITIONS.includes(id);
export const isLocked = (id: EditionId) => !unlocked && isSponsorEdition(id);

/**
 * Kept quiet on purpose: while locked, the hidden finishes stay out of the hand
 * and a single face-down card at the end stands in for all of them.
 */
export const handMode = (id: EditionId): HandMode =>
  !isLocked(id) ? 'front' : id === SPONSOR_EDITIONS[0] ? 'back' : 'hidden';

/** Run before anything reads the edition: a locked finish restored from a past visit falls back quietly. */
export function releaseLockedEdition(store: Store) {
  if (isLocked(store.get().edition)) store.set({ edition: FALLBACK });
}

export interface SponsorOptions {
  store: Store;
  stage: Stage;
  dict: () => Dict;
  /** Put a finish on the card (already past the lock). */
  apply: (id: EditionId) => void;
  toast: (msg: string) => void;
  /** The live card face, so the dialog shows the person's own card. */
  face: () => { face: HTMLCanvasElement; mask: HTMLCanvasElement; back: HTMLCanvasElement };
}

const HEART_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h3v1h1v1h2V3h1V2h3v1h1v5h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V8H2V3h1z"/></svg>';
const STAR_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1h2v4h1v1h4v2h-4v1H9v4H7V9H6V8H2V6h4V5h1z"/></svg>';
const CLOSE_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z"/></svg>';

export function initSponsor(o: SponsorOptions) {
  const { store, stage } = o;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let t = o.dict();

  // ---------- Hand: the face-down secret card ----------

  const slot = (id: EditionId) => document.querySelector<HTMLButtonElement>(`.hand-slot[data-id="${id}"]`);

  function syncSlots() {
    const secret = slot(SPONSOR_EDITIONS[0]);
    if (!secret) return;
    const locked = isLocked(SPONSOR_EDITIONS[0]);
    secret.toggleAttribute('data-secret', locked);
    for (const id of SPONSOR_EDITIONS) slot(id)?.toggleAttribute('data-hidden-finish', !locked);
    if (locked) {
      secret.setAttribute('aria-haspopup', 'dialog');
      secret.setAttribute('aria-label', t.sponsorSecret);
      secret.setAttribute('aria-description', t.sponsorSecretHint);
    } else {
      secret.removeAttribute('aria-haspopup');
      secret.setAttribute('aria-label', t.edition[SPONSOR_EDITIONS[0]]);
      secret.setAttribute('aria-description', t.look[SPONSOR_EDITIONS[0]]);
    }
  }

  // ---------- Support menu: the existing two links are the key ----------

  const btn = document.getElementById('supportBtn');
  const menu = document.getElementById('supportMenu');
  const note = document.createElement('p');
  note.className = 'sp-menu-note';
  note.hidden = true;
  menu?.querySelector('.support-title')?.after(note);
  menu?.querySelectorAll<HTMLAnchorElement>('.support-link').forEach((a) => a.addEventListener('click', unlock));
  // The hint only shows when the secret card sent you here; otherwise the menu stays as it was.
  let hinting = false;
  btn?.addEventListener('click', () => {
    if (!hinting) syncMenu();
    hinting = false;
  });

  function syncMenu(hint = false) {
    note.hidden = !unlocked && !hint;
    note.classList.toggle('is-hint', !unlocked && hint);
    menu?.classList.toggle('sp-hinting', !unlocked && hint);
    note.innerHTML = `${unlocked ? HEART_SVG : STAR_SVG}<span></span>`;
    note.querySelector('span')!.textContent = unlocked ? t.sponsorMenuDone : t.sponsorMenuHint;
  }

  // ---------- Dialog: what the face-down card is ----------

  const dlg = document.createElement('dialog');
  dlg.className = 'sp-dialog';
  dlg.setAttribute('aria-labelledby', 'spTitle');
  dlg.setAttribute('aria-describedby', 'spBody');
  dlg.innerHTML = `
    <div class="sp-preview">
      <canvas class="sp-canvas" aria-hidden="true"></canvas>
      <p class="sp-glimpse" aria-hidden="true"><b></b><span class="sp-count"></span><span class="sp-dots">${SPONSOR_EDITIONS.map(() => '<i></i>').join('')}</span></p>
    </div>
    <div class="sp-copy">
      <p class="sp-eyebrow">${STAR_SVG}<span></span></p>
      <h2 class="sp-title" id="spTitle"></h2>
      <p class="sp-body" id="spBody"><span></span> <span></span></p>
      <div class="sp-actions">
        <button class="btn sp-cta" type="button">${HEART_SVG}<span class="btn-text"><b></b><small></small></span></button>
        <button class="sp-later" type="button"></button>
      </div>
      <p class="sp-honor"></p>
    </div>
    <button class="sp-close" type="button">${CLOSE_SVG}</button>`;
  document.body.appendChild(dlg);
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
  const canvas = q<HTMLCanvasElement>('.sp-canvas');
  let returnFocus: HTMLElement | null = null;

  /** Closing a modal puts focus back on the hand card, which would scroll the page to it; hold it still. */
  function shut() {
    const page = document.scrollingElement;
    const top = page?.scrollTop ?? 0;
    dlg.classList.remove('is-closing');
    dlg.close();
    if (page) page.scrollTop = top;
  }

  function applyText() {
    t = o.dict();
    q('.sp-eyebrow span').textContent = t.sponsorSecret;
    q('.sp-title').textContent = t.sponsorTitle;
    const body = q('.sp-body').children;
    body[0].textContent = t.sponsorBody;
    body[1].textContent = t.sponsorThanks;
    q('.sp-cta b').textContent = t.sponsorCta;
    q('.sp-cta small').textContent = t.sponsorCtaSub;
    q('.sp-later').textContent = t.sponsorLater;
    q('.sp-honor').textContent = t.sponsorHonor;
    q('.sp-close').setAttribute('aria-label', t.close);
    q('.sp-close').title = t.close;
    syncSlots();
    shown = '';
    if (!note.hidden) syncMenu(note.classList.contains('is-hint'));
  }

  function open() {
    returnFocus = document.activeElement as HTMLElement | null;
    sfx.flip();
    const f = o.face();
    preview().setFace(f.face, f.mask);
    preview().setBack(f.back);
    started = performance.now();
    dlg.showModal();
    // Land on the action, not the close button, so Enter does the obvious thing.
    q('.sp-cta').focus({ preventScroll: true });
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function close(then?: () => void) {
    if (!dlg.open) return;
    dlg.classList.add('is-closing');
    const done = () => {
      shut();
      if (then) then();
      else returnFocus?.focus({ preventScroll: true });
    };
    if (reduced.matches) done();
    else setTimeout(done, 160);
  }

  q('.sp-close').addEventListener('click', () => close());
  q('.sp-later').addEventListener('click', () => {
    sfx.tick();
    close();
  });
  // The one action points at the support links that are already in the header.
  q('.sp-cta').addEventListener('click', () =>
    close(() => {
      if (menu?.hidden) {
        hinting = true;
        syncMenu(true);
        btn?.click();
      } else {
        menu?.querySelector<HTMLAnchorElement>('a')?.focus();
      }
    }),
  );
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // A click on the backdrop (outside the panel box) dismisses, like the support menu.
  dlg.addEventListener('pointerdown', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  });
  // Keys typed in the dialog stay in the dialog (1–0 would otherwise switch the card behind it).
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
  });

  // ---------- Preview: the person's own card, turning, giving glimpses ----------

  let renderer: CardRenderer | null = null;
  const preview = () => (renderer ??= new CardRenderer(canvas));
  let raf = 0;
  let started = 0;

  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const REST = 0.6;
  const FLIP = 0.7;
  const HOLD = 2.6;
  const CYCLE = REST + FLIP + HOLD + FLIP;
  function glimpse(s: number) {
    const turn = Math.floor(s / CYCLE);
    const c = s - turn * CYCLE;
    let angle = Math.PI;
    if (c >= REST + FLIP + HOLD) angle = Math.PI * (2 + ease((c - REST - FLIP - HOLD) / FLIP));
    else if (c >= REST + FLIP) angle = Math.PI * 2;
    else if (c >= REST) angle = Math.PI * (1 + ease((c - REST) / FLIP));
    return { angle, turn };
  }

  /** Names the finish on show and counts it, "2 of 4"; while face down it keeps the name back. */
  let shown = '';
  function caption(n: number, faceUp: boolean) {
    const key = `${n}:${faceUp}:${t.sponsorSecret}`;
    if (key === shown) return;
    shown = key;
    const cap = q('.sp-glimpse');
    cap.classList.toggle('is-down', !faceUp);
    q('.sp-glimpse b').textContent = faceUp ? t.edition[SPONSOR_EDITIONS[n]] : '? ? ?';
    q('.sp-count').textContent = t.sponsorGlimpse.replace('{n}', String(n + 1));
    cap.querySelectorAll('.sp-dots i').forEach((d, i) => d.classList.toggle('is-on', i === n));
  }

  function draw(now: number) {
    if (!dlg.open) {
      raf = 0;
      return;
    }
    const r = preview();
    const box = canvas.getBoundingClientRect();
    r.resize(box.width, box.height, Math.min(devicePixelRatio || 1, 2));
    r.begin();
    const time = now / 1000;
    const motion = !reduced.matches;
    // Rests face down, flips to give a glimpse, holds, flips back; each time it
    // comes round, the next hidden finish is on the front. Reduced motion holds one still glimpse.
    const { angle, turn } = motion ? glimpse((now - started) / 1000) : { angle: 0.3, turn: 0 };
    const n = turn % SPONSOR_EDITIONS.length;
    const id = SPONSOR_EDITIONS[n];
    caption(n, Math.cos(angle) > 0.2);
    const ry = angle + (motion ? Math.sin(time * 0.8) * 0.18 : 0);
    const rx = motion ? Math.sin(time * 0.6) * 0.1 : -0.08;
    // Leave room under the card for the name and count.
    const h = Math.min(box.height * 0.76, (box.width * 0.8 * 7) / 5);
    r.drawCard(
      {
        cx: box.width / 2,
        cy: box.height / 2 - 14 + (motion ? Math.sin(time * 1.3) * 3 : 0),
        w: (h * 5) / 7,
        h,
        rx,
        ry,
        rz: motion ? Math.sin(time * 0.9) * 0.02 : 0,
        scale: 1,
        edition: editionById(id).shader,
        intensity: Math.max(store.get().intensity, 0.6),
        pixel: 0,
        tilt: [Math.sin(ry) * 1.2, rx / 0.28],
        light: [0.5 - Math.sin(ry) * 0.4, 0.38 - rx * 1.2],
        alpha: 1,
        flash: 0,
        shadow: [8 - Math.sin(ry) * 14, 12 + rx * 8],
      },
      time,
    );
    raf = requestAnimationFrame(draw);
  }

  // ---------- Unlock ----------

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* storage unavailable: unlocked for this visit only */
    }
    // The support page opens in a new tab; save the moment for when they come back.
    setTimeout(() => {
      if (!document.hidden) celebrate();
      else {
        const back = () => {
          if (document.hidden) return;
          document.removeEventListener('visibilitychange', back);
          setTimeout(celebrate, 250);
        };
        document.addEventListener('visibilitychange', back);
      }
    }, 450);
  }

  function celebrate() {
    if (dlg.open) shut();
    // Coming back from the support page: fold the menu away so the card is in full view.
    if (menu && !menu.hidden) {
      menu.hidden = true;
      btn?.setAttribute('aria-expanded', 'false');
    }
    syncMenu();
    syncSlots();
    // The secret card turns over, the other three are dealt in, and the first one lands on the card.
    stage.syncHandModes(true);
    sfx.flip();
    setTimeout(() => sfx.coin(), 380);
    o.toast(t.sponsorUnlocked);
    const first = SPONSOR_EDITIONS[0];
    setTimeout(() => {
      o.apply(first);
      stage.burst('#f2c14e');
    }, reduced.matches ? 0 : 420);
  }

  // ---------- Keep a locked finish off the card ----------

  let allowed = store.get().edition;
  store.on((s, changed) => {
    if (changed.has('lang')) applyText();
    if (!changed.has('edition')) return;
    // Anything that restores state (another tab, a future undo) can't sneak a locked finish on.
    if (isLocked(s.edition)) store.set({ edition: allowed });
    else allowed = s.edition;
  });
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    unlocked = readUnlocked();
    syncSlots();
    syncMenu();
    stage.syncHandModes(true);
    releaseLockedEdition(store);
  });

  applyText();

  // ---------- Touch: no hover, so the first tap says what the card is ----------

  const tip = document.createElement('p');
  tip.className = 'sp-tip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  document.body.appendChild(tip);
  let lastPointer = '';
  let armedUntil = 0;
  let tipTimer = 0;
  slot(SPONSOR_EDITIONS[0])?.addEventListener('pointerdown', (e) => (lastPointer = e.pointerType));
  const hideTip = () => {
    tip.hidden = true;
    armedUntil = 0;
  };
  document.addEventListener('pointerdown', (e) => {
    if (!tip.hidden && !(e.target as Element).closest?.('.hand-slot[data-secret]')) hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  function showTip() {
    const el = slot(SPONSOR_EDITIONS[0]);
    if (!el) return;
    const r = el.getBoundingClientRect();
    tip.textContent = t.sponsorTapHint;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 10)}px`;
    armedUntil = performance.now() + 4000;
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(hideTip, 4000);
    sfx.tick();
  }

  return {
    /** True when the finish is locked; the secret card's dialog opens instead. */
    gate(id: EditionId): boolean {
      if (!isLocked(id)) return false;
      const touch = lastPointer === 'touch';
      lastPointer = '';
      if (touch && performance.now() > armedUntil) {
        showTip();
        return true;
      }
      hideTip();
      open();
      return true;
    },
  };
}
