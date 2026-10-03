// Card shader additions for the fine-tuning controls. Included after COMMON in CARD_FS.
// Every function is an identity at the default values, so an untouched tune draws exactly
// what the finishes drew before.

export const TUNE_GLSL = /* glsl */ `
uniform float uTScale;       // pattern zoom
uniform float uTAngle;       // pattern rotation, radians
uniform float uTHue;         // hue shift of the finish, turns
uniform float uTSat;         // saturation of the finish
uniform float uTGlare;       // glare strength
uniform float uTSharp;       // glare tightness
uniform vec3 uTLight;        // light colour
uniform float uTSparkle;     // glitter density 0..1
uniform float uTSparkleSize; // glitter fleck size

// True while a finish runs on pattern coordinates; face() then maps back to the art.
bool tPattern = false;
const vec2 T_ASPECT = vec2(1.0, 1.4);

vec2 tunePattern(vec2 uv) {
  float c = cos(uTAngle), s = sin(uTAngle);
  vec2 p = mat2(c, -s, s, c) * ((uv - 0.5) * T_ASPECT) / uTScale;
  return p / T_ASPECT + 0.5;
}

vec2 tuneUnpattern(vec2 pv) {
  float c = cos(uTAngle), s = sin(uTAngle);
  vec2 p = mat2(c, s, -s, c) * ((pv - 0.5) * T_ASPECT) * uTScale;
  return p / T_ASPECT + 0.5;
}

vec2 tuneFaceUv(vec2 uv) { return tPattern ? tuneUnpattern(uv) : uv; }

/**
 * Hue and saturation of what the finish adds on top of the art (col - c), so the art keeps
 * its own colours while the rainbow, metal or glow shifts. Both are linear, so they behave
 * for values above 1 and on negative differences alike.
 */
vec3 tuneColor(vec3 col, vec3 c) {
  vec3 d = col - c;
  if (uTHue != 0.0) {
    // Rotate around the grey axis (Rodrigues).
    const vec3 k = vec3(0.57735);
    float a = uTHue * 6.2831853, ca = cos(a);
    d = d * ca + cross(k, d) * sin(a) + k * dot(k, d) * (1.0 - ca);
  }
  return c + mix(vec3(luma(d)), d, uTSat);
}

/** Glare hotspot: reach and power describe the finish's own falloff at sharpness 1. */
float tuneGlare(float d, float reach, float power, float amount) {
  float k = uTSharp;
  return pow(max(1.0 - d * reach * pow(k, 0.6), 0.0), power * k) * amount * uTGlare * pow(k, 0.35);
}

/** Pixel glitter: square flecks with a little cross, each catching the light at its own angle. */
vec3 tuneGlitter(vec2 uv, vec2 t) {
  if (uTSparkle <= 0.0) return vec3(0.0);
  float n = 64.0 / uTSparkleSize;
  vec2 g = uv * vec2(n, n * 1.4);
  vec2 cell = floor(g);
  float h = hash12(cell + 71.3);
  if (h > uTSparkle * 0.45) return vec3(0.0);
  vec2 f = fract(g) - 0.5 - (hash22(cell + 5.1) - 0.5) * 0.4;
  float core = step(max(abs(f.x), abs(f.y)), 0.13);
  float cross = step(abs(f.x), 0.06) * step(abs(f.y), 0.34) + step(abs(f.y), 0.06) * step(abs(f.x), 0.34);
  float phase = hash12(cell + 19.7) * 6.2831;
  float tw = pow(0.5 + 0.5 * sin(phase + dot(t, vec2(5.0, -4.0)) + uTime * 1.6), 5.0);
  return uTLight * min(core + cross * 0.55, 1.0) * tw * 1.25;
}
`;
