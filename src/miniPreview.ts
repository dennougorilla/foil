// On phones the Finish area controls sit far below the card. While they are on screen and the card is not,
// a slim band across the top carries a small live copy of the card, so every change can be seen as it happens.
import { CardRenderer } from './gl/renderers';
import { tuneGl } from './tune/model';
import { cardLayers } from './layers';
import type { RangeSnapshot } from './gl/range';
import type { Dict } from './i18n';
import type { Store } from './state';
import { contain } from './card/shape';

const PIXEL_STEPS = [0, 96, 72, 56, 44, 34, 26];
const W = 84;
const H = Math.round((W * 7) / 5);
/** Height of the band, kept free at the top when the page scrolls a control into view. */
const BAND = H + 20;

export interface MiniPreviewOptions {
  store: Store;
  section: HTMLElement;
  card: HTMLElement;
  isPainting: () => boolean;
  reduced: MediaQueryList;
  /** The stage's overlay, and which layer it shows: the copy shows the same. */
  view: () => { rangeView: number; layer: 1 | 2 };
}

export class MiniPreview {
  private el: HTMLElement;
  private renderer: CardRenderer | null = null;
  private face: { face: HTMLCanvasElement; mask: HTMLCanvasElement } | null = null;
  private range: RangeSnapshot | null = null;
  private range2: RangeSnapshot | null = null;
  private sectionSeen = false;
  private cardSeen = true;
  private dismissed = false;
  private shown = false;
  private narrow = matchMedia('(max-width: 900px)');
  private t0 = performance.now();
  private dict: Dict | null = null;

  constructor(private o: MiniPreviewOptions) {
    this.el = document.createElement('div');
    this.el.className = 'mini';
    this.el.hidden = true;
    this.el.innerHTML = `
      <canvas class="mini-canvas" width="${W * 2}" height="${H * 2}" aria-hidden="true"></canvas>
      <div class="mini-text">
        <p class="mini-label"></p>
        <p class="mini-finish"></p>
        <button class="mini-jump link" type="button"></button>
      </div>
      <button class="mini-hide" type="button">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z" /></svg><span></span>
      </button>`;
    document.body.appendChild(this.el);
    this.el.querySelector('.mini-jump')!.addEventListener('click', () => {
      o.card.scrollIntoView({ block: 'center', behavior: o.reduced.matches ? 'auto' : 'smooth' });
    });
    this.el.querySelector('.mini-hide')!.addEventListener('click', () => {
      this.dismissed = true;
      this.update();
    });
    const watch = (target: Element, set: (v: boolean) => void, threshold: number) =>
      new IntersectionObserver((es) => {
        // isIntersecting alone is true for any sliver; hold it to the threshold.
        set(es[0].isIntersecting && es[0].intersectionRatio >= threshold);
        this.update();
      }, { threshold }).observe(target);
    watch(o.section, (v) => {
      this.sectionSeen = v;
      // Closing it only lasts until the section is left; coming back offers it again.
      if (!v) this.dismissed = false;
    }, 0);
    // The card counts as visible only when most of it is on screen.
    watch(o.card, (v) => (this.cardSeen = v), 0.6);
    this.narrow.addEventListener('change', () => this.update());
    o.store.on((_s, changed) => changed.has('edition') && this.label());
  }

  applyText(t: Dict) {
    this.dict = t;
    this.el.querySelector('.mini-label')!.textContent = t.preview;
    this.el.querySelector('.mini-jump')!.textContent = t.previewJump;
    const hide = this.el.querySelector('.mini-hide')!;
    hide.setAttribute('aria-label', t.previewHide);
    hide.setAttribute('title', t.previewHide);
    hide.querySelector('span')!.textContent = t.previewHideShort;
    this.label();
  }

  private label() {
    if (this.dict) this.el.querySelector('.mini-finish')!.textContent = this.dict.edition[this.o.store.get().edition];
  }

  setFace(face: HTMLCanvasElement, mask: HTMLCanvasElement) {
    this.face = { face, mask };
    if (this.renderer) this.renderer.setFace(face, mask);
  }

  setRange(s: RangeSnapshot) {
    this.range = s;
    this.renderer?.range.set(s);
  }

  setRange2(s: RangeSnapshot) {
    this.range2 = s;
    this.renderer?.range2.set(s);
  }

  /** Re-checks visibility, e.g. when brush mode starts or ends. */
  hide() {
    this.update();
  }

  private raf = 0;

  private update() {
    const show = this.narrow.matches && this.sectionSeen && !this.cardSeen && !this.dismissed && !this.o.isPainting();
    if (show === this.shown) return;
    this.shown = show;
    this.el.hidden = !show;
    // Keyboard focus and scrollIntoView keep controls clear of the band.
    document.documentElement.style.scrollPaddingTop = show ? `${BAND + 16}px` : '';
    // One loop at most: cancel the pending frame on hide, start a fresh one on show.
    cancelAnimationFrame(this.raf);
    if (show) {
      this.ensureRenderer();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  /** The second WebGL context is only made the first time the preview is needed. */
  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new CardRenderer(this.el.querySelector('canvas')!);
    if (this.face) this.renderer.setFace(this.face.face, this.face.mask);
    if (this.range) this.renderer.range.set(this.range);
    if (this.range2) this.renderer.range2.set(this.range2);
  }

  private frame = (now: number) => {
    const r = this.renderer;
    if (!this.shown || !r) return;
    const s = this.o.store.get();
    const view = this.o.view();
    r.tune = tuneGl(s.tune);
    const motion = !this.o.reduced.matches;
    r.range.motion = r.range2.motion = motion;
    const t = motion ? (now - this.t0) / 1000 : 0;
    r.resize(W, H, 2);
    r.begin();
    const ry = Math.sin(t * 0.8) * 0.12;
    const rx = Math.cos(t * 0.6) * 0.08;
    // The card in its own shape, fitted to the view.
    const f = this.face?.face;
    const { w, h } = contain(f ? f.height / f.width : 1.4, W - 6, H - 6 * 1.4);
    r.drawCard(
      {
        cx: W / 2,
        cy: H / 2,
        w,
        h,
        rx,
        ry,
        rz: 0,
        scale: 1,
        ...cardLayers(s, view.rangeView > 0 ? view.layer : 0),
        intensity: s.intensity,
        pixel: PIXEL_STEPS[s.pixel] ? Math.max(18, PIXEL_STEPS[s.pixel] * 0.5) : 0,
        tilt: [ry / 0.32, rx / 0.28],
        light: [0.5 - ry, 0.35 - rx],
        alpha: 1,
        flash: 0,
        shadow: [0, 0],
        rangeView: view.rangeView,
      },
      t,
    );
    this.raf = requestAnimationFrame(this.frame);
  };
}
