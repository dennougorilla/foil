// Lab pack (provisional, review-v015): the nine finishes added after v0.14, gathered in one pack so
// they can be tried together. Where each one finally goes is the owner's call. See docs/packs.md.
import { CHAMELEON_GLSL } from '../chameleon';
import { NEON_GLSL } from '../neon';
import { RAIN_GLSL } from '../rain';
import { TOUCH_GLSL } from '../../touch/glsl';
import { HeatLayer } from '../../touch/layer';
import type { FinishModule } from './types';

const finishes: FinishModule = {
  glsl: /* glsl */ `
${CHAMELEON_GLSL}
${NEON_GLSL}
${TOUCH_GLSL}
${RAIN_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 90) col = chameleon(c, uv, uTilt, L, m.r);
  else if (e == 92) col = neon(c, uv, uTilt, L, m.r);
  else if (e == 94) col = rain(c, uv, uTilt, lod, m.r);
`,
  // The touch finishes here (Rainy Window, …) keep their field like Warmth's heat (see touch/).
  layers: (gl) => {
    const heat = new HeatLayer(gl);
    return [{ bind: (p, d) => heat.bind(p, 6, d.heat) }];
  },
};
export default finishes;
