// In Fixed light mode, a little sun sits on the main card where the light is. Drag it around
// the card (or focus it and use the arrow keys) to aim the light; a dashed ring shows the path.
import { fixedLight, TUNE_DEFAULTS } from './model';

export interface SunHandle {
  update(opts: { show: boolean; angle: number; label: string; title: string; keys: string }): void;
}

const ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 0h2v3H7zm0 13h2v3H7zM0 7h3v2H0zm13 0h3v2h-3zM2 2h2v1h1v1H4v1H3V4H2zm10 0h2v2h-1v1h-1V4h-1V3h1zM3 11h1v1h1v1H4v1H2v-2h1zm9 0h1v1h1v2h-2v-1h-1v-1h1zM5 4h6v1h1v6h-1v1H5v-1H4V5h1z"/></svg>';

/** `facing` reports how squarely the card face looks at us (1 = straight on, ≤0 = back). */
export function mountSunHandle(onAngle: (deg: number) => void, facing: () => number): SunHandle {
  const slot = document.getElementById('cardSlot');
  const aim = document.createElement('div');
  aim.className = 'tune-aim';
  aim.hidden = true;
  aim.innerHTML = `<i class="tune-aim-ring" aria-hidden="true"></i><span class="tune-sun" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="359">${ICON}<i class="tune-sun-keys" aria-hidden="true"></i></span>`;
  document.body.appendChild(aim);
  const sun = aim.querySelector<HTMLElement>('.tune-sun')!;
  if (!slot) return { update() {} };

  let angle = TUNE_DEFAULTS.lightAngle;
  let raf = 0;

  // Follow the card slot (it moves with layout and page scroll) while the handle is shown.
  const place = () => {
    raf = requestAnimationFrame(place);
    const r = slot.getBoundingClientRect();
    aim.style.transform = `translate(${r.left.toFixed(1)}px, ${r.top.toFixed(1)}px)`;
    aim.style.width = `${r.width}px`;
    aim.style.height = `${r.height}px`;
    // The light lives on the face: fade the sun out while a spin shows the back.
    const f = Math.min(1, Math.max(0, facing() * 3 - 1));
    aim.style.opacity = f.toFixed(2);
    aim.classList.toggle('is-away', f < 0.5);
    // Out of the tab order while it is turned away, so focus never lands on an invisible control.
    sun.tabIndex = f < 0.5 ? -1 : 0;
  };

  const set = (deg: number) => onAngle(((Math.round(deg) % 360) + 360) % 360);

  const fromPointer = (e: PointerEvent) => {
    const r = slot.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
    const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    if (Math.hypot(dx, dy) < 0.03) return;
    set((Math.atan2(dx, -dy) * 180) / Math.PI);
  };
  sun.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sun.setPointerCapture(e.pointerId);
    aim.classList.add('is-dragging');
    sun.focus({ preventScroll: true });
  });
  sun.addEventListener('pointermove', (e) => sun.hasPointerCapture(e.pointerId) && fromPointer(e));
  const end = () => aim.classList.remove('is-dragging');
  sun.addEventListener('pointerup', end);
  sun.addEventListener('pointercancel', end);
  sun.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 15 : 5;
    const map: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
    if (e.key in map) set(angle + map[e.key]);
    else if (e.key === 'Home' || e.key === 'Delete' || e.key === 'Backspace') set(TUNE_DEFAULTS.lightAngle);
    else return;
    e.preventDefault();
  });

  return {
    update({ show, angle: a, label, title, keys }) {
      sun.querySelector('.tune-sun-keys')!.textContent = keys;
      angle = a;
      const [x, y] = fixedLight(a);
      sun.style.left = `${x * 100}%`;
      sun.style.top = `${y * 100}%`;
      sun.setAttribute('aria-valuenow', String(a));
      sun.setAttribute('aria-valuetext', `${a}°`);
      sun.setAttribute('aria-label', label);
      sun.title = title;
      if (show === !aim.hidden) return;
      aim.hidden = !show;
      if (show) place();
      else cancelAnimationFrame(raf);
    },
  };
}
