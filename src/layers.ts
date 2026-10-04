// The card's two layers of finish as the renderer draws them (docs/layering.md).
import { editionById, type Edition } from './editions';
import type { CardDraw } from './gl/renderers';
import type { State } from './state';

/** Layer 2 for the renderer, or undefined when there is none. */
export function layerDraw(s: Pick<State, 'edition' | 'layer2'>): CardDraw['layer'] {
  const l = s.layer2;
  if (!l) return undefined;
  return { edition: editionById(l.edition).shader, light: l.blend === 'light', strength: l.strength, under: s.edition !== 'base' };
}

/**
 * What the card shows: both layers, or, while one layer's area is being edited (`proof`), that
 * layer alone in its own area, so the overlay marks exactly what is being changed.
 */
export function cardLayers(s: Pick<State, 'edition' | 'layer2'>, proof: 0 | 1 | 2): Pick<CardDraw, 'edition' | 'layer' | 'area'> {
  if (proof === 2 && s.layer2) return { edition: editionById(s.layer2.edition).shader, area: 2 };
  if (proof) return { edition: editionById(s.edition).shader };
  return { edition: editionById(s.edition).shader, layer: layerDraw(s) };
}

/** The finishes on the card, layer 1 first. */
export const cardEditions = (s: Pick<State, 'edition' | 'layer2'>): Edition[] =>
  [editionById(s.edition), ...(s.layer2 ? [editionById(s.layer2.edition)] : [])];
