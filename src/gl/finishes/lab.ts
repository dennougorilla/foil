// Lab pack (provisional, review-v015): the nine finishes added after v0.14, gathered in one pack so
// they can be tried together. Where each one finally goes is the owner's call. See docs/packs.md.
import { CHAMELEON_GLSL } from '../chameleon';
import { NEON_GLSL } from '../neon';
import { RAIN_GLSL } from '../rain';
import { TOUCH_GLSL } from '../../touch/glsl';
import { HeatLayer } from '../../touch/layer';
import { PLASMA_GLSL } from '../plasma';
import { LIQUID_METAL_GLSL, LiquidMetalLayer } from '../liquidMetal';
import { KALEIDOSCOPE_GLSL } from '../kaleidoscope';
import type { FinishModule } from './types';

const finishes: FinishModule = {
  glsl: /* glsl */ `
${CHAMELEON_GLSL}
${NEON_GLSL}
${TOUCH_GLSL}
${RAIN_GLSL}
${PLASMA_GLSL}
${LIQUID_METAL_GLSL}
${KALEIDOSCOPE_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 90) col = chameleon(c, uv, uTilt, L, m.r);
  else if (e == 92) col = neon(c, uv, uTilt, L, m.r);
  else if (e == 94) col = rain(c, uv, uTilt, lod, m.r);
  else if (e == 96) col = plasma(c, uv, L);
  else if (e == 98) col = liquidMetal(c, uv, uTilt, L, lod, m.r);
  else if (e == 100) col = kaleidoscope(c, uv, uTilt, lod, m.r);
`,
  // The touch finishes here (Rainy Window, …) keep their field like Warmth's heat (see touch/).
  // Liquid Metal's ripples are a field of their own on unit 10 (unit 6 is the heat's here).
  layers: (gl) => {
    const heat = new HeatLayer(gl);
    const liquid = new LiquidMetalLayer(gl);
    return [{ bind: (p, d) => heat.bind(p, 6, d.heat) }, { bind: (p, d) => liquid.bind(p, 10, d.heat) }];
  },
};
export default finishes;
