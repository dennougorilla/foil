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
  | 'lenticular'
  // Shaders in src/gl/sponsorShaders.ts
  | 'kintsugi'
  | 'opal'
  | 'raden';

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
  /** Reacts to touch: drags on the card stroke it instead of tossing it, and it carries a heat field. */
  touch?: boolean;
  /** Reads the picture's depth (src/depth), so choosing it starts the depth model. */
  depth?: boolean;
}

/** Hand order. Only the first seven are out from the start; the rest are secrets or beta (src/secrets.ts, src/sponsor.ts). */
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
  { id: 'warmth', shader: 20, color: '#ff8a5c', swirl: ['#081226', '#1d3f78', '#d9775c'], value: 6, touch: true },
  { id: 'shadowbox', shader: 16, color: '#f0d9a8', swirl: ['#0d0b10', '#3b2a3f', '#c99a62'], value: 6, depth: true },
  { id: 'shallows', shader: 17, color: '#7fe3f0', swirl: ['#03141c', '#0e6a80', '#bff4f0'], value: 6 },
  // Beta (src/secrets.ts): out of the hand until promoted. Shader in src/gl/lenticular.ts.
  { id: 'lenticular', shader: 74, color: '#9ad8ff', swirl: ['#061018', '#1f4f6e', '#e6a0c8'], value: 7, depth: true },
  // Shaders in src/gl/sponsorShaders.ts.
  { id: 'kintsugi', shader: 40, color: '#e9b955', swirl: ['#120e0a', '#5a3b1c', '#e0b25a'], value: 8 },
  { id: 'opal', shader: 41, color: '#9fe6ff', swirl: ['#0b1420', '#2f6f9a', '#e889c8'], value: 8 },
  { id: 'raden', shader: 43, color: '#b9a6ff', swirl: ['#07060a', '#2c1a3a', '#4fc0c8'], value: 8 },
];

export const editionById = (id: EditionId): Edition => EDITIONS.find((e) => e.id === id) ?? EDITIONS[0];

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

export type FrameId = 'paper' | 'ink' | 'gilt' | 'rarity';
export const FRAMES: FrameId[] = ['paper', 'ink', 'gilt', 'rarity'];
