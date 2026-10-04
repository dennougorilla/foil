// The Warmth finish: thermochromic ink over the art. Spliced into CARD_FS after the shared helpers
// and the tune, so hash/fbm/hsv2rgb, tuneFaceUv, uTime and uLight are in scope.
export const TOUCH_GLSL = /* glsl */ `
uniform sampler2D uHeat;   // heat over the card, square cells, rows top to bottom like uv
uniform vec4 uPrints[3];   // fingerprints: centre uv, turn, heat

// A cubic B-spline through four bilinear taps, so the isotherms come out round, not gridded.
float heatAt(vec2 uv) {
  vec2 res = vec2(textureSize(uHeat, 0));
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
    vec2 d = (uv - P.xy) * uCardK;
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

// The ink's flush as it warms, like real colour-change ink: rose, then coral, then a pale peach just before it clears.
vec3 flush(float s) {
  float x = clamp(s, 0.0, 1.0) * 2.0;
  vec3 col = mix(vec3(0.9, 0.36, 0.54), vec3(1.0, 0.5, 0.42), clamp(x, 0.0, 1.0));
  return mix(col, vec3(1.0, 0.76, 0.66), clamp(x - 1.0, 0.0, 1.0));
}

// The tune's hue and saturation move the ink's own colour; the picture it reveals stays as it is.
vec3 tuneInk(vec3 x) { return tuneColor(x, vec3(luma(x))); }

vec3 warmth(vec3 c, vec2 uv, vec2 t, float L, float art) {
  // Heat lives on the card itself; the tuned pattern space only moves the ink's texture.
  vec2 cuv = tuneFaceUv(uv);
  float gloss;
  float T = heatAt(cuv) + printHeat(cuv, gloss);
  // Ink never takes heat quite evenly (two octaves are plenty, and cheap on phones).
  vec2 mp = uv * 3.2 + vec2(uTime * 0.03, -uTime * 0.02);
  float mott = vnoise(mp) * 0.65 + vnoise(mp * 2.03 + 17.1) * 0.35;
  T += (mott - 0.5) * 0.08;

  // Cold: the art printed as a cyanotype in colour-change ink, Prussian blue on a warm paper white.
  // Shadows are opened a little and highlights held back, so dark and bright pictures both keep their detail.
  float l = smoothstep(0.0, 1.0, L);
  vec3 ink = mix(vec3(0.04, 0.09, 0.21), vec3(0.14, 0.34, 0.62), smoothstep(0.0, 0.55, pow(l, 0.8)));
  ink = mix(ink, vec3(0.95, 0.94, 0.89), smoothstep(0.55, 1.05, l));
  ink += (c - L) * 0.06;
  // Paper and lacquer: a fine fibre grain, and one broad satin sheen that slides with the tilt.
  float grain = hash12(floor(uv * uCardK * 240.0));
  float sheen = smoothstep(0.5, 1.0, 0.5 + 0.5 * sin(dot(uv - 0.5, vec2(0.6, 0.8)) * 3.6 - (t.x + t.y) * 1.4));
  ink += vec3(0.9, 0.95, 1.0) * sheen * 0.09 + (grain - 0.5) * 0.025;
  // The tune's hue and saturation recolour the cold ink; the warmth below always stays warm.
  ink = tuneInk(ink);

  // Warming, the print itself changes colour, as colour-change ink does: the blue gives way to rose,
  // coral, then peach, each at the print's own lightness, so it reads as the print turning colour,
  // never as a glowing line or a dark stain. The hue slips a little with the viewing angle.
  float s = (T - 0.06) / 0.34 + dot(t, vec2(0.04, 0.03));
  float on = smoothstep(0.04, 0.16, T);
  vec3 tone = flush(s);
  float li = luma(ink);
  vec3 warmInk = min(mix(vec3(li), li * tone / luma(tone), 0.8), vec3(1.0));
  vec3 film = mix(ink, warmInk, on);
  // Warmer still, the ink turns clear and the art shows exactly as it is.
  float clear = smoothstep(0.34, 0.56, T);
  vec3 col = mix(film, c, clear);
  col += vec3(0.9, 0.95, 1.0) * gloss * (0.05 + 0.07 * sheen) * art;
  // The frame keeps its own colours; warmth only blushes it.
  vec3 frame = c + (tone - 0.5) * on * (1.0 - clear) * 0.12;
  return mix(frame, col, art);
}
`;
