// Studio pack: Halftone, Warmth and Shadowbox (the showpiece). See docs/packs.md.
// Shadowbox's sheets are textures of the card renderer itself (the depth code sets them).
import { TOUCH_GLSL } from '../../touch/glsl';
import { HeatLayer } from '../../touch/layer';
import { SHADOWBOX_GLSL } from '../shadowboxShader';
import { STAINED_GLASS_GLSL } from '../stainedGlass';
import type { FinishModule } from './types';

const finishes: FinishModule = {
  glsl: /* glsl */ `
float dots(vec2 uv, float ang, float ink) {
  float s = sin(ang), co = cos(ang);
  vec2 p = mat2(co, -s, s, co) * (uv * vec2(1.0, 1.4)) * 62.0;
  vec2 f = fract(p) - 0.5;
  float r = sqrt(clamp(ink, 0.0, 1.0)) * 0.62;
  return smoothstep(r + 0.06, r - 0.06, length(f));
}

vec3 halftone(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 mis = t * 0.0025; // a little misregistration as you tilt
  vec3 ink = 1.0 - c;
  float k = min(ink.r, min(ink.g, ink.b));
  vec3 cmy = (ink - k) / max(1.0 - k, 1e-3);
  float dc = dots(uv + mis, 0.26, cmy.r);
  float dm = dots(uv - mis, 1.31, cmy.g);
  float dy = dots(uv, 0.0, cmy.b);
  float dk = dots(uv, 0.79, k * 1.1);
  vec3 paper = vec3(0.98, 0.95, 0.87);
  vec3 col = paper;
  col *= 1.0 - dc * vec3(0.9, 0.0, 0.0) * 0.95;
  col *= 1.0 - dm * vec3(0.0, 0.85, 0.0) * 0.95;
  col *= 1.0 - dy * vec3(0.0, 0.0, 0.9) * 0.95;
  col *= 1.0 - dk * 0.88;
  return col;
}
${TOUCH_GLSL}
${SHADOWBOX_GLSL}
${STAINED_GLASS_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 12) col = halftone(c, uv, uTilt, L);
  else if (e == 20) col = warmth(c, uv, uTilt, L, m.r);
  else if (e == 16) col = shadowbox(c, uv, uTilt, lod);
  else if (e == 26) col = stainedGlass(c, uv, uTilt, L, m.r);
`,
  layers: (gl) => {
    const heat = new HeatLayer(gl);
    return [{ bind: (p, d) => heat.bind(p, 6, d.heat) }];
  },
};
export default finishes;
