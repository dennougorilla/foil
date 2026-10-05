// The page's side of the home-screen app (docs/pwa.md): registers the service worker, shows the Update
// chip while a new version waits, hands the worker the fonts this page loaded before it ran, and takes
// back a picture another app shared to FOIL. Its own chunk, fetched once the page is idle.
import './pwa.css';
import { sfx } from './audio';
import { dictOf, type Lang } from './i18n';

export function registerWorker(): void {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  const offer = (next: ServiceWorker) => {
    const chip = updateChip();
    chip.onclick = () => {
      sfx.tick();
      chip.disabled = true;
      next.postMessage('update');
    };
  };
  // A worker that installs while the page already has one is a new version; the first install is not.
  const watch = (w: ServiceWorker | null) =>
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && sw.controller) offer(w);
    });
  // A new version taking over (from this tab's chip or another's) reloads every page the old one served:
  // the chunks it has not loaded yet went with the old cache. The first install takes over without a reload.
  let served = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (served) location.reload();
    served = true;
  });
  sw.register('./sw.js').then(
    (reg) => {
      if (reg.waiting && sw.controller) offer(reg.waiting);
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // An app left open is asked again whenever it comes back to the front.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    },
    (err) => console.warn('No offline copy of FOIL:', err),
  );
  void sw.ready.then((reg) => reg.active?.postMessage(performance.getEntriesByType('resource').map((r) => r.name)));
}

/** The chip at the head of the header's chips; its word follows the language like the rest (data-t). */
function updateChip(): HTMLButtonElement {
  const old = document.getElementById('updateBtn');
  if (old) return old as HTMLButtonElement;
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.id = 'updateBtn';
  chip.className = 'chip chip-update';
  chip.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2h8v2H5zM3 3h2v2H3zM2 5h2v6H2zM3 11h2v2H3zM5 12h6v2H5zM11 11h2v2h-2zM12 8h2v3h-2zM10 4h6v1h-6zM11 5h4v1h-4zM12 6h2v1h-2z" /></svg><span data-t="update"></span>';
  chip.lastElementChild!.textContent = dictOf(document.documentElement.lang as Lang).update;
  // Where the chip keeps to its icon, the pointer still finds its word (in the language shown now).
  chip.addEventListener('pointerenter', () => (chip.title = chip.textContent!.trim()));
  document.querySelector('.toggles')!.prepend(chip);
  return chip;
}

/**
 * The page was opened with ?shared: opens the picture shared to FOIL, which the worker hands over once,
 * or, if it is gone, does what the page does otherwise. The address loses ?shared.
 */
export async function openShared(open: (file: File) => unknown, otherwise: () => void): Promise<void> {
  const url = new URL(location.href);
  url.searchParams.delete('shared');
  history.replaceState(history.state, '', url.href);
  const res = await fetch('./shared-picture').catch(() => null);
  if (!res?.ok) return otherwise();
  const name = decodeURIComponent(res.headers.get('x-name') ?? '');
  open(new File([await res.blob()], name, { type: res.headers.get('content-type') ?? '' }));
}
