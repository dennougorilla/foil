// Shallows: the card lies at the bottom of a clear, shallow pool. Spliced into CARD_FS after
// COMMON and TUNE_GLSL, so hash/luma/face and the tune uniforms are in scope.
//
// The water surface is a sum of travelling waves whose slope and curvature are known in closed
// form. Light refracted by that surface lands on the card bent by depth x slope, and the light
// gathered at a point is 1 / |det J| of that bending (J = I + depth x curvature): where the
// surface folds the light, the floor lights up in sharp lines. Red, green and blue bend by
// slightly different amounts, so the lines fray into spectrum at their edges.

/** Phones and low-core machines share one refocusing step across the three colours and read the mask less. */
const lite =
  typeof navigator !== 'undefined' &&
  ((navigator.hardwareConcurrency || 8) <= 4 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));

export const SHALLOWS_GLSL = /* glsl */ `
const bool SH_LITE = ${lite};
const int SH_WAVES = 7;

// Slope (dh/dx, dh/dy) and curvature (xx, yy, xy) of the surface at p. \`sway\` (the tilt)
// nudges each wave by its own amount, so tilting reshapes the net instead of sliding it whole.
void shSurface(vec2 p, float time, vec2 sway, out vec2 slope, out vec3 curv) {
  slope = vec2(0.0);
  curv = vec3(0.0);
  float k = 18.0;
  for (int i = 0; i < SH_WAVES; i++) {
    float fi = float(i);
    // Directions spread by the golden angle, so no two waves line up into a grid.
    float a = fi * 2.39996 + 0.4;
    vec2 d = vec2(cos(a), sin(a));
    // Deep-water dispersion: long waves travel faster than short ones.
    float ph = dot(d, p) * k - time * sqrt(k) * 0.9 + fi * 1.7 + dot(d, sway) * sin(fi * 2.1 + 0.5) * 1.3;
    float amp = 1.0 / (k * k);
    float s = sin(ph), c = cos(ph);
    slope += d * (amp * k * c);
    curv -= vec3(d.x * d.x, d.y * d.y, d.x * d.y) * (amp * k * k * s);
    k *= 1.19;
  }
}

// Light gathered on the floor under p, for a depth that sets how hard the surface focuses.
float shGather(vec3 curv, float depth) {
  float det = (1.0 + depth * curv.x) * (1.0 + depth * curv.y) - depth * depth * curv.z * curv.z;
  return 1.0 / sqrt(det * det + 0.002);
}

/** \`art\` is 1 in the art window: the water lies over the picture, the frame only catches its light. */
vec3 shallows(vec3 c, vec2 uv, vec2 t, float L, float lod, float art) {
  vec2 p = (uv - 0.5) * vec2(1.0, 1.4);
  float time = uTime * 0.55;
  // Tilting slants the sun: the net slides across the floor, draws into focus and, as the
  // light comes in lower, splits wider into spectrum.
  float slant = min(dot(t, t), 2.0);
  float depth = 0.5 + 0.12 * slant;
  float spread = 0.03 + 0.03 * slant;
  vec2 drift = t * 0.05;
  vec2 slope; vec3 curv;
  shSurface(p + drift, time, t, slope, curv);
  // Seen from above, the picture wavers with the same surface that bends the light; the
  // wavering fades out towards the frame, so the window's outline stays a clean line.
  vec2 ruv = tuneFaceUv(uv);
  vec2 e = vec2(0.014, 0.0);
  float inner = texture(uMask, ruv + e.xx).r * texture(uMask, ruv - e.xx).r;
  if (!SH_LITE) inner *= texture(uMask, ruv + e.xy).r * texture(uMask, ruv - e.yx).r;
  vec4 fl = face(uv - slope * vec2(1.0, 1.0 / 1.4) * 0.08 * art * inner, lod);
  // Near the rounded corners the bent ray can miss the card; keep the straight view there.
  vec3 floorC = fl.a > 0.5 ? fl.rgb / fl.a : c;
  // Per-colour focus: blue bends most, red least.
  vec3 dpt = depth * (1.0 + vec3(-spread, 0.0, spread));
  vec3 gather;
  vec2 sl2; vec3 cv;
  if (SH_LITE) {
    // One step back shared by all three colours.
    shSurface(p + drift - slope * depth, time, t, sl2, cv);
    gather = vec3(shGather(cv, dpt.r), shGather(cv, dpt.g), shGather(cv, dpt.b));
  } else {
    for (int ch = 0; ch < 3; ch++) {
      // Step back along the bent ray once, so the lines sit where the light actually lands.
      shSurface(p + drift - slope * dpt[ch], time, t, sl2, cv);
      gather[ch] = shGather(cv, dpt[ch]);
    }
  }
  // The picture sits sunk below the frame like a pool below its deck, so the rim on the
  // sun's side throws a band of shade across the water; it slides as the light moves.
  vec2 rim = (uLight - 0.5) * vec2(0.1, 0.1 / 1.4);
  float sunlit = texture(uMask, ruv + rim).r;
  if (!SH_LITE) sunlit = (sunlit + texture(uMask, ruv + rim * 0.7).r + texture(uMask, ruv + rim * 1.3).r) / 3.0;
  sunlit = mix(1.0, sunlit, art);
  // Keep the split to fringes: where one colour runs far ahead of the others (near the cusps)
  // it would pool into a blot of pure hue.
  float mean = (gather.r + gather.g + gather.b) / 3.0;
  gather = mean * clamp(gather / mean, 0.75, 1.35);
  // Light is moved, not added: the cells between the lines sink, the lines rise. Only the
  // narrow peaks count as lines, so a bright floor keeps fine lines instead of pale clouds.
  vec3 body = mix(vec3(1.0), min(gather, 1.6), sunlit);
  vec3 line = smoothstep(1.7, 6.0, gather) * sunlit;
  float dark = 1.0 - L;
  vec3 water = floorC * (0.6 + 0.32 * body + 0.6 * line) * mix(vec3(0.7, 0.78, 0.86), vec3(1.0), sunlit);
  // Sunlight caught in the water: a soft glow along the net and a hairline core on each line,
  // so the net reads on dark floors too.
  vec3 glow = max(min(gather, 3.0) - 1.0, 0.0);
  vec3 core = smoothstep(2.6, 10.0, gather);
  water += (glow * 0.07 * dark + core * (0.12 + 0.5 * dark * dark)) * uTLight * vec3(0.9, 1.0, 1.06) * sunlit;
  // A cool, faint water column over the picture.
  water = mix(water, water * vec3(0.88, 0.97, 1.03) + vec3(0.0, 0.01, 0.022), 0.6);
  // Bright pictures roll off into the light instead of clipping into flat white.
  water = mix(water, 0.72 + 0.3 * (1.0 - exp((0.72 - water) / 0.3)), step(0.72, water));
  // The frame stays dry paper; only the dappled light falls on it.
  vec3 dry = c * (0.84 + 0.1 * body) + core * 0.12 * uTLight;
  vec3 col = mix(dry, water, art);
  // Sun glitter: tiny facets on the ripples flash where they turn between sun and eye.
  vec2 cell = floor(uv * vec2(110.0, 154.0));
  vec2 jit = (hash22(cell + 3.7) - 0.5) * 0.7;
  vec3 n = normalize(vec3(-slope * 3.0 + jit * 0.35, 1.0));
  vec3 sun = normalize(vec3((tunePattern(uLight) - uv) * vec2(1.0, 1.4) * 1.4, 1.0));
  vec3 hv = normalize(sun + vec3(0.0, 0.0, 1.0));
  vec2 f = fract(uv * vec2(110.0, 154.0)) - 0.5 - jit * 0.3;
  float pt = smoothstep(0.22, 0.0, length(f)) + 0.5 * smoothstep(0.06, 0.0, min(abs(f.x), abs(f.y))) * smoothstep(0.45, 0.0, length(f));
  float glint = pow(max(dot(n, hv), 0.0), 700.0) * step(0.55, hash12(cell));
  col += uTLight * glint * pt * 1.8 * art;
  return col;
}
`;
