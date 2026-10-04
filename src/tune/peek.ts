// On phones the panel sits far below the card, so tuning would happen blind. While the Light &
// motion tab is open and the card has scrolled away, a small live window shows it inside the
// Save stub pinned to the bottom of the screen (so it never covers a control), copied each frame
// from the stage canvas. Tapping it scrolls back up.

import { copyCard, facing } from '../proof';

export interface Peek {
  readonly el: HTMLElement;
  setActive(on: boolean): void;
  setLabel(text: string, caption: string): void;
}

export function mountPeek(): Peek {
  const slot = document.getElementById('cardSlot');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tune-peek';
  btn.hidden = true;
  const view = document.createElement('canvas');
  const cap = document.createElement('span');
  cap.className = 'tune-peek-cap';
  cap.setAttribute('aria-hidden', 'true');
  btn.append(view, cap);
  if (!slot) return { el: btn, setActive() {}, setLabel() {} };

  const narrow = matchMedia('(max-width: 900px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let offscreen = false;
  let raf = 0;
  let drawn = false;

  btn.addEventListener('click', () => slot.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' }));

  new IntersectionObserver((entries) => {
    offscreen = !entries[0].isIntersecting;
    update();
  }).observe(slot);
  narrow.addEventListener('change', () => update());
  // The stage restarts its frame loop when the tab comes back; queue ours after it so we
  // always copy a finished frame.
  document.addEventListener('visibilitychange', () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });

  function update() {
    const show = active && offscreen && narrow.matches;
    btn.hidden = !show;
    if (show && !raf) raf = requestAnimationFrame(draw);
    if (!show && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    // Hold the last face-on frame while a spin shows the back (but always draw a first frame).
    if (facing() < 0.35 && drawn) return;
    drawn = copyCard(view, 0.14, 0.1) && facing() >= 0.35;
  }

  return {
    el: btn,
    setActive(on) {
      active = on;
      update();
    },
    setLabel(text, caption) {
      cap.textContent = caption;
      btn.setAttribute('aria-label', text);
      btn.title = text;
    },
  };
}
