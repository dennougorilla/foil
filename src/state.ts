import { EDITIONS, layerFromOutside, sanitizeLayer2, type EditionId, type FrameId, type Layer2, type RarityId } from './editions';
import type { Crop } from './card/face';
import type { Lang } from './i18n';
import { sanitizeTune, TUNE_DEFAULTS, type Tune } from './tune/model';
import { DEFAULT_LETTERING, type Lettering } from './lettering';
import { RANGE_COLOR_DEFAULTS, RANGE_COLOR_PERSIST, sanitizeRangeColors, type RangeColorState } from './featureState';

/** Tabs of the Fine-tune area in the side panel. */
export type PanelTab = 'card' | 'light' | 'text' | 'range';
export const PANEL_TABS: PanelTab[] = ['card', 'light', 'text', 'range'];
export type ExportFormat = 'png' | 'gif' | 'apng';
export const EXPORT_FORMATS: ExportFormat[] = ['png', 'gif', 'apng'];

export interface State extends RangeColorState {
  lang: Lang;
  sound: boolean;
  crt: boolean;
  edition: EditionId;
  /** Layer 2: a finish laid over the card's own in an area of its own, or null (docs/layering.md). Layer 1 is `edition` with the range fields. */
  layer2: Layer2 | null;
  /** Which layer the Finish area tab is editing. */
  areaLayer: 1 | 2;
  /** The seven finishes in the hand, in order (made valid against the opened packs in main.ts). */
  hand: EditionId[];
  rarity: RarityId;
  frame: FrameId;
  intensity: number;
  pixel: number;
  name: string;
  desc: string;
  /** True once the person typed their own name/description; stops samples overwriting it. */
  nameEdited: boolean;
  descEdited: boolean;
  /** Index of the sample in use, or -1 when showing the person's own image. */
  sample: number;
  crop: Crop;
  loading: boolean;
  /** Fine-tuning of light and motion, shared by every finish. */
  tune: Tune;
  /** Whether the Fine-tune area of the panel is open, and which of its tabs shows. */
  adjustOpen: boolean;
  panelTab: PanelTab;
  /** The format the Save button writes. */
  exportFormat: ExportFormat;
  /** Whether the save options are open, and the GIF's own: a clear background and its edge colour. */
  saveOptsOpen: boolean;
  gifClear: boolean;
  /** 'auto' keeps the card's own edge colour; otherwise '#rrggbb' to blend the edge into. */
  gifMatte: string;
  /** How the name is printed: ink, deboss, emboss, foil stamp or spot UV. */
  text: Lettering;
}

type Listener = (s: State, changed: Set<keyof State>) => void;

const KEY = 'foil:v1';
const PERSIST: (keyof State)[] = [
  'lang',
  'sound',
  'crt',
  'edition',
  'layer2',
  'hand',
  'rarity',
  'frame',
  'intensity',
  'pixel',
  'name',
  'desc',
  'nameEdited',
  'descEdited',
  'sample',
  'crop',
  'tune',
  'adjustOpen',
  'panelTab',
  'exportFormat',
  'saveOptsOpen',
  'gifClear',
  'gifMatte',
  'text',
  ...RANGE_COLOR_PERSIST,
];


export function createStore() {
  const state: State = {
    lang: 'en',
    sound: true,
    crt: true,
    edition: 'holo',
    layer2: null,
    areaLayer: 1,
    hand: ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch'],
    rarity: 'rare',
    frame: 'paper',
    intensity: 1,
    pixel: 0,
    name: '',
    desc: '',
    nameEdited: false,
    descEdited: false,
    sample: 0,
    crop: { zoom: 1, x: 0.5, y: 0.5 },
    loading: false,
    tune: { ...TUNE_DEFAULTS },
    adjustOpen: false,
    panelTab: 'card',
    exportFormat: 'png',
    saveOptsOpen: false,
    gifClear: false,
    gifMatte: 'auto',
    text: { ...DEFAULT_LETTERING },
    ...RANGE_COLOR_DEFAULTS,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State>;
    for (const k of PERSIST) if (k in saved) (state as unknown as Record<string, unknown>)[k] = saved[k];
    state.tune = sanitizeTune(state.tune);
    state.adjustOpen = state.adjustOpen === true;
    // A finish that no longer exists (a retired one) starts over on the default.
    if (!EDITIONS.some((e) => e.id === state.edition)) state.edition = 'holo';
    if (!PANEL_TABS.includes(state.panelTab)) state.panelTab = 'card';
    if (!EXPORT_FORMATS.includes(state.exportFormat)) state.exportFormat = 'png';
    state.saveOptsOpen = state.saveOptsOpen === true;
    state.gifClear = state.gifClear === true;
    if (typeof state.gifMatte !== 'string' || (state.gifMatte !== 'auto' && !/^#[0-9a-f]{6}$/i.test(state.gifMatte))) state.gifMatte = 'auto';
    Object.assign(state, sanitizeRangeColors(state));
    // A second finish saved by the first layering design ("outside the area") becomes layer 2.
    const outside = (saved as { outside?: unknown }).outside;
    state.layer2 = sanitizeLayer2(state.layer2) ?? layerFromOutside(outside, { region: state.rangeRegion, lo: state.rangeLo, hi: state.rangeHi, invert: state.rangeInvert });
  } catch {
    /* storage unavailable: defaults are fine */
  }
  const params = new URLSearchParams(location.search);
  const qLang = params.get('lang');
  if (qLang === 'ja' || qLang === 'en') state.lang = qLang;

  const listeners: Listener[] = [];
  return {
    get: () => state,
    set(patch: Partial<State>) {
      const changed = new Set<keyof State>();
      for (const k of Object.keys(patch) as (keyof State)[]) {
        if (state[k] !== patch[k]) {
          (state as unknown as Record<string, unknown>)[k] = patch[k];
          changed.add(k);
        }
      }
      if (!changed.size) return;
      if (PERSIST.some((k) => changed.has(k))) {
        try {
          const out: Record<string, unknown> = {};
          for (const k of PERSIST) out[k] = state[k];
          localStorage.setItem(KEY, JSON.stringify(out));
        } catch {
          /* ignore */
        }
      }
      for (const l of listeners) l(state, changed);
    },
    on(l: Listener) {
      listeners.push(l);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
