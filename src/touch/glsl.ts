// The Warmth finish: thermochromic ink over the art. Spliced into CARD_FS after the shared helpers
// and the tune, so hash/fbm/hsv2rgb, tuneFaceUv, uTime and uLight are in scope.
import { HEAT_H, HEAT_W } from './heat';

export const TOUCH_GLSL = /* glsl */ `
uniform sampler2D uHeat;   // heat over the card, ${HEAT_W}x${HEAT_H}, rows top to bottom like uv
uniform vec4 uPrints[3];   // fingerprints: centre uv, turn, heat

// A cubic B-spline through four bilinear taps, so the isotherms come out round, not gridded.
float heatAt(vec2 uv) {
  vec2 res = vec2(${HEAT_W}.0, ${HEAT_H}.0);
  vec2 st = uv * res - 0.5;
  vec2 i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / res;
  vec2 h1 = (i + 1.5 + w3 / g1) / res;
  return g0.y * (g0.x * texture(uHeat, h0).r + g1.x * texture(uHeat, vec2(h1.x, h0.y)).r)
       + g1.y * (g0.x * texture(uHeat, vec2(h0.x, h1.y)).r + g1.x * texture(uHeat, h1).r);
}

// Warmth left by fingertips: an oval pad whose ridges run warmer than the furrows between them.
// The ridges also leave a faint gloss, which shows even where the ink is already clear.
float printHeat(vec2 uv, out float gloss) {
  float sum = 0.0;
  gloss = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 P = uPrints[i];
    if (P.w <= 0.0) continue;
    vec2 d = (uv - P.xy) * vec2(1.0, 1.4);
    float c = cos(P.z), s = sin(P.z);
    vec2 q = mat2(c, -s, s, c) * d / vec2(0.085, 0.115);
    // The pad presses unevenly: firm in the middle, its edge ragged.
    float seed = float(i) * 7.3 + P.x * 13.0;
    float pad = 1.0 - smoothstep(0.35, 1.0, length(q) + (vnoise(q * 2.5 + seed) - 0.5) * 0.35);
    if (pad <= 0.0) continue;
    // A loop: ridges ring a core set a little low and open out into arcs towards the tip,
    // wandering like real skin, and here and there a ridge breaks off or forks.
    vec2 k = q - vec2(0.03, 0.18);
    k.x *= 1.0 + 0.35 * smoothstep(0.0, -0.8, k.y);
    k += (vec2(vnoise(q * 1.2 + seed), vnoise(q * 1.2 + seed + 3.7)) - 0.5) * 0.16;
    float ph = length(k * vec2(1.0, 0.8)) * 8.0 + (vnoise(q * 4.0 + seed) - 0.5) * 0.6;
    // Ridges finer than a couple of pixels would only shimmer; a small card shows the pad alone.
    float aa = 1.0 - smoothstep(0.25, 0.55, fwidth(ph));
    float broken = smoothstep(0.22, 0.4, vnoise(q * 7.0 + seed * 1.7));
    float ridge = cos(ph * 6.2831853) * aa * broken;
    sum += P.w * pad * (0.2 + 0.17 * ridge);
    gloss += P.w * pad * max(ridge, 0.0);
  }
  return sum;
}

// Liquid crystal's own colours, coolest to warmest: garnet, copper, gold, jade, sapphire, violet.
vec3 crystalRamp(float s) {
  float x = clamp(s, 0.0, 1.0) * 5.0;
  vec3 col = mix(vec3(0.42, 0.03, 0.1), vec3(0.88, 0.34, 0.1), clamp(x, 0.0, 1.0));
  col = mix(col, vec3(0.98, 0.8, 0.3), clamp(x - 1.0, 0.0, 1.0));
  col = mix(col, vec3(0.12, 0.74, 0.55), clamp(x - 2.0, 0.0, 1.0));
  col = mix(col, vec3(0.14, 0.42, 0.95), clamp(x - 3.0, 0.0, 1.0));
  return mix(col, vec3(0.56, 0.3, 0.95), clamp(x - 4.0, 0.0, 1.0));
}

vec3 warmth(vec3 c, vec2 uv, vec2 t, float L, float art) {
  // Heat lives on the card itself; the tuned pattern space only moves the ink's texture.
  vec2 cuv = tuneFaceUv(uv);
  float gloss;
  float T = heatAt(cuv) + printHeat(cuv, gloss);
  // Ink never takes heat quite evenly (two octaves are plenty, and cheap on phones).
  vec2 mp = uv * 3.2 + vec2(uTime * 0.03, -uTime * 0.02);
  float mott = vnoise(mp) * 0.65 + vnoise(mp * 2.03 + 17.1) * 0.35;
  T += (mott - 0.5) * 0.08;

  // Cold: leuco ink over the art, a midnight two-tone that keeps every shape of the picture
  // and a breath of its colour.
  float l = smoothstep(0.0, 1.0, L);
  vec3 ink = mix(vec3(0.035, 0.04, 0.08), vec3(0.18, 0.17, 0.33), smoothstep(0.0, 0.55, l));
  ink = mix(ink, vec3(0.64, 0.67, 0.81), smoothstep(0.5, 1.0, l));
  ink += (c - L) * 0.24;
  // Satin lacquer: one broad sheen that slides with the tilt, over a fine pigment grain.
  float grain = hash12(floor(uv * vec2(240.0, 336.0)));
  float sweep = dot(uv - 0.5, vec2(0.6, 0.8)) * 3.6 - (t.x + t.y) * 1.4;
  float sheen = smoothstep(0.5, 1.0, 0.5 + 0.5 * sin(sweep));
  ink += vec3(0.85, 0.9, 1.0) * sheen * 0.08 + (grain - 0.5) * 0.03;
  // Even cold, the crystal glints at a grazing angle: a dark jewel tone drifting in the shadows.
  float glint = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(sweep * 0.7 + 1.9)) * (1.0 - l);
  ink += crystalRamp(0.55 + 0.3 * sin(sweep * 0.35 + mott * 2.0)) * glint * 0.09;

  // Warming: liquid crystal runs through its colours as the heat rises, slipping a little with the
  // viewing angle. It is a thin film, not a light: it tints the picture's own light and shade,
  // and stays dim while the ink is only just warm.
  float s = (T - 0.1) / 0.17 + dot(t, vec2(0.05, 0.04));
  float on = smoothstep(0.07, 0.15, T);
  vec3 lc = crystalRamp(s);
  vec3 tint = mix(vec3(luma(lc)), lc, 0.75) * (0.6 + 0.4 * smoothstep(0.0, 0.5, s));
  vec3 film = mix(ink, (0.3 + 0.75 * l) * tint * 1.1 + ink * 0.12, on);
  // Warmer still, the ink turns clear and the art shows exactly as it is.
  float clear = smoothstep(0.26, 0.38, T);
  vec3 col = mix(film, c, clear);
  col += vec3(0.9, 0.95, 1.0) * gloss * (0.05 + 0.07 * sheen) * art;
  // The frame keeps its own colours; warmth only tints it.
  vec3 frame = c + lc * on * (1.0 - clear) * 0.15;
  return mix(frame, col, art);
}
`;
