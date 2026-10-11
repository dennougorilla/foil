// Studio pack: Halftone, Warmth, Stained Glass, Flip Lenticular, 3D Lenticular and Shadowbox (the showpiece). See docs/packs.md.
// Shadowbox's sheets are textures of the card renderer itself (the depth code sets them).
import { TOUCH_GLSL } from '../../touch/glsl';
import { HeatLayer } from '../../touch/layer';
import { SHADOWBOX_GLSL } from '../shadowboxShader';
import { LENTICULAR3D_GLSL } from '../lenticular3d';
import { STAINED_GLASS_GLSL } from '../stainedGlass';
import { LENTICULAR_FLIP_GLSL } from '../lenticularFlip';
import type { FinishModule } from './types';

const finishes: FinishModule = {
  glsl: /* glsl */ `
float dots(vec2 uv, float ang, float ink) {
  float s = sin(ang), co = cos(ang);
  vec2 p = mat2(co, -s, s, co) * (uv * uCardK) * 62.0;
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
// Cyanotype: the picture as a sun-print. The face is a hand-brushed coating of Prussian blue on
// paper: the picture's lights leave the paper bare, its darks carry the blue, the coating pools
// unevenly, and outside the picture the brush's edge frays into the fibers of the sheet. Tilting
// slips a faint fresh-print sheen across it. It reads the face and the tilt only, never the clock.
vec3 cyanotype(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 px = uv * uCardK * 900.0; // face pixels; the short side is 900 on every shape
  vec2 win = uCardK * 900.0;
  vec3 paper = vec3(0.936, 0.930, 0.876);
  vec3 cyan = vec3(0.278, 0.494, 0.678);
  vec3 ink = vec3(0.047, 0.129, 0.298);

  // The print: the picture's lights keep the paper, its darks take the blue.
  float d = pow(smoothstep(0.02, 0.98, L), 0.82);
  vec3 col = mix(ink, cyan, smoothstep(0.0, 0.58, d));
  col = mix(col, paper, smoothstep(0.58, 1.0, d));
  // The coating is not even: it pools and thins where the brush crossed it.
  col *= 0.85 + 0.30 * fbm(px * 0.016 + 4.2);

  // The hand-brushed edge: past the picture the emulsion frays into bare paper. Bristle streaks
  // run one way and make the boundary ragged, and a few of them bite deeper.
  vec2 dp = min(px, win - px);
  float border = min(dp.x, dp.y);
  float wob = fbm(px * 0.055 + 9.0) * 0.6 + fbm(px * 0.15 + 2.0) * 0.4;
  float streak = vnoise(vec2(dot(px, vec2(0.82, 0.57)) * 0.8, dot(px, vec2(-0.57, 0.82)) * 0.07));
  float reach = 14.0 + 40.0 * wob + 46.0 * streak;
  float coat = smoothstep(reach, reach + 10.0, border);
  coat *= 1.0 - 0.45 * smoothstep(0.66, 1.0, vnoise(px * vec2(0.6, 0.05) + 5.0));
  coat = mix(1.0, coat, 1.0 - art);

  // Bare paper has its fibers and a little tooth.
  float fiber = vnoise(px * vec2(0.5, 5.5)) - 0.5;
  float grain = hash12(floor(px * 1.6) + 0.5) - 0.5;
  vec3 bare = paper * (1.0 + fiber * 0.05 + grain * 0.025);

  col = mix(bare, col, coat);
  // The emulsion pools a shade darker where the brush lifted, so the edge reads as a stroke.
  col *= 1.0 - 0.22 * coat * (1.0 - coat) * 4.0;

  // Fresh-print sheen: a soft gloss slips across the coated art as the card tilts, plus the
  // room light's own faint reflection.
  float sweep = dot(px / 900.0, vec2(0.78, 0.62)) - (t.x + t.y) * 0.55;
  col += uTLight * exp(-pow((sweep - 0.18) / 0.52, 2.0)) * 0.05 * coat;
  vec2 gq = (uv - uLight) * uCardK;
  col += uTLight * exp(-dot(gq, gq) * 1.6) * 0.055 * coat;
  return col;
}
${TOUCH_GLSL}
${SHADOWBOX_GLSL}
${LENTICULAR3D_GLSL}
${STAINED_GLASS_GLSL}
${LENTICULAR_FLIP_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 12) col = halftone(c, uv, uTilt, L);
  else if (e == 28) col = cyanotype(c, uv, uTilt, L, m.r);
  else if (e == 20) col = warmth(c, uv, uTilt, L, m.r);
  else if (e == 74) col = lenticular3d(c, uv, uTilt, lod);
  else if (e == 16) col = shadowbox(c, uv, uTilt, lod);
  else if (e == 26) col = stainedGlass(c, uv, uTilt, L, m.r);
  else if (e == 76) col = lenticularFlip(c, uv, uTilt, lod, m.r);
`,
  layers: (gl) => {
    const heat = new HeatLayer(gl);
    return [{ bind: (p, d) => heat.bind(p, 6, d.heat) }];
  },
};
export default finishes;
