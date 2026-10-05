// Small live copies of the card, taken from the stage canvas: the proof beside the finish step
// (so the finish is shown as it really looks, not as a colour chip) and the phone preview.

import { motion } from './tune/motion';
import { STAGE_RESUMED } from './stage';
import { contain } from './card/shape';

/** How squarely the card face looks at us; copies hold their last face-on frame while a spin or a flip shows the back. */
export const facing = () => Math.cos(motion.spinAngle + motion.flip);

/**
 * Copies the card into `view`, with `pad` of its width and height around it so tilts and bobs
 * stay in frame; a card of another shape than the view is fitted inside it, centred. Returns false when there is nothing to copy yet. Call it from a frame callback
 * queued after the stage's, so it always copies a finished frame.
 */
export function copyCard(view: HTMLCanvasElement, padX: number, padY: number): boolean {
  const slot = document.getElementById('cardSlot');
  const source = document.getElementById('cards') as HTMLCanvasElement | null;
  if (!slot || !source) return false;
  const c = source.getBoundingClientRect();
  const s = slot.getBoundingClientRect();
  if (!c.width || !s.width || !view.clientWidth) return false;
  const k = source.width / c.width;
  const px = s.width * padX;
  const py = s.height * padY;
  const w = view.clientWidth * devicePixelRatio;
  const h = view.clientHeight * devicePixelRatio;
  if (view.width !== w || view.height !== h) {
    view.width = w;
    view.height = h;
  }
  const x = view.getContext('2d')!;
  x.clearRect(0, 0, w, h);
  const sw = s.width + px * 2;
  const sh = s.height + py * 2;
  const d = contain(sh / sw, w, h);
  x.drawImage(source, (s.left - c.left - px) * k, (s.top - c.top - py) * k, sw * k, sh * k, (w - d.w) / 2, (h - d.h) / 2, d.w, d.h);
  return true;
}

/**
 * Keeps a proof of the card in `el`, refreshed twice a second (it is a thumbnail, not a film), and
 * only while it is on screen: a copy reads the stage canvas back from the GPU, and on a phone the
 * proofs sit far below the card.
 */
export function mountProof(el: HTMLElement): void {
  const view = document.createElement('canvas');
  el.append(view);
  let raf = 0;
  let last = 0;
  let drawn = false;
  let shown = false;

  function draw(now: number) {
    raf = requestAnimationFrame(draw);
    if (now - last < 500) return;
    last = now;
    if (facing() < 0.35 && drawn) return;
    drawn = copyCard(view, 0.04, 0.03) && facing() >= 0.35;
  }

  // The stage restarts its frame loop when the tab comes back or a pack opening closes; queue ours after it again.
  const start = () => {
    cancelAnimationFrame(raf);
    raf = shown ? requestAnimationFrame(draw) : 0;
  };
  new IntersectionObserver((entries) => {
    shown = entries[entries.length - 1].isIntersecting;
    // Coming into view, it copies a fresh frame at once.
    last = 0;
    start();
  }).observe(el);
  document.addEventListener(STAGE_RESUMED, start);
}
