// The Relief finish's one option, gold or silver: two coins inside the finish pill on the name
// tag, the way the rarity pill holds its diamonds. Shown only while Relief is on.
import './relief.css';
import type { Dict } from './i18n';
import type { Store } from './state';
import { sfx } from './audio';
import { RELIEF_METALS, setReliefMetal, type ReliefMetal } from './relief';

const PILL: Record<ReliefMetal, string> = { gold: '#e3bf72', silver: '#c3ccd2' };

/** Returns a function for the name tag to call whenever it redraws the finish pill. */
export function mountReliefPick(o: { store: Store; dict: () => Dict; onPick: () => void }): (pill: HTMLElement) => void {
  const { store } = o;
  const group = document.createElement('span');
  group.className = 'relief-pick';
  group.setAttribute('role', 'radiogroup');
  const coins = RELIEF_METALS.map((metal) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'relief-coin';
    b.dataset.metal = metal;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => {
      if (store.get().reliefMetal === metal) return;
      sfx.tick();
      store.set({ reliefMetal: metal });
      o.onPick();
    });
    group.appendChild(b);
    return b;
  });
  group.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (RELIEF_METALS.indexOf(store.get().reliefMetal) + dir + RELIEF_METALS.length) % RELIEF_METALS.length;
    coins[n].click();
    coins[n].focus();
  });

  const sync = () => {
    const s = store.get();
    const t = o.dict();
    setReliefMetal(s.reliefMetal);
    group.setAttribute('aria-label', t.reliefMetal);
    for (const b of coins) {
      const metal = b.dataset.metal as ReliefMetal;
      const on = metal === s.reliefMetal;
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('aria-label', t.reliefMetalName[metal]);
      b.title = `${t.reliefMetal}: ${t.reliefMetalName[metal]}`;
      b.tabIndex = on ? 0 : -1;
    }
    group.parentElement?.style.setProperty('--c', PILL[s.reliefMetal]);
  };
  store.on((_, changed) => changed.has('reliefMetal') && sync());
  sync();

  return (pill) => {
    const on = store.get().edition === 'relief';
    pill.classList.toggle('pill-relief', on);
    if (!on) return;
    pill.prepend(group);
    sync();
  };
}
