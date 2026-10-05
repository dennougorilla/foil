// The Layers tab and the frame's own colours: Fine-tune loads them (adjust.ts). What the card shows
// of the areas is areas.ts, on the first load.
import './features.css';
import { initRangePanel, type RangeHost } from './rangePanel';
import { initSwatches, type SwatchHost } from './swatches';
import type { Areas } from './areas';

export function mountRangeColors(host: RangeHost & SwatchHost, areas: Areas) {
  initRangePanel(host, areas);
  return initSwatches(host);
}
