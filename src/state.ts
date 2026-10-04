import { EDITIONS, type EditionId, type FrameId, type RarityId } from './editions';
import type { Crop } from './card/face';
import type { Lang } from './i18n';
import { sanitizeTune, TUNE_DEFAULTS, type Tune } from './tune/model';
import { DEFAULT_LETTERING, normalizeFieldPrints, type FieldPrints, type Lettering } from './lettering';
import { CARD_LAYOUTS, type CardLayout } from './card/tcg';
import { DEFAULT_MESSAGE, normalizeMessage, type Message } from './message';
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
  /** The seven finishes in the hand, in order (made valid against the opened packs in main.ts). */
  hand: EditionId[];
  rarity: RarityId;
  frame: FrameId;
  intensity: number;
  pixel: number;
  name: string;
  /** True once the person typed their own name; stops samples overwriting it. */
  nameEdited: boolean;
  /** The message printed on the picture (none while its text is empty). */
  message: Message;
  /** Whether the nameplate shows the name and the rarity. */
  plate: boolean;
  /** The classic FOIL card or a trading card (type line and effect box). */
  layout: CardLayout;
  /** The trading card's type line. */
  cardType: string;
  /** Pieces of text printed in their own lettering (style and foil only); the rest follow `text`. */
  prints: FieldPrints;
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

/** Longest type line, in characters. */
export const CARD_TYPE_MAX = 24;

type Listener = (s: State, changed: Set<keyof State>) => void;

const KEY = 'foil:v1';
const PERSIST: (keyof State)[] = [
  'lang',
  'sound',
  'crt',
  'edition',
  'hand',
  'rarity',
  'frame',
  'intensity',
  'pixel',
  'name',
  'nameEdited',
  'message',
  'plate',
  'layout',
  'cardType',
  'prints',
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
    hand: ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch'],
    rarity: 'rare',
    frame: 'paper',
    intensity: 1,
    pixel: 0,
    name: '',
    nameEdited: false,
    message: { ...DEFAULT_MESSAGE },
    plate: true,
    layout: 'classic',
    cardType: '',
    prints: {},
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
    state.message = normalizeMessage(state.message);
    state.plate = state.plate !== false;
    if (!CARD_LAYOUTS.includes(state.layout)) state.layout = 'classic';
    state.cardType = typeof state.cardType === 'string' ? state.cardType.slice(0, CARD_TYPE_MAX) : '';
    state.prints = normalizeFieldPrints(state.prints);
    // A finish that no longer exists (a retired one) starts over on the default.
    if (!EDITIONS.some((e) => e.id === state.edition)) state.edition = 'holo';
    if (!PANEL_TABS.includes(state.panelTab)) state.panelTab = 'card';
    if (!EXPORT_FORMATS.includes(state.exportFormat)) state.exportFormat = 'png';
    state.saveOptsOpen = state.saveOptsOpen === true;
    state.gifClear = state.gifClear === true;
    if (typeof state.gifMatte !== 'string' || (state.gifMatte !== 'auto' && !/^#[0-9a-f]{6}$/i.test(state.gifMatte))) state.gifMatte = 'auto';
    Object.assign(state, sanitizeRangeColors(state));
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
