// State for the Foil range and custom colours. Kept apart so state.ts only needs a one-line hook.

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
