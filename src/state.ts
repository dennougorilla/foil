import { EDITIONS, sanitizeLayer2, type EditionId, type FrameId, type Layer2, type RarityId } from './editions';
import type { Crop } from './card/face';
import { shapeOf, type ShapeId } from './card/shape';
import type { Lang } from './i18n';
import { legacyMotion, sanitizeTune, TUNE_DEFAULTS, type Tune } from './tune/model';
import { DEFAULT_LETTERING, normalizeFieldPrints, type FieldPrints, type Lettering } from './lettering';
import { CARD_LAYOUTS, type CardLayout } from './card/tcg';
import { ARRANGES, normalizePlacements, type Arrange, type Placements } from './arrange';
import { DEFAULT_MESSAGE, normalizeMessage, type Message } from './message';
import { sanitizeDot, sanitizeDotScope, type Dot, type DotScope } from './dot/model';
import { DEFAULT_BACKDROP, PLAIN_DEFAULT, sanitizeBackdrop, sanitizeBackdropColor, type BackdropId } from './backdrop';
import { RANGE_COLOR_DEFAULTS, RANGE_COLOR_PERSIST, sanitizeRangeColors, type RangeColorState } from './featureState';

/** Tabs of the Fine-tune area in the side panel. */
export type PanelTab = 'card' | 'light' | 'text' | 'range';
export const PANEL_TABS: PanelTab[] = ['card', 'light', 'text', 'range'];
export type ExportFormat = 'gif' | 'apng' | 'mp4';
export const EXPORT_FORMATS: ExportFormat[] = ['gif', 'apng', 'mp4'];

export interface State extends RangeColorState {
  lang: Lang;
  sound: boolean;
  /** The CRT screen filter over the page (off unless turned on; never in exports). */
  crtFilter: boolean;
  edition: EditionId;
  /** Layer 2: a finish laid over the card's own in an area of its own, or null (docs/layering.md). Layer 1 is `edition` with the range fields. */
  layer2: Layer2 | null;
  /** Which layer the Finish area tab is editing. */
  areaLayer: 1 | 2;
  /** The seven finishes in the hand, in order (made valid against the opened packs in main.ts). */
  hand: EditionId[];
  rarity: RarityId;
  frame: FrameId;
  /** The card's shape (card/shape.ts); the trading card unless chosen. */
  shape: ShapeId;
  /** The Picture shape's size now ('900x1260'), following the picture on the card (not saved: shape.ts setFit). */
  fit: string;
  /** The picture is the whole card: FOIL's frame, nameplate and words are not drawn (their settings stay). */
  frameless: boolean;
  intensity: number;
  /** Pixelate: the art window's step (0 = off, see dot/model.ts PIXEL_STEPS); the frame and words stay crisp. */
  pixel: number;
  /** Pixel art, or null (src/dot). */
  dot: Dot | null;
  /** Where pixel art goes: the whole card, or the frame only (the picture stays as it is); whole card when frameless. */
  dotScope: DotScope;
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
  /** Words at their preset places, or placed freely (docs/arrange.md). */
  arrange: Arrange;
  /** Where freely placed words sit (used while `arrange` is 'free'). */
  placements: Placements;
  /** Index of the sample in use, or -1 when showing the person's own image. */
  sample: number;
  crop: Crop;
  loading: boolean;
  /** Fine-tuning of light and motion, shared by every finish. */
  tune: Tune;
  /** What the card sits on, on the stage and in a moving file (docs/backdrops.md), and Plain's color. */
  backdrop: BackdropId;
  backdropColor: string;
  /** Whether the Fine-tune area of the panel is open, and which of its tabs shows. */
  adjustOpen: boolean;
  panelTab: PanelTab;
  /** The format the Save button writes. */
  exportFormat: ExportFormat;
  /** Whether the save options are open. */
  saveOptsOpen: boolean;
  /** A clear GIF's edges: 'auto' keeps the card's own edge colour; otherwise '#rrggbb' to blend the edge into. */
  gifMatte: string;
  /** How the name is printed: ink, deboss, emboss, foil stamp or spot UV. */
  text: Lettering;
  /** True once the card has been flicked to change the finish; the phone's flick hint stops then. */
  flicked: boolean;
}

/** Longest type line, in characters. */
export const CARD_TYPE_MAX = 24;

type Listener = (s: State, changed: Set<keyof State>) => void;

const KEY = 'foil:v1';
const PERSIST: (keyof State)[] = [
  'lang',
  'sound',
  'crtFilter',
  'edition',
  'layer2',
  'hand',
  'rarity',
  'frame',
  'shape',
  'frameless',
  'intensity',
  'pixel',
  'dot',
  'dotScope',
  'name',
  'nameEdited',
  'message',
  'plate',
  'layout',
  'cardType',
  'prints',
  'arrange',
  'placements',
  'sample',
  'crop',
  'tune',
  'backdrop',
  'backdropColor',
  'adjustOpen',
  'panelTab',
  'exportFormat',
  'saveOptsOpen',
  'gifMatte',
  'text',
  'flicked',
  ...RANGE_COLOR_PERSIST,
];

/** Saved settings that belong to the app, not to one card: a card kept in the binder leaves them out. */
const APP_KEYS: (keyof State)[] = [
  'lang',
  'sound',
  'crtFilter',
  'hand',
  'adjustOpen',
  'panelTab',
  'exportFormat',
  'saveOptsOpen',
  'gifMatte',
  'flicked',
  'rangeShow',
  'brushMode',
  'brushSize',
  'brushSoft',
  'frameSwatches',
];
/** Everything else saved is the card: its finish, picture, crop, words and looks (see docs/binder.md). */
export const CARD_KEYS = PERSIST.filter((k) => !APP_KEYS.includes(k));
export type Card = Partial<State>;

/** The card's own settings, as kept in the binder. */
export function cardOf(s: State): Card {
  return Object.fromEntries(CARD_KEYS.map((k) => [k, structuredClone(s[k])]));
}

const defaults = (): State => ({
  lang: 'en',
  sound: true,
  crtFilter: false,
  edition: 'holo',
  layer2: null,
  areaLayer: 1,
  hand: ['base', 'foil', 'holo', 'poly', 'negative', 'prism', 'glitch'],
  rarity: 'rare',
  frame: 'paper',
  shape: 'card',
  fit: '',
  frameless: false,
  intensity: 1,
  pixel: 0,
  dot: null,
  dotScope: 'card',
  name: '',
  nameEdited: false,
  message: { ...DEFAULT_MESSAGE },
  plate: true,
  layout: 'classic',
  cardType: '',
  prints: {},
  arrange: 'auto',
  placements: {},
  sample: 0,
  crop: { zoom: 1, x: 0.5, y: 0.5 },
  loading: false,
  tune: { ...TUNE_DEFAULTS },
  backdrop: DEFAULT_BACKDROP,
  backdropColor: PLAIN_DEFAULT,
  adjustOpen: false,
  panelTab: 'card',
  exportFormat: 'gif',
  saveOptsOpen: false,
  gifMatte: 'auto',
  text: { ...DEFAULT_LETTERING },
  flicked: false,
  ...RANGE_COLOR_DEFAULTS,
});

/** Saved values that no longer fit fall back to their defaults. */
function sanitize(state: State) {
  if (state.lang !== 'ja') state.lang = 'en';
  state.tune = sanitizeTune(state.tune);
  state.dot = sanitizeDot(state.dot);
  state.dotScope = sanitizeDotScope(state.dotScope);
  state.shape = shapeOf(state.shape);
  state.frameless = state.frameless === true;
  state.adjustOpen = state.adjustOpen === true;
  state.message = normalizeMessage(state.message);
  state.plate = state.plate !== false;
  if (!CARD_LAYOUTS.includes(state.layout)) state.layout = 'classic';
  state.cardType = typeof state.cardType === 'string' ? state.cardType.slice(0, CARD_TYPE_MAX) : '';
  state.prints = normalizeFieldPrints(state.prints);
  if (!ARRANGES.includes(state.arrange)) state.arrange = 'auto';
  state.placements = normalizePlacements(state.placements);
  // A finish that no longer exists (a retired one) starts over on the default.
  if (!EDITIONS.some((e) => e.id === state.edition)) state.edition = 'holo';
  if (!PANEL_TABS.includes(state.panelTab)) state.panelTab = 'card';
  if (!EXPORT_FORMATS.includes(state.exportFormat)) state.exportFormat = 'gif';
  state.saveOptsOpen = state.saveOptsOpen === true;
  state.backdrop = sanitizeBackdrop(state.backdrop);
  state.backdropColor = sanitizeBackdropColor(state.backdropColor);
  state.flicked = state.flicked === true;
  state.crtFilter = state.crtFilter === true;
  if (typeof state.gifMatte !== 'string' || (state.gifMatte !== 'auto' && !/^#[0-9a-f]{6}$/i.test(state.gifMatte))) state.gifMatte = 'auto';
  Object.assign(state, sanitizeRangeColors(state));
  state.layer2 = sanitizeLayer2(state.layer2);
}

/** A kept card made whole again: every card setting it lacks or that no longer fits is the default. */
export function cleanCard(saved: Card): Card {
  const s = defaults();
  for (const k of CARD_KEYS) if (k in saved) (s as unknown as Record<string, unknown>)[k] = saved[k];
  sanitize(s);
  return Object.fromEntries(CARD_KEYS.map((k) => [k, s[k]]));
}


export function createStore() {
  const state = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State>;
    for (const k of PERSIST) if (k in saved) (state as unknown as Record<string, unknown>)[k] = saved[k];
    sanitize(state);
    // v0.13.0 picked the motion of a GIF or APNG apart from the card's; that choice becomes the card's motion (docs/motion.md).
    const old = legacyMotion((saved as { exportMotion?: unknown }).exportMotion);
    if (old) state.tune = { ...state.tune, idle: old };
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
