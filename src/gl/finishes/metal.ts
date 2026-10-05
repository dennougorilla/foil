// Metal pack: Platinum, Gold, Relief, Chameleon and Cosmo Holo (the showpiece). See docs/packs.md.
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
`,
  layers: (gl, live) => {
    const relief = new ReliefGL(gl, live);
    return [{ setFace: (face) => relief.setFace(face), bind: (p, d) => relief.bind(p, 5, d.edition === RELIEF) }];
  },
};
export default finishes;
