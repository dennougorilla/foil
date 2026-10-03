// Small live copies of the card, taken from the stage canvas: the proof beside the finish step
// (so the finish is shown as it really looks, not as a colour chip) and the phone preview.

import { motion } from './tune/motion';

/** How squarely the card face looks at us; copies hold their last face-on frame while a spin shows the back. */
export const facing = () => Math.cos(motion.spinAngle);

/**
 * Copies the card into `view`, with `pad` of its width and height around it so tilts and bobs
 * stay in frame. Returns false when there is nothing to copy yet. Call it from a frame callback
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
  x.drawImage(source, (s.left - c.left - px) * k, (s.top - c.top - py) * k, (s.width + px * 2) * k, (s.height + py * 2) * k, 0, 0, w, h);
  return true;
}

/** Keeps a proof of the card in `el` while it is on screen, refreshed twice a second (it is a thumbnail, not a film). */
export function mountProof(el: HTMLElement): void {
  const view = document.createElement('canvas');
  el.append(view);
  let raf = 0;
  let last = 0;
  let drawn = false;

  function draw(now: number) {
    raf = requestAnimationFrame(draw);
    if (now - last < 500) return;
    last = now;
    if (facing() < 0.35 && drawn) return;
    drawn = copyCard(view, 0.04, 0.03) && facing() >= 0.35;
  }

  new IntersectionObserver(([e]) => {
    cancelAnimationFrame(raf);
    raf = e.isIntersecting ? requestAnimationFrame(draw) : 0;
  }).observe(el);
  // The stage restarts its frame loop when the tab comes back; queue ours after it again.
  document.addEventListener('visibilitychange', () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });
}
