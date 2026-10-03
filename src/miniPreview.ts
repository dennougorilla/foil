// On phones the Finish area controls sit far below the card. While they are on screen and the card is not,
// a small live copy of the card floats in the corner so every change can be seen as it happens.
import { CardRenderer } from './gl/renderers';
import { editionById } from './editions';
import type { RangeSnapshot } from './gl/range';
import type { Dict } from './i18n';
import type { Store } from './state';

const PIXEL_STEPS = [0, 96, 72, 56, 44, 34, 26];
const W = 104;
const H = Math.round((W * 7) / 5);

export interface MiniPreviewOptions {
  store: Store;
  section: HTMLElement;
  card: HTMLElement;
  isPainting: () => boolean;
  reduced: MediaQueryList;
}

export class MiniPreview {
  private el: HTMLElement;
  private renderer: CardRenderer | null = null;
  private face: { face: HTMLCanvasElement; mask: HTMLCanvasElement } | null = null;
  private range: RangeSnapshot | null = null;
  private sectionSeen = false;
  private cardSeen = true;
  private dismissed = false;
  private shown = false;
  private narrow = matchMedia('(max-width: 900px)');
  private t0 = performance.now();

  constructor(private o: MiniPreviewOptions) {
    this.el = document.createElement('div');
    this.el.className = 'mini';
    this.el.hidden = true;
    this.el.innerHTML = `
      <button class="mini-card" type="button"><canvas width="${W * 2}" height="${H * 2}"></canvas></button>
      <p class="mini-label"><span></span><button class="mini-hide" type="button">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v2H3zm2 2h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm2 2h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z" /></svg>
      </button></p>`;
    document.body.appendChild(this.el);
    this.el.querySelector('.mini-card')!.addEventListener('click', () => {
      o.card.scrollIntoView({ block: 'center', behavior: o.reduced.matches ? 'auto' : 'smooth' });
    });
    this.el.querySelector('.mini-hide')!.addEventListener('click', () => {
      this.dismissed = true;
      this.update();
    });
    const watch = (target: Element, set: (v: boolean) => void, threshold: number) =>
      new IntersectionObserver((es) => {
        set(es[0].isIntersecting);
        this.update();
      }, { threshold }).observe(target);
    watch(o.section, (v) => (this.sectionSeen = v), 0);
    // The card counts as visible only when most of it is on screen.
    watch(o.card, (v) => (this.cardSeen = v), 0.6);
    this.narrow.addEventListener('change', () => this.update());
  }

  applyText(t: Dict) {
    this.el.querySelector('.mini-label span')!.textContent = t.preview;
    const card = this.el.querySelector('.mini-card')!;
    card.setAttribute('aria-label', t.previewJump);
    card.setAttribute('title', t.previewJump);
    const hide = this.el.querySelector('.mini-hide')!;
    hide.setAttribute('aria-label', t.previewHide);
    hide.setAttribute('title', t.previewHide);
  }

  setFace(face: HTMLCanvasElement, mask: HTMLCanvasElement) {
    this.face = { face, mask };
    if (this.renderer) this.renderer.setFace(face, mask);
  }

  setRange(s: RangeSnapshot) {
    this.range = s;
    this.renderer?.range.set(s);
  }

  hide() {
    this.update();
  }

  private update() {
    const show = this.narrow.matches && this.sectionSeen && !this.cardSeen && !this.dismissed && !this.o.isPainting();
    if (show === this.shown) return;
    this.shown = show;
    this.el.hidden = !show;
    if (show) {
      this.ensureRenderer();
      requestAnimationFrame(this.frame);
    }
  }

  /** The second WebGL context is only made the first time the preview is needed. */
  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new CardRenderer(this.el.querySelector('canvas')!);
    if (this.face) this.renderer.setFace(this.face.face, this.face.mask);
    if (this.range) this.renderer.range.set(this.range);
    this.renderer.range.motion = !this.o.reduced.matches;
  }

  private frame = (now: number) => {
    const r = this.renderer;
    if (!this.shown || !r) return;
    const s = this.o.store.get();
    const motion = !this.o.reduced.matches;
    r.range.motion = motion;
    const t = motion ? (now - this.t0) / 1000 : 0;
    r.resize(W, H, 2);
    r.begin();
    const ry = Math.sin(t * 0.8) * 0.12;
    const rx = Math.cos(t * 0.6) * 0.08;
    r.drawCard(
      {
        cx: W / 2,
        cy: H / 2,
        w: W - 8,
        h: H - 8 * 1.4,
        rx,
        ry,
        rz: 0,
        scale: 1,
        edition: editionById(s.edition).shader,
        intensity: s.intensity,
        pixel: PIXEL_STEPS[s.pixel] ? Math.max(18, PIXEL_STEPS[s.pixel] * 0.5) : 0,
        tilt: [ry / 0.32, rx / 0.28],
        light: [0.5 - ry, 0.35 - rx],
        alpha: 1,
        flash: 0,
        shadow: [0, 0],
        rangeView: 1,
      },
      t,
    );
    requestAnimationFrame(this.frame);
  };
}
