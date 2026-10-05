// Pixel art: the whole card (face, frame, words, picture, back) drawn as chunky pixels with few colours,
// and the finish's light in the same grain (docs/features.md, Card). These are the choices; the
// conversion of the face loads on demand (dot.ts).

/** Pixels across the card's short side. */
export const DOT_SIZES = [56, 72, 96, 128] as const;
/** Colours picked from the picture, or FOIL's own fixed palette. */
export const DOT_COLORS = [8, 16, 32, 'foil'] as const;

export type DotSize = (typeof DOT_SIZES)[number];
export type DotColors = (typeof DOT_COLORS)[number];

export interface Dot {
  size: DotSize;
  colors: DotColors;
  /** A one-pixel dark line on the darker side of strong edges. */
  outline: boolean;
  /** A light ordered dither between the palette's colours. */
  dither: boolean;
}

export type DotPreset = 'chunky' | 'retro' | 'fine';
export const DOT_PRESETS: Record<DotPreset, Dot> = {
  chunky: { size: 72, colors: 16, outline: true, dither: false },
  retro: { size: 56, colors: 'foil', outline: false, dither: true },
  fine: { size: 128, colors: 32, outline: false, dither: true },
};

const same = (a: Dot, b: Dot) => a.size === b.size && a.colors === b.colors && a.outline === b.outline && a.dither === b.dither;

/** The preset a setting is, 'off' when there is none, or null when it is the person's own mix. */
export function presetOf(dot: Dot | null): DotPreset | 'off' | null {
  if (!dot) return 'off';
  return (Object.keys(DOT_PRESETS) as DotPreset[]).find((p) => same(DOT_PRESETS[p], dot)) ?? null;
}

/** A saved setting made valid: anything that doesn't fit turns pixel art off. */
export function sanitizeDot(v: unknown): Dot | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Partial<Dot>;
  if (!DOT_SIZES.includes(d.size as DotSize) || !DOT_COLORS.includes(d.colors as DotColors)) return null;
  return { size: d.size as DotSize, colors: d.colors as DotColors, outline: d.outline === true, dither: d.dither === true };
}

/** Names a setting, for the conversion's cache. */
export const dotKey = (d: Dot) => `${d.size}/${d.colors}/${+d.outline}/${+d.dither}`;

/** The pixel grid across the card's short side that the shader steps the face and its light on; 0 = off. */
export const dotGrid = (dot: Dot | null) => dot?.size ?? 0;

/** The grid in columns and rows on a face `w` × `h` (as the shader rounds it: square cells on any shape). */
export function gridOf(w: number, h: number, size: number): { w: number; h: number } {
  const m = Math.min(w, h);
  return { w: Math.floor((size * w) / m + 0.5), h: Math.floor((size * h) / m + 0.5) };
}
