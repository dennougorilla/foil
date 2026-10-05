// Nature pack: Sakura, Frost, Stardust, Snow Globe, Marble and Magma (the showpiece). See docs/packs.md.
import { STARDUST_GLSL } from '../stardust';
import { MARBLE_GLSL } from '../marble';
import { HeatLayer } from '../../touch/layer';
import { SnowGlobe, SNOWGLOBE_GLSL, SNOWGLOBE_SHADER } from '../snowglobe';
import type { FinishModule } from './types';

const finishes: FinishModule = {
  glsl: /* glsl */ `
vec3 frost(vec3 c, vec2 uv, vec2 t, float L) {
  // How far in from the nearest edge, in card widths of the short side.
  float edge = min(min(uv.x, 1.0 - uv.x) * uCardK.x, min(uv.y, 1.0 - uv.y) * uCardK.y);
  vec2 tu = asTrading(uv);
  float n = fbm(tu * 9.0 + 3.0);
  float reach = smoothstep(0.26, 0.02, edge + (n - 0.5) * 0.22);
  // Dendrite-like streaks: ridges of a stretched noise field.
  float ridge = 1.0 - abs(vnoise(uv * uCardK * 70.0) * 2.0 - 1.0);
  ridge = pow(ridge, 8.0);
  float ridge2 = pow(1.0 - abs(vnoise(tu.yx * vec2(38.0, 52.0) + 7.0) * 2.0 - 1.0), 10.0);
  vec3 cold = mix(vec3(L), c, 0.55) * vec3(0.82, 0.94, 1.12) + vec3(0.02, 0.05, 0.1);
  vec3 ice = vec3(0.86, 0.95, 1.0) + (ridge + ridge2) * 0.3;
  vec3 col = mix(cold, ice, reach * (0.55 + 0.35 * max(ridge, ridge2)));
  vec2 cell = floor(uv * uCardK * 70.0);
  float s = hash12(cell);
  float glint = step(0.96, s) * smoothstep(0.6, 1.0, sin(s * 40.0 + (t.x - t.y) * 8.0) * 0.5 + 0.5);
  col += vec3(0.9, 0.97, 1.0) * glint * (0.3 + reach);
  return col;
}

vec3 magma(vec3 c, vec2 uv, vec2 t, float L) {
  vec4 v = voronoi(uv * uCardK * 6.0 + vec2(0.0, 0.3));
  float crack = 1.0 - smoothstep(0.0, 0.09, v.y - v.x);
  float pulse = 0.65 + 0.35 * sin(uTime * 1.8 + hash12(v.zw) * 6.28 + (t.x + t.y) * 2.0);
  vec3 stone = c * vec3(0.5, 0.38, 0.34) + vec3(0.03, 0.01, 0.0);
  vec3 lava = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.3), crack * pulse);
  vec3 col = mix(stone, lava, crack * (0.75 + 0.25 * pulse));
  // The brightest parts of the art glow like embers.
  col += vec3(1.0, 0.45, 0.1) * smoothstep(0.6, 0.95, L) * 0.55 * pulse;
  col += vec3(1.0, 0.5, 0.15) * smoothstep(0.25, 0.0, v.y - v.x) * 0.12;
  return col;
}

vec3 sakura(vec3 c, vec2 uv, vec2 t, float L) {
  vec3 col = mix(c, c * vec3(1.06, 0.9, 0.96) + vec3(0.05, 0.0, 0.03), 0.6);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 4.0 + fi * 2.5;
    vec2 q = uv * uCardK * scale;
    q += vec2(sin(uTime * 0.4 + fi * 2.0 + uv.y * 3.0) * 0.35, -uTime * (0.25 + fi * 0.08));
    q += t * (0.3 + fi * 0.25);
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash12(cell + fi * 13.0);
    if (h < 0.62) continue;
    f -= (hash22(cell + fi) - 0.5) * 0.5;
    float a = h * 6.28 + uTime * (0.6 + h);
    f = mat2(cos(a), -sin(a), sin(a), cos(a)) * f;
    // Petal: a squashed teardrop with a notch at its tip.
    // Petal: a teardrop (round base, pointed top) with a notch cut into the tip.
    float sz = 0.2 * (1.0 - fi * 0.18);
    vec2 g = f / sz;
    float w = 0.62 * (1.0 - smoothstep(-0.9, 1.0, g.y)) + 0.18;
    float d = length(vec2(g.x / w, g.y)) - 1.0;
    d = max(d, -(length(g - vec2(0.0, 1.0)) - 0.28));
    float petal = smoothstep(0.08, -0.08, d);
    float vein = smoothstep(0.08, 0.0, abs(g.x)) * smoothstep(1.0, -0.6, g.y);
    vec3 pink = mix(vec3(0.98, 0.55, 0.7), vec3(1.0, 0.86, 0.9), smoothstep(-0.2, -0.9, d));
    pink = mix(pink, vec3(0.95, 0.45, 0.62), vein * 0.5);
    col = mix(col, pink, petal * (0.95 - fi * 0.15));
  }
  return col;
}
${STARDUST_GLSL}
${SNOWGLOBE_GLSL}
${MARBLE_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 10) col = frost(c, uv, uTilt, L);
  else if (e == 11) col = magma(c, uv, uTilt, L);
  else if (e == 14) col = sakura(c, uv, uTilt, L);
  else if (e == 22) col = stardust(c, uv, uTilt, L);
  else if (e == 60) col = snowglobe(c, artUv, uTilt, L, lod, m.r);
  else if (e == 102) col = marble(c, uv, uTilt, L, m.r);
`,
  // Snow Globe's flakes are GPU particles drawn over its card; one set per renderer, made on first use.
  // Marble keeps where touch carried its ink in a touch field, like Warmth's heat (see touch/).
  layers: (gl, live) => {
    let globe: SnowGlobe | null = null;
    let face: HTMLCanvasElement | null = null;
    const flow = new HeatLayer(gl, 'uMarbleFlow');
    return [
      { bind: (p, d) => flow.bind(p, 6, d.heat) },
      {
        // The flakes fill the card's art window, which moves with the layout.
        setFace: (f) => {
          face = f;
          globe?.setFace(f);
        },
        after: (view, d, time) => {
          if (d.edition !== SNOWGLOBE_SHADER) return;
          if (!globe) {
            globe = new SnowGlobe(gl, !live);
            if (face) globe.setFace(face);
          }
          globe.draw(view, d, time);
        },
      },
    ];
  },
};
export default finishes;
