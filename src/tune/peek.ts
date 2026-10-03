// On phones the panel sits far below the card, so tuning would happen blind. While the drawer
// is open and the card has scrolled away, a small live window shows it inside the drawer's
// sticky action bar, copied each frame from the stage canvas. Tapping it scrolls back up.

export interface Peek {
  readonly el: HTMLElement;
  readonly shown: boolean;
  setActive(on: boolean): void;
  setLabel(text: string): void;
}

export function mountPeek(onShow: (shown: boolean) => void): Peek {
  const slot = document.getElementById('cardSlot');
  const source = document.getElementById('cards') as HTMLCanvasElement | null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tune-peek';
  btn.hidden = true;
  const view = document.createElement('canvas');
  btn.appendChild(view);
  if (!slot || !source) return { el: btn, shown: false, setActive() {}, setLabel() {} };

  const narrow = matchMedia('(max-width: 900px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let offscreen = false;
  let raf = 0;

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
    if (show !== !btn.hidden) {
      btn.hidden = !show;
      onShow(show);
    }
    if (show && !raf) raf = requestAnimationFrame(draw);
    if (!show && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    const c = source!.getBoundingClientRect();
    const s = slot!.getBoundingClientRect();
    if (!c.width || !s.width) return;
    const k = source!.width / c.width;
    // A little margin around the slot so tilts and bobs stay in frame.
    const padX = s.width * 0.14;
    const padY = s.height * 0.1;
    const sx = (s.left - c.left - padX) * k;
    const sy = (s.top - c.top - padY) * k;
    const sw = (s.width + padX * 2) * k;
    const sh = (s.height + padY * 2) * k;
    const w = view.clientWidth * devicePixelRatio;
    const h = view.clientHeight * devicePixelRatio;
    if (view.width !== w || view.height !== h) {
      view.width = w;
      view.height = h;
    }
    const x = view.getContext('2d')!;
    x.clearRect(0, 0, w, h);
    x.drawImage(source!, sx, sy, sw, sh, 0, 0, w, h);
  }

  return {
    el: btn,
    get shown() {
      return !btn.hidden;
    },
    setActive(on) {
      active = on;
      update();
    },
    setLabel(text) {
      btn.setAttribute('aria-label', text);
      btn.title = text;
    },
  };
}
