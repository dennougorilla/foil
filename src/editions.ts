export type EditionId =
  | 'base'
  | 'foil'
  | 'holo'
  | 'poly'
  | 'negative'
  | 'gold'
  | 'prism'
  | 'galaxy'
  | 'glitch';

export interface Edition {
  id: EditionId;
  /** Index passed to the card shader. */
  shader: number;
  /** Accent used for pills, particles and focus rings. */
  color: string;
  /** Three swirl colours for the background (dark, mid, light). */
  swirl: [string, string, string];
  value: number;
}

export const EDITIONS: Edition[] = [
  { id: 'base', shader: 0, color: '#c9d3d4', swirl: ['#142024', '#a83a33', '#25706b'], value: 0 },
  { id: 'foil', shader: 1, color: '#5fb4ff', swirl: ['#0f1c33', '#2d6fd6', '#9cc8ff'], value: 2 },
  { id: 'holo', shader: 2, color: '#ff6b8b', swirl: ['#220c19', '#b23a52', '#e0839a'], value: 3 },
  { id: 'poly', shader: 3, color: '#c58bff', swirl: ['#1b1238', '#7f4fe0', '#3cc8b4'], value: 5 },
  { id: 'negative', shader: 4, color: '#9a7bd1', swirl: ['#07060c', '#3a2a5c', '#7e66b0'], value: 5 },
  { id: 'gold', shader: 5, color: '#f2c14e', swirl: ['#1f1209', '#a86a22', '#e0b960'], value: 4 },
  { id: 'prism', shader: 6, color: '#7ef0e6', swirl: ['#0b2228', '#2bb3b8', '#f08bd0'], value: 6 },
  { id: 'galaxy', shader: 7, color: '#8e7dff', swirl: ['#05071a', '#30247a', '#d052a8'], value: 5 },
  { id: 'glitch', shader: 8, color: '#5cff8a', swirl: ['#060e09', '#1b6b3a', '#d43dff'], value: 1 },
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
