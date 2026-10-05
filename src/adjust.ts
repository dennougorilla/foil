// Fine-tune's tabs past Card: Shine, Lettering (the message and how the card's text is printed)
// and Layers, with the frame's own colours. One chunk, fetched the first time Fine-tune opens, or
// ahead of it (docs/performance.md).
import { mountTune } from './tune/panel';
import { mountMessage } from './messagePanel';
import { mountLettering } from './letteringPanel';
import { mountRangeColors } from './features';
import type { Areas } from './areas';
import type { PrintPop } from './printPop';
import type { Dict } from './i18n';
import type { Stage } from './stage';
import type { Store } from './state';

export interface AdjustHost {
  store: Store;
  stage: Stage;
  areas: Areas;
  print: PrintPop;
  dict: () => Dict;
  announce: (msg: string) => void;
  /** A small bounce on the card when a choice lands on it. */
  onPick: () => void;
  /** The name printed when none is typed (the sample's, or "My card"). */
  fallbackName: () => string;
}

export function mountAdjust(o: AdjustHost) {
  const { store } = o;
  mountTune(store, document.getElementById('pane-light')!);
  const host = document.getElementById('pane-text')!;
  mountMessage({ store, host, dict: o.dict, onPick: o.onPick, chip: (f) => o.print.chip(f), namePlaceholder: o.fallbackName });
  const lettering = mountLettering({ store, host, dict: o.dict, name: () => store.get().name || o.fallbackName(), onPick: o.onPick });
  const colors = mountRangeColors({ store, stage: o.stage, t: o.dict, announce: o.announce }, o.areas);
  return {
    /** Adds the saved colours after the frame presets (the Card tab rebuilds them often). */
    decorateFrames: colors.decorateFrames,
    /** Brings the Lettering controls into view and draws the eye to them. */
    callLettering: lettering.call,
  };
}

export type Adjust = ReturnType<typeof mountAdjust>;
