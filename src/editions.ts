import type { TouchKind } from './touch/heat';
import type { RangeRegion } from './featureState';

export type EditionId =
  | 'base'
  | 'foil'
  | 'holo'
  | 'poly'
  | 'negative'
  | 'gold'
  | 'prism'
  | 'galaxy'
  | 'glitch'
  | 'aurora'
  | 'frost'
  | 'magma'
  | 'halftone'
  | 'crystal'
  | 'sakura'
  | 'relief'
  | 'warmth'
  | 'shadowbox'
  | 'shallows'
  | 'platinum'
  | 'cosmoholo'
  | 'stainedglass'
  | 'glow'
  | 'blacklight'
  | 'lenticular3d'
  | 'lenticularflip'
  | 'stardust'
  | 'snowglobe'
  // Shaders in src/gl/finishes/supporter.ts
  | 'kintsugi'
  | 'opal'
  | 'raden'
  | 'confetti'
  | 'fireworks';

export interface Edition {
  id: EditionId;
  /** Index passed to the card shader. */
  shader: number;
  /** Accent used for pills, particles and focus rings. */
  color: string;
  /** Three swirl colours for the background (dark, mid, light). */
  swirl: [string, string, string];
  value: number;
  /** Smooth gradients that band in 256 colours: its GIF is dithered. */
  dither?: boolean;
  /** Reacts to touch: drags on the card stroke it instead of tossing it, and it carries a field of this kind. */
  touch?: TouchKind;
  /**
   * Its light is an ultraviolet lamp: it sits exactly under the pointer, drifts slowly by itself
   * otherwise, and a drag on the card moves it instead of tossing the card.
   */
  torch?: boolean;
  /** Reads the picture's depth (src/depth), so choosing it starts the depth model. */
  depth?: boolean;
  /** Needs the card to itself (a second picture, particles over the art), like touch, torch and depth finishes. */
  solo?: boolean;
}

/** Every finish. The hand starts with OPEN_EDITIONS; the rest come in packs (src/packs.ts). */
export const EDITIONS: Edition[] = [
  { id: 'base', shader: 0, color: '#c9d3d4', swirl: ['#142024', '#a83a33', '#25706b'], value: 0 },
  { id: 'foil', shader: 1, color: '#5fb4ff', swirl: ['#0f1c33', '#2d6fd6', '#9cc8ff'], value: 2 },
  { id: 'holo', shader: 2, color: '#ff6b8b', swirl: ['#220c19', '#b23a52', '#e0839a'], value: 3 },
  { id: 'poly', shader: 3, color: '#c58bff', swirl: ['#1b1238', '#7f4fe0', '#3cc8b4'], value: 5 },
  { id: 'negative', shader: 4, color: '#9a7bd1', swirl: ['#07060c', '#3a2a5c', '#7e66b0'], value: 5 },
  { id: 'prism', shader: 6, color: '#7ef0e6', swirl: ['#0b2228', '#2bb3b8', '#f08bd0'], value: 6 },
  { id: 'glitch', shader: 8, color: '#5cff8a', swirl: ['#060e09', '#1b6b3a', '#d43dff'], value: 1 },
  { id: 'gold', shader: 5, color: '#f2c14e', swirl: ['#1f1209', '#a86a22', '#e0b960'], value: 4 },
  { id: 'galaxy', shader: 7, color: '#8e7dff', swirl: ['#05071a', '#30247a', '#d052a8'], value: 5 },
  { id: 'aurora', shader: 9, color: '#59f2b0', swirl: ['#04121a', '#126b5c', '#7b5cff'], value: 5 },
  { id: 'frost', shader: 10, color: '#bfe9ff', swirl: ['#0b1a26', '#3f7fa8', '#dff4ff'], value: 4 },
  { id: 'magma', shader: 11, color: '#ff7a2f', swirl: ['#140605', '#8a2311', '#ff9a3c'], value: 5 },
  { id: 'halftone', shader: 12, color: '#ffd84a', swirl: ['#151518', '#d83a6a', '#2aa8d8'], value: 3 },
  { id: 'crystal', shader: 13, color: '#e8f6ff', swirl: ['#101522', '#5a6ea8', '#d8e6ff'], value: 6 },
  { id: 'sakura', shader: 14, color: '#ffa8c8', swirl: ['#1e0f1a', '#b8497a', '#ffd0e0'], value: 4 },
  { id: 'relief', shader: 15, color: '#e3bf72', swirl: ['#07090d', '#1c2633', '#4d6274'], value: 7, dither: true },
  { id: 'warmth', shader: 20, color: '#ff8a5c', swirl: ['#081226', '#1d3f78', '#d9775c'], value: 6, touch: 'warmth' },
  { id: 'shadowbox', shader: 16, color: '#f0d9a8', swirl: ['#0d0b10', '#3b2a3f', '#c99a62'], value: 6, depth: true },
  { id: 'shallows', shader: 17, color: '#7fe3f0', swirl: ['#03141c', '#0e6a80', '#bff4f0'], value: 6 },
  { id: 'platinum', shader: 24, color: '#dfe6ee', swirl: ['#0a0d12', '#2b3440', '#aeb9c6'], value: 7, dither: true },
  { id: 'cosmoholo', shader: 18, color: '#a9c8ff', swirl: ['#080a1c', '#33307a', '#c8a8ff'], value: 6 },
  { id: 'stainedglass', shader: 26, color: '#e8a33c', swirl: ['#0a0710', '#3a1f4a', '#c0532e'], value: 6 },
  { id: 'glow', shader: 70, color: '#c8f58a', swirl: ['#030605', '#0e2318', '#4c7444'], value: 6, dither: true, touch: 'glow' },
  // Shader in src/gl/blacklight.ts.
  { id: 'blacklight', shader: 72, color: '#b77bff', swirl: ['#07031a', '#34126e', '#ff4fb8'], value: 7, dither: true, torch: true },
  // Shader in src/gl/lenticular3d.ts.
  { id: 'lenticular3d', shader: 74, color: '#9ad8ff', swirl: ['#061018', '#1f4f6e', '#e6a0c8'], value: 7, depth: true },
  { id: 'lenticularflip', shader: 76, color: '#8fb4ff', swirl: ['#0a0f24', '#2c3f8f', '#e7a0ff'], value: 6, solo: true },
  { id: 'stardust', shader: 22, color: '#ffe48a', swirl: ['#070512', '#3b2a8a', '#e86ad0'], value: 7 },
  // Glitter particles on the GPU, see src/gl/snowglobe.ts.
  { id: 'snowglobe', shader: 60, color: '#ffd77a', swirl: ['#0a1424', '#24507a', '#e8c06a'], value: 7, solo: true },
  // Shaders in src/gl/finishes/supporter.ts.
  { id: 'kintsugi', shader: 40, color: '#e9b955', swirl: ['#120e0a', '#5a3b1c', '#e0b25a'], value: 8 },
  { id: 'opal', shader: 41, color: '#9fe6ff', swirl: ['#0b1420', '#2f6f9a', '#e889c8'], value: 8 },
  { id: 'raden', shader: 43, color: '#b9a6ff', swirl: ['#07060a', '#2c1a3a', '#4fc0c8'], value: 8 },
  { id: 'confetti', shader: 80, color: '#ffcf5a', swirl: ['#1a0f24', '#a8386a', '#e8b94e'], value: 8 },
  { id: 'fireworks', shader: 82, color: '#ffc24a', swirl: ['#04061a', '#1a2658', '#d89a3a'], value: 8, dither: true },
];

export const editionById = (id: EditionId): Edition => EDITIONS.find((e) => e.id === id) ?? EDITIONS[0];

/**
 * Can be layer 2, the finish laid over the card's own in an area of its own (docs/layering.md):
 * anything but Base (that is "no layer") and the finishes that need the card to themselves.
 */
export function layerable(id: EditionId): boolean {
  const e = EDITIONS.find((x) => x.id === id);
  return !!e && e.id !== 'base' && !e.touch && !e.torch && !e.depth && !e.solo;
}

/** What layer 2 can be: the owned finishes that layer, but the card's own. */
export const layerChoices = (owned: readonly EditionId[], main: EditionId): EditionId[] => owned.filter((id) => id !== main && layerable(id));

/** Where a layer goes: a region of the card, a band of brightness, inverted (the brush is kept beside it). */
export interface Area {
  region: RangeRegion;
  lo: number;
  hi: number;
  invert: boolean;
}

/** Where layer 2 overlaps the card's own finish: only its light is added, or it is laid over. */
export type Blend = 'light' | 'over';

/** Layer 2: a finish, its area, how it meets layer 1 where they overlap, and how strongly it shows (0..1). */
export interface Layer2 extends Area {
  edition: EditionId;
  blend: Blend;
  strength: number;
}

const REGIONS: RangeRegion[] = ['all', 'art', 'frame', 'text', 'none'];
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** A saved layer 2, or null when it is missing or no longer fits. */
export function sanitizeLayer2(v: unknown): Layer2 | null {
  const l = v as Partial<Layer2> | null;
  if (!l || typeof l !== 'object' || typeof l.edition !== 'string' || !layerable(l.edition)) return null;
  const band = unit(l.lo) && unit(l.hi) && l.hi - l.lo >= 0.08 - 1e-6;
  return {
    edition: l.edition,
    region: REGIONS.includes(l.region as RangeRegion) ? (l.region as RangeRegion) : 'all',
    lo: band ? l.lo! : 0,
    hi: band ? l.hi! : 1,
    invert: l.invert === true,
    blend: l.blend === 'over' ? 'over' : 'light',
    strength: unit(l.strength) ? l.strength : 1,
  };
}

/**
 * The second finish of the first layering design (laid wherever the card's own area left out) as
 * layer 2: the same area inverted, laid over at full strength, so the card looks as it did.
 */
export const layerFromOutside = (outside: unknown, area: Area): Layer2 | null =>
  sanitizeLayer2({ edition: outside, region: area.region, lo: area.lo, hi: area.hi, invert: !area.invert, blend: 'over', strength: 1 });

export type RarityId = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface Rarity {
  id: RarityId;
  color: string;
  value: number;
}

export const RARITIES: Rarity[] = [
  { id: 'common', color: '#1a9cff', value: 2 },
  { id: 'uncommon', color: '#3fc28f', value: 4 },
  { id: 'rare', color: '#ff5a4f', value: 6 },
  { id: 'legendary', color: '#b26cd8', value: 10 },
];

export const rarityById = (id: RarityId): Rarity => RARITIES.find((r) => r.id === id) ?? RARITIES[0];

export type FrameId = 'paper' | 'ink' | 'gilt' | 'rarity' | 'rim' | 'ribbon';
export const FRAMES: FrameId[] = ['paper', 'ink', 'gilt', 'rarity', 'rim', 'ribbon'];
