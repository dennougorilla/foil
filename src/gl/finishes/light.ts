// Light pack: Galaxy, Aurora, Glow, Blacklight, Thermal and Shallows (the showpiece). See docs/packs.md.
import { SHALLOWS_GLSL } from '../shallows';
import { TOUCH_GLSL } from '../../touch/glsl';
import { GLOW_GLSL } from '../../touch/glow';
import { HeatLayer } from '../../touch/layer';
import { BLACKLIGHT_GLSL } from '../blacklight';
import type { FinishModule } from './types';

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
// The heat ramp of a thermal camera: black, violet, red, orange, yellow and a white-hot core.
vec3 iron(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 col = vec3(0.02, 0.0, 0.04);
  col = mix(col, vec3(0.16, 0.01, 0.30), smoothstep(0.00, 0.16, x));
  col = mix(col, vec3(0.47, 0.02, 0.44), smoothstep(0.16, 0.32, x));
  col = mix(col, vec3(0.80, 0.05, 0.13), smoothstep(0.32, 0.48, x));
  col = mix(col, vec3(0.96, 0.30, 0.01), smoothstep(0.48, 0.64, x));
  col = mix(col, vec3(1.00, 0.62, 0.02), smoothstep(0.64, 0.80, x));
  col = mix(col, vec3(1.00, 0.92, 0.42), smoothstep(0.80, 0.93, x));
  col = mix(col, vec3(1.00, 0.99, 0.94), smoothstep(0.93, 1.00, x));
  return col;
}

// A thermal camera's view: the picture's tones are temperatures, mapped through the heat ramp.
// Tilting slides the window the camera reads, a slow drift and a fine detector grain keep the
// field alive, and a thin crosshair and scale read as the camera's own display, not a cartoon HUD.
vec3 thermal(vec3 c, vec2 uv, vec2 t, float L) {
  float gain = 1.0 + t.x * 0.22 + t.y * 0.10;
  float bias = t.x * 0.16 + t.y * 0.08;
  float drift = fbm(asTrading(uv) * 2.4 + vec2(uTime * 0.02, -uTime * 0.013) + t * 0.5) - 0.5;
  float grain = hash12(floor(uv * uCardK * 260.0) + floor(uTime * 14.0) * 0.37) - 0.5;
  float heat = clamp(L * gain + bias + drift * 0.16 + grain * 0.05, 0.0, 1.0);
  vec3 col = iron(heat);
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.84, 1.0, heat) * 0.35;
  // A hint of the picture's own colour survives in the cold end, so it reads as a lens, not a print.
  col = mix(col, col * (0.7 + 0.6 * c), 0.12 * (1.0 - heat));
  // The readout sits inside the art window: a crosshair, corner brackets and a scale of ticks.
  vec2 hk = (uArt.zw - uArt.xy) * 0.5 * uCardK;
  vec2 q = (uv - mix(uArt.xy, uArt.zw, 0.5)) * uCardK;
  float w = 0.005;
  float hline = (1.0 - smoothstep(0.0, w, abs(q.y))) * step(0.055, abs(q.x)) * step(abs(q.x), hk.x * 0.82);
  float vline = (1.0 - smoothstep(0.0, w, abs(q.x))) * step(0.055, abs(q.y)) * step(abs(q.y), hk.y * 0.82);
  float bx = hk.x * 0.86, by = hk.y * 0.86;
  float len = min(hk.x, hk.y) * 0.16;
  float vArm = (1.0 - smoothstep(0.0, w, abs(abs(q.x) - bx))) * step(abs(abs(q.y) - by), len);
  float hArm = (1.0 - smoothstep(0.0, w, abs(abs(q.y) - by))) * step(abs(abs(q.x) - bx), len);
  float step0 = max(hk.y, 0.08) * 0.12;
  float nx = abs(fract(q.x / step0 + 0.5) - 0.5) * step0;
  float ticks = (1.0 - smoothstep(0.0, 0.008, nx)) * step(abs(q.y + hk.y * 0.90), 0.03) * step(abs(q.x), hk.x * 0.82);
  float level = (1.0 - smoothstep(0.0, w, abs(q.x - hk.x * 0.94))) * step(abs(q.y - (heat - 0.5) * hk.y * 0.9), 0.022);
  float readout = max(max(hline, vline), max(max(vArm, hArm), max(ticks, level)));
  float art = texture(uMask, uv).r;
  col += vec3(0.85, 0.9, 1.0) * readout * art * 0.18 * (0.4 + 0.6 * heat);
  return col;
}

${SHALLOWS_GLSL}
${TOUCH_GLSL}
${GLOW_GLSL}
${BLACKLIGHT_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 7) col = galaxy(c, uv, uTilt, L);
  else if (e == 9) col = aurora(c, uv, uTilt, L);
  else if (e == 96) col = thermal(c, uv, uTilt, L);
  else if (e == 17) col = shallows(c, uv, uTilt, L, lod, m.r);
  else if (e == 70) col = glow(c, uv, L, m.r);
  else if (e == 72) col = blacklight(c, uv, L, lod, m);
`,
  // Glow keeps the light shone on it in a touch field, like Warmth's heat (see touch/).
  layers: (gl) => {
    const heat = new HeatLayer(gl);
    return [{ bind: (p, d) => heat.bind(p, 6, d.heat) }];
  },
};
export default finishes;
