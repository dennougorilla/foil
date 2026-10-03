import type { EditionId, FrameId, RarityId } from './editions';
import type { Crop } from './card/face';
import type { Lang } from './i18n';

export interface State {
  lang: Lang;
  sound: boolean;
  crt: boolean;
  edition: EditionId;
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
}

type Listener = (s: State, changed: Set<keyof State>) => void;

const KEY = 'foil:v1';
const PERSIST: (keyof State)[] = [
  'lang',
  'sound',
  'crt',
  'edition',
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
];


export function createStore() {
  const state: State = {
    lang: 'en',
    sound: true,
    crt: true,
    edition: 'holo',
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
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State>;
    for (const k of PERSIST) if (k in saved) (state as unknown as Record<string, unknown>)[k] = saved[k];
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
