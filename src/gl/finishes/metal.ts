// Metal pack: Platinum, Gold, Relief, Chameleon, Guilloche and Cosmo Holo (the showpiece). See docs/packs.md.
import { RELIEF_GLSL, ReliefGL } from '../../relief';
import { PLATINUM_GLSL } from '../platinum';
import { COSMOHOLO_GLSL } from '../cosmoholo';
import { CHAMELEON_GLSL } from '../chameleon';
import type { FinishModule } from './types';

/** Relief's shader index (see src/editions.ts). */
const RELIEF = 15;

const finishes: FinishModule = {
  glsl: /* glsl */ `
vec3 gold(vec3 c, vec2 uv, vec2 t, float L) {
  vec3 dark = vec3(0.22, 0.1, 0.02), mid = vec3(0.92, 0.62, 0.18), hi = vec3(1.0, 0.95, 0.72);
  vec3 ramp = L < 0.55 ? mix(dark, mid, L / 0.55) : mix(mid, hi, (L - 0.55) / 0.45);
  vec3 col = mix(ramp, c * vec3(1.0, 0.85, 0.55), 0.22);
  float sweep = smoothstep(0.78, 1.0, 0.5 + 0.5 * sin((uv.x + uv.y * 0.6) * 8.0 + (t.x + t.y) * 6.0));
  col += vec3(1.0, 0.9, 0.6) * sweep * 0.55;
  vec2 cell = floor(uv * uCardK * 90.0);
  float g = hash12(cell);
  float tw = smoothstep(0.86, 1.0, sin(g * 40.0 + (t.x - t.y) * 9.0 + uTime * 0.8) * 0.5 + 0.5);
  col += vec3(1.0, 0.95, 0.8) * tw * step(0.93, g) * 0.8;
  return col;
}

vec3 guilloche(vec3 c, vec2 uv, vec2 t, float L) {
  // A banknote security print: fine interlaced guilloche lines cut into the card, a rosette
  // over the centre and wavy bands across it. Dead flat until it tilts, then the lines turn
  // iridescent where the light catches them; a small diffraction seal sits on the top frame.
  vec2 p = (uv - 0.5) * uCardK;
  float r = length(p);
  float a = atan(p.y, p.x);
  // The light the tilt carries over the face: the lines nearest it catch brightest.
  vec2 lp = t * 0.45;
  float catch = exp(-dot(p - lp, p - lp) * 2.4);

  // Interlaced families of sine-wave lines, each at its own angle.
  float lines = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = fi * 1.0472;
    vec2 d = vec2(cos(ang), sin(ang));
    vec2 n = vec2(-d.y, d.x);
    float u = dot(p, d);
    float v = dot(p, n);
    float phase = u * (17.0 + fi) + sin(v * (5.0 + fi * 0.6) + fi * 1.7) * 1.2 + dot(t, d) * 0.8;
    float w = 0.028 + 0.012 * sin(v * 13.0 + fi * 2.0);
    lines = max(lines, smoothstep(0.5 - w, 0.5, abs(fract(phase) - 0.5)));
  }
  // The rosette: rings that wind as they go out, so the families cross and interlace.
  float rose = r * 24.0 + a * 3.0 + sin(r * 11.0) * 1.4 + dot(t, vec2(0.7, -0.5)) * 1.3;
  lines = max(lines, smoothstep(0.464, 0.5, abs(fract(rose) - 0.5)));

  // Engraved: a dark groove whose depth follows the ink, so it reads on light and dark.
  float depth = 0.30 + 0.30 * (1.0 - L);
  vec3 col = c * (1.0 - depth * lines);
  col += vec3(0.82, 0.88, 0.95) * lines * catch * 0.18;

  // Diffraction: the spectrum rides the lines and slides with the tilt.
  float hue = fract(r * 1.4 + a * 0.18 + dot(t, vec2(0.5, 0.3)) + 0.15);
  vec3 irid = hsv2rgb(vec3(hue, 0.62, 1.0));
  float sheen = lines * catch * (0.35 + 0.65 * smoothstep(0.0, 0.55, L));
  col = screen(col, irid * sheen * 0.6);
  col += vec3(0.9, 0.95, 1.0) * pow(lines, 4.0) * catch * 0.45;

  // The seal: a small disc on the top-right frame, a fine grating of its own.
  vec2 q = p - vec2(0.5 * uCardK.x - 0.075, 0.075 - 0.5 * uCardK.y);
  float qd = length(q);
  float disc = 1.0 - smoothstep(0.046, 0.052, qd);
  float grain = 0.5 + 0.5 * sin(qd * 330.0 + dot(t, q) * 36.0);
  float sealHue = fract(qd * 9.0 + atan(q.y, q.x) * 0.14 + dot(t, vec2(0.4, 0.5)));
  vec3 sealInk = mix(vec3(0.1, 0.15, 0.2), hsv2rgb(vec3(sealHue, 0.7, 1.0)), 0.5 + 0.5 * grain);
  float rim = smoothstep(0.038, 0.048, qd) * (1.0 - smoothstep(0.048, 0.055, qd));
  col = mix(col, sealInk * (0.55 + 0.55 * grain) + vec3(0.85, 0.9, 1.0) * rim * 0.4, disc * (0.55 + 0.45 * catch));
  return col;
}

${RELIEF_GLSL}
${PLATINUM_GLSL}
${COSMOHOLO_GLSL}
${CHAMELEON_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 5) col = gold(c, uv, uTilt, L);
  else if (e == 15) col = relief(c, uv, uTilt, L, lod, m);
  else if (e == 24) col = platinum(c, uv, uTilt, L, m.r);
  else if (e == 18) col = cosmoholo(c, uv, uTilt, L);
  else if (e == 90) col = chameleon(c, uv, uTilt, L, m.r);
  else if (e == 91) col = guilloche(c, uv, uTilt, L);
`,
  layers: (gl, live) => {
    const relief = new ReliefGL(gl, live);
    return [{ setFace: (face) => relief.setFace(face), bind: (p, d) => relief.bind(p, 5, d.edition === RELIEF) }];
  },
};
export default finishes;
