// Entry for the Foil range and custom colours; main.ts calls into it through a handful of hooks.
import './features.css';
import { initRangePanel } from './rangePanel';
import { initSwatches, type SwatchHost } from './swatches';
import type { FaceSpec } from './card/face';

export function initRangeColors(host: SwatchHost) {
  const range = initRangePanel(host);
  const colors = initSwatches(host);
  return {
    /** After the live face is redrawn. */
    onFace: (face: HTMLCanvasElement, mask: HTMLCanvasElement, spec: FaceSpec) => range.onFace(face, mask, spec),
    /** After the frame radio group is rebuilt. */
    decorateFrames: colors.decorateFrames,
    /** Extra export input: where the finish lands and the backdrop of clips. */
    exportExtras: () => ({ range: range.snapshot(), swirl: colors.swirl() }),
  };
}
