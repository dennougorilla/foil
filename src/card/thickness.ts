// How thick the card is: its material and its depth. The depth is in units of the card's short side,
// exaggerated over a real card's so the side reads at screen size.
//
// No imports: the tests load this file directly with Node.

export type EdgeMaterial = 'paper' | 'acrylic';

export interface Thickness {
  material: EdgeMaterial;
  /** The slab's depth, in units of the card's short side. */
  depth: number;
}

export type ThicknessPreset = 'thin' | 'board' | 'chunky' | 'acrylic';

export const THICKNESS_PRESETS: Record<ThicknessPreset, Thickness> = {
  thin: { material: 'paper', depth: 0.012 },
  board: { material: 'paper', depth: 0.03 },
  chunky: { material: 'paper', depth: 0.07 },
  acrylic: { material: 'acrylic', depth: 0.12 },
};

export const THICKNESS_IDS = Object.keys(THICKNESS_PRESETS) as ThicknessPreset[];

/** Where the slider runs for each material. */
export const DEPTH_RANGE: Record<EdgeMaterial, [number, number]> = {
  paper: [0.006, 0.1],
  acrylic: [0.05, 0.22],
};

export const DEFAULT_THICKNESS: Thickness = THICKNESS_PRESETS.thin;

/** The clear margin of an acrylic block round the card, in units of the card's short side. */
export const ACRYLIC_MARGIN = 0.07;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A saved thickness, or the default when it is not one. */
export function sanitizeThickness(v: unknown): Thickness {
  const t = v as Partial<Thickness> | null;
  if (!t || (t.material !== 'paper' && t.material !== 'acrylic') || typeof t.depth !== 'number' || !Number.isFinite(t.depth)) return { ...DEFAULT_THICKNESS };
  const [a, b] = DEPTH_RANGE[t.material];
  return { material: t.material, depth: clamp(t.depth, a, b) };
}

/** The preset a thickness is shown as: Acrylic for acrylic, otherwise the nearest paper one. */
export function presetOf(t: Thickness): ThicknessPreset {
  if (t.material === 'acrylic') return 'acrylic';
  const paper = THICKNESS_IDS.filter((id) => THICKNESS_PRESETS[id].material === 'paper');
  return paper.reduce((best, id) => (Math.abs(THICKNESS_PRESETS[id].depth - t.depth) < Math.abs(THICKNESS_PRESETS[best].depth - t.depth) ? id : best));
}

/** The slider's place (0..1) for a thickness, and the depth at a place. */
export function sliderOf(t: Thickness): number {
  const [a, b] = DEPTH_RANGE[t.material];
  return clamp((t.depth - a) / (b - a), 0, 1);
}

export function depthAt(material: EdgeMaterial, v: number): number {
  const [a, b] = DEPTH_RANGE[material];
  return a + (b - a) * clamp(v, 0, 1);
}

/** Paper plies seen on the side: two on a thin card, more as it thickens. */
export const pliesOf = (depth: number): number => clamp(Math.round(depth / 0.006), 2, 14);

/**
 * How the renderer draws a thickness for a card of short side `short` (px): the slab's depth, the
 * card's scale inside it (an acrylic block takes the card's place, the card shrinks into it) and
 * the block's clear margin round the card, both in px.
 */
export function slabOf(t: Thickness, short: number): { depth: number; inner: number; margin: number } {
  if (t.material === 'paper') return { depth: t.depth * short, inner: 1, margin: 0 };
  const inner = 1 / (1 + 2 * ACRYLIC_MARGIN);
  return { depth: t.depth * short, inner, margin: ACRYLIC_MARGIN * short * inner };
}
