// What a pack's module hands the card renderer: its finishes' shader code and the textures they need.
import type { Program } from '../gl';
import type { CardDraw } from '../renderers';

/** Per-renderer state a finish needs besides the face (Relief's map, Warmth's heat). */
export interface FinishLayer {
  setFace?(face: HTMLCanvasElement): void;
  bind(p: Program, d: CardDraw): void;
}

export interface FinishModule {
  /** Functions and uniforms, spliced into the card shader after the core helpers. */
  glsl: string;
  /** Continues the `if (e == N) col = …;` chain in the card shader's main(). */
  dispatch: string;
  /** `live`: drawn on the stage (false for exports, which always draw at full quality). */
  layers?: (gl: WebGL2RenderingContext, live: boolean) => FinishLayer[];
}
