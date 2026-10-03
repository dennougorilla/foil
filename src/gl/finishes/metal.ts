// Metal & Gem pack: Gold, Crystal and Relief (the showpiece). See docs/packs.md.
import { RELIEF_GLSL, ReliefGL } from '../../relief';
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
  vec2 cell = floor(uv * vec2(90.0, 126.0));
  float g = hash12(cell);
  float tw = smoothstep(0.86, 1.0, sin(g * 40.0 + (t.x - t.y) * 9.0 + uTime * 0.8) * 0.5 + 0.5);
  col += vec3(1.0, 0.95, 0.8) * tw * step(0.93, g) * 0.8;
  return col;
}

vec3 crystal(vec3 c, vec2 uv, vec2 t, float L, float lod) {
  // Triangular facets that each bend the picture a little and catch their own glint.
  vec2 p = uv * vec2(8.0, 11.2);
  vec2 ip = floor(p), fp = fract(p);
  float upper = step(fp.x, fp.y);
  vec2 id = ip * 2.0 + upper;
  vec2 n = hash22(id + 4.0) * 2.0 - 1.0;
  vec3 bent = face(uv + n * 0.012, lod).rgb;
  float lit = pow(max(dot(normalize(vec3(n, 1.6)), normalize(vec3(t * 0.9, 1.0))), 0.0), 18.0);
  float line = min(min(fp.x, 1.0 - fp.y), abs(fp.x - fp.y) * 0.7071);
  float edge = 1.0 - smoothstep(0.0, 0.025, line);
  vec3 col = bent * (0.88 + 0.18 * n.x) + vec3(0.92, 0.96, 1.0) * lit * 0.6;
  col += vec3(1.0) * edge * (0.06 + 0.3 * lit);
  float disp = 0.04 * dot(n, t);
  col += hsv2rgb(vec3(fract(hash12(id) + disp), 0.4, 1.0)) * lit * 0.25;
  return col;
}
${RELIEF_GLSL}
`,
  dispatch: /* glsl */ `
  else if (e == 5) col = gold(c, uv, uTilt, L);
  else if (e == 13) col = crystal(c, uv, uTilt, L, lod);
  else if (e == 15) col = relief(c, uv, uTilt, L, lod, m);
`,
  layers: (gl, live) => {
    const relief = new ReliefGL(gl, live);
    return [{ setFace: (face) => relief.setFace(face), bind: (p, d) => relief.bind(p, 5, d.edition === RELIEF) }];
  },
};
export default finishes;
