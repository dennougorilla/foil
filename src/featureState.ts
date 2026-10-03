// State for the Foil range and custom colours. Kept apart so state.ts only needs a one-line hook.

/** Narrowest brightness band, and the brush size limits (range-texture pixels). */
export const MIN_BAND = 0.08;
export const BRUSH_MIN = 6;
export const BRUSH_MAX = 120;

export type RangeRegion = 'all' | 'art' | 'frame' | 'text' | 'none';
export type BrushMode = 'add' | 'erase';

export interface RangeColorState {
  /** Which part of the card takes the finish before brightness and brush are applied. */
  rangeRegion: RangeRegion;
  /** Brightness key, 0..1: only tones between these take the finish. */
  rangeLo: number;
  rangeHi: number;
  rangeInvert: boolean;
  /** Keep the range overlay on the card even when not editing it. */
  rangeShow: boolean;
  brushMode: BrushMode;
  /** Brush radius in range-texture pixels (the texture is 450 wide). */
  brushSize: number;
  /** 0 = hard edge, 1 = fully feathered. */
  brushSoft: number;
  /** Custom frame colour ('#rrggbb'), or '' to use the frame preset. */
  frameColor: string;
  /** '' follows the finish, a preset id, or a custom '#rrggbb'. */
  stageColor: string;
  frameSwatches: string[];
  stageSwatches: string[];
}

export const RANGE_COLOR_DEFAULTS: RangeColorState = {
  rangeRegion: 'all',
  rangeLo: 0,
  rangeHi: 1,
  rangeInvert: false,
  rangeShow: false,
  brushMode: 'add',
  brushSize: 34,
  brushSoft: 0.5,
  frameColor: '',
  stageColor: '',
  frameSwatches: [],
  stageSwatches: [],
};

export const RANGE_COLOR_PERSIST = Object.keys(RANGE_COLOR_DEFAULTS) as (keyof RangeColorState)[];

const REGIONS: RangeRegion[] = ['all', 'art', 'frame', 'text', 'none'];
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const hexList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && HEX.test(x));

/**
 * Saved values that no longer fit (a reversed band, an unknown region, a bad colour) fall back to
 * the defaults instead of reaching the controls and the renderer.
 */
export function sanitizeRangeColors(s: RangeColorState): RangeColorState {
  const d = RANGE_COLOR_DEFAULTS;
  const band = num(s.rangeLo, 0, 1) && num(s.rangeHi, 0, 1) && s.rangeHi - s.rangeLo >= MIN_BAND - 1e-6;
  return {
    rangeRegion: REGIONS.includes(s.rangeRegion) ? s.rangeRegion : d.rangeRegion,
    rangeLo: band ? s.rangeLo : d.rangeLo,
    rangeHi: band ? s.rangeHi : d.rangeHi,
    rangeInvert: typeof s.rangeInvert === 'boolean' ? s.rangeInvert : d.rangeInvert,
    rangeShow: typeof s.rangeShow === 'boolean' ? s.rangeShow : d.rangeShow,
    brushMode: s.brushMode === 'add' || s.brushMode === 'erase' ? s.brushMode : d.brushMode,
    brushSize: num(s.brushSize, BRUSH_MIN, BRUSH_MAX) ? s.brushSize : d.brushSize,
    brushSoft: num(s.brushSoft, 0, 1) ? s.brushSoft : d.brushSoft,
    frameColor: s.frameColor === '' || (typeof s.frameColor === 'string' && HEX.test(s.frameColor)) ? s.frameColor : d.frameColor,
    stageColor: typeof s.stageColor === 'string' && (s.stageColor === '' || /^[a-z]+$/.test(s.stageColor) || HEX.test(s.stageColor)) ? s.stageColor : d.stageColor,
    frameSwatches: hexList(s.frameSwatches) ? s.frameSwatches : d.frameSwatches,
    stageSwatches: hexList(s.stageSwatches) ? s.stageSwatches : d.stageSwatches,
  };
}
