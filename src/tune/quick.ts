// The motion button above the deck: the card's idle motion in one tap, without opening the panel.
// The button names the current motion; pressed, it deals the ten motions out as a small tray of
// tiles (quickTray.ts, fetched the first time the button is pointed at or pressed).

import './quick.css';
import { dictOf } from '../i18n';
import type { Store } from '../state';
import { svg } from './icons';
import type { Tray } from './quickTray';

export function mountQuickMotion(store: Store, host: HTMLElement): void {
  const root = document.createElement('div');
  root.className = 'qm';
  root.innerHTML = `<button class="qm-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="qmTray"><i class="qm-ico"></i><span class="qm-text"><small></small><b></b></span></button>`;
  host.prepend(root);
  const btn = root.querySelector<HTMLButtonElement>('.qm-btn')!;
  const dict = () => dictOf(store.get().lang).tune;

  let tray: Tray | null = null;
  let loading: Promise<Tray> | null = null;
  const useTray = () => {
    loading ??= import('./quickTray').then((m) => (tray = m.mountTray(store, root, btn)));
    loading.catch(() => (loading = null));
    return loading;
  };
  for (const ev of ['pointerenter', 'focus']) btn.addEventListener(ev, () => void useTray().catch(() => {}));
  // A press while the tray's code is on its way opens it on arrival, unless a press elsewhere or
  // focus leaving the button has called it off meanwhile.
  let wanted = false;
  btn.addEventListener('click', () => {
    if (tray) return tray.open(tray.hidden);
    wanted = true;
    void useTray().then(
      (t) => {
        if (wanted) t.open(true);
        wanted = false;
      },
      () => (wanted = false),
    );
  });
  btn.addEventListener('blur', () => (wanted = false));
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) wanted = false;
  });

  const render = () => {
    const t = dict();
    const v = store.get().tune.idle;
    btn.querySelector('.qm-ico')!.innerHTML = svg(v);
    btn.querySelector('small')!.textContent = t.groups.motion;
    btn.querySelector('b')!.textContent = t.idleMode[v];
    btn.dataset.value = v;
    btn.setAttribute('aria-label', `${t.label.idle}: ${t.idleMode[v]}`);
    tray?.render();
  };

  // Where the name tag beside the card comes down to the deck (a short, narrow stage), the button
  // tucks into the gap between them instead of covering the tag. The observer also calls it once
  // the page is laid out.
  const info = document.getElementById('info');
  const place = () => {
    root.classList.remove('is-tight');
    if (!info || matchMedia('(max-width: 900px)').matches) return;
    const a = btn.getBoundingClientRect();
    const b = info.getBoundingClientRect();
    root.classList.toggle('is-tight', a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  };
  new ResizeObserver(place).observe(info ?? root);
  addEventListener('resize', () => {
    place();
    if (tray && !tray.hidden) tray.fit();
  });

  store.on((_, changed) => {
    if (changed.has('tune') || changed.has('lang')) render();
  });
  render();
}
