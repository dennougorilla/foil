// Entry for the Foil range and custom colours; main.ts calls into it through a handful of hooks.
import './features.css';
import { initRangePanel, type RangeHost } from './rangePanel';
import { initSwatches, type SwatchHost } from './swatches';
import type { FaceSpec } from './card/face';
import { editionById } from './editions';
import { layerDraw } from './layers';

export function initRangeColors(host: RangeHost & SwatchHost) {
  const range = initRangePanel(host);
  const colors = initSwatches(host);
  return {
    /** After the live face is redrawn. */
    onFace: (face: HTMLCanvasElement, mask: HTMLCanvasElement, spec: FaceSpec) => range.onFace(face, mask, spec),
    /** After the frame radio group is rebuilt. */
    decorateFrames: colors.decorateFrames,
    /** Extra export input: where the finish lands, and layer 2. */
    exportExtras: () => {
      const s = host.store.get();
      const draw = layerDraw(s);
      return { range: range.snapshot(), layer: s.layer2 && draw ? { edition: editionById(s.layer2.edition), draw, range: range.snapshot2() } : undefined };
    },
  };
}
