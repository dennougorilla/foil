// Light pack: Galaxy, Aurora, Glow, Blacklight, Neon and Shallows (the showpiece). See docs/packs.md.
import { SHALLOWS_GLSL } from '../shallows';
import { TOUCH_GLSL } from '../../touch/glsl';
import { GLOW_GLSL } from '../../touch/glow';
import { HeatLayer } from '../../touch/layer';
import { BLACKLIGHT_GLSL } from '../blacklight';
import { NEON_GLSL } from '../neon';
import { NeonGL } from '../neonGL';
import type { FinishModule } from './types';

const NEON = 92;

const finishes: FinishModule = {
  glsl: /* glsl */ `
vec3 galaxy(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 par = t * 0.08;
  vec2 tu = asTrading(uv);
  float n = fbm(tu * 3.0 + par * 2.0 + uTime * 0.02);
  float n2 = fbm(tu * 5.0 - par * 3.0 + 4.0);
  vec3 nebula = mix(vec3(0.12, 0.05, 0.35), vec3(0.85, 0.25, 0.65), smoothstep(0.35, 0.75, n));
  nebula = mix(nebula, vec3(0.2, 0.55, 1.0), smoothstep(0.5, 0.85, n2) * 0.7);
  vec3 col = mix(c, c * 0.55 + nebula * 0.75, (1.0 - L) * 0.8 + 0.2);
  vec2 cell = floor((uv + par) * uCardK * 110.0);
  float s = hash12(cell);
  float tw = 0.5 + 0.5 * sin(s * 50.0 + uTime * 2.2 + (t.x + t.y) * 6.0);
  col += vec3(1.0) * step(0.965, s) * tw * 1.1;
  // A few bright four-point stars that drift with parallax
  vec2 sp = (uv + par * 2.5) * uCardK * 7.0;
  vec2 sc = floor(sp);
  vec2 so = fract(sp) - 0.25 - 0.5 * hash22(sc);
  float big = step(0.72, hash12(sc + 9.0));
  float cross = max(smoothstep(0.012, 0.0, abs(so.x)) * smoothstep(0.09, 0.0, abs(so.y)),
                    smoothstep(0.012, 0.0, abs(so.y)) * smoothstep(0.09, 0.0, abs(so.x)));
  float tw2 = 0.6 + 0.4 * sin(uTime * 3.0 + hash12(sc) * 30.0);
  col += vec3(0.85, 0.9, 1.0) * cross * big * tw2 * 1.2;
  return col;
}

vec3 aurora(vec3 c, vec2 uv, vec2 t, float L) {
  // Vertical curtains whose hem ripples sideways; strongest near the top.
  // Two layers of folded curtains; the hem ripples sideways as you tilt.
  float wave = sin(uv.y * 4.0 + uTime * 0.35 + t.x * 1.5) * 0.08;
  float x = (uv.x + wave) * 9.0 + t.x * 1.6;
  float ray = fbm(vec2(x, uTime * 0.1 + t.y * 0.5));
  float ray2 = fbm(vec2(x * 0.5 + 11.0, uTime * 0.07));
  ray = smoothstep(0.3, 0.75, ray) * 0.75 + smoothstep(0.35, 0.8, ray2) * 0.5;
  float hem = 0.78 + 0.08 * sin(uv.x * 5.0 + uTime * 0.5 + t.y * 2.0) + 0.04 * sin(uv.x * 17.0 - uTime);
  float curtain = ray * smoothstep(hem, hem - 0.6, uv.y) * smoothstep(-0.05, 0.25, uv.y);
  // Green body, a violet fringe at the very top, teal where it fades out.
  vec3 tone = mix(vec3(0.18, 1.0, 0.58), vec3(0.72, 0.36, 1.0), smoothstep(0.72, 0.95, 1.0 - uv.y + ray * 0.1));
  tone = mix(tone, vec3(0.25, 0.8, 0.95), smoothstep(0.55, 0.85, uv.y));
  vec3 col = c * vec3(0.62, 0.7, 0.85);
  col = screen(col, tone * curtain * 1.15);
  col += tone * 0.2 * curtain;
  return col;
}
${SHALLOWS_GLSL}
${TOUCH_GLSL}
${GLOW_GLSL}
${BLACKLIGHT_GLSL}
${NEON_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 7) col = galaxy(c, uv, uTilt, L);
  else if (e == 9) col = aurora(c, uv, uTilt, L);
  else if (e == 17) col = shallows(c, uv, uTilt, L, lod, m.r);
  else if (e == 70) col = glow(c, uv, L, m.r);
  else if (e == 72) col = blacklight(c, uv, L, lod, m);
  else if (e == 92) col = neon(c, uv, uTilt, L, m.r);
`,
  // Glow keeps the light shone on it in a touch field, like Warmth's heat (see touch/).
  // Neon lays its sign out once per picture (see neonGL.ts), its two maps on units 12 and 13
  // (0–4 and 7–9 are the core's, 6 Glow's touch field).
  layers: (gl, live) => {
    const heat = new HeatLayer(gl);
    const neon = new NeonGL(gl, live);
    return [{ bind: (p, d) => heat.bind(p, 6, d.heat) }, { setFace: (face) => neon.setFace(face), bind: (p, d) => neon.bind(p, 12, d.edition === NEON) }];
  },
};
export default finishes;
