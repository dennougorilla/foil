// Shallows: the card's picture lies at the bottom of a clear, shallow pool sunk into the frame.
// Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/luma/face and the tune uniforms are
// in scope.
//
// The water surface is a sum of travelling waves whose slope and curvature are known in closed
// form. Light refracted by that surface lands on the card bent by depth x slope, and the light
// gathered at a point is 1 / |det J| of that bending (J = I + depth x curvature): where the
// surface folds the light, the floor lights up in sharp lines. Red, green and blue bend by
// slightly different amounts, which shows as spectrum where the light gathers hardest.
import { ART, FACE_H, FACE_W } from '../card/face';

/** Phones and low-core machines share one refocusing step across the three colours. */
const lite =
  typeof navigator !== 'undefined' &&
  ((navigator.hardwareConcurrency || 8) <= 4 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));

const f = (v: number) => v.toFixed(2);

export const SHALLOWS_GLSL = /* glsl */ `
const bool SH_LITE = ${lite};
const int SH_WAVES = 7;
// The art window in face pixels (card/face.ts); its corner matches the drawn window.
const vec2 SH_FACE = vec2(${f(FACE_W)}, ${f(FACE_H)});
const vec2 SH_ART_C = vec2(${f(ART.x + ART.w / 2)}, ${f(ART.y + ART.h / 2)});
const vec2 SH_ART_H = vec2(${f(ART.w / 2)}, ${f(ART.h / 2)});
const float SH_ART_R = ${f(FACE_W * 0.075 * 0.45)};

// Signed distance to the art window's edge in card widths, negative inside. ruv is face uv.
float shWindow(vec2 ruv) {
  vec2 q = abs(ruv * SH_FACE - SH_ART_C) - SH_ART_H + SH_ART_R;
  return (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - SH_ART_R) / SH_FACE.x;
}

// Slope (dh/dx, dh/dy) and curvature (xx, yy, xy) of the surface at p. \`sway\` (the tilt)
// nudges each wave by its own amount, so tilting reshapes the net instead of sliding it whole.
void shSurface(vec2 p, vec2 sway, out vec2 slope, out vec3 curv) {
  slope = vec2(0.0);
  curv = vec3(0.0);
  float k = 24.0;
  for (int i = 0; i < SH_WAVES; i++) {
    float fi = float(i);
    // Directions spread by the golden angle, so no two waves line up into a grid.
    float a = fi * 2.39996 + 0.4;
    vec2 d = vec2(cos(a), sin(a));
    // Deep-water dispersion: long waves travel faster than short ones. An exported loop rounds
    // each wave to whole cycles, so the last frame flows back into the first.
    float w = 0.5 * sqrt(k);
    if (uLoop > 0.0) w = max(1.0, floor(w * uLoop / 6.2831853 + 0.5)) * 6.2831853 / uLoop;
    float ph = dot(d, p) * k - uTime * w + fi * 1.7 + dot(d, sway) * sin(fi * 2.1 + 0.5) * 1.3;
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
  vec2 ruv = tuneFaceUv(uv);
  // The pool floor sits below the frame, so tilting slides it against the rim (parallax): on one
  // side the floor slips under the frame, on the other the window's wall comes into view.
  vec2 par = -t * 0.012 * vec2(1.0, 1.0 / 1.4) * art;
  float wallSeen = smoothstep(-0.005, 0.001, shWindow(ruv + par)) * art;
  vec2 p = (uv - 0.5) * vec2(1.0, 1.4) + par * vec2(1.0, 1.4);
  // The subject stays calm: the net goes soft and faint over skin, and somewhat over lit
  // tones near the middle of the picture (where a subject usually sits, coloured or not).
  vec4 bl = face(uv, lod + 5.0);
  vec3 b = bl.rgb / max(bl.a, 1e-4);
  float rg = b.r - b.g, gb = b.g - b.b;
  float skin = smoothstep(0.02, 0.08, rg) * (1.0 - smoothstep(0.25, 0.4, rg)) * smoothstep(0.0, 0.04, gb)
             * (1.0 - smoothstep(0.22, 0.35, gb)) * smoothstep(0.18, 0.32, luma(b));
  float centre = 1.0 - smoothstep(0.22, 0.5, length((ruv - vec2(0.5, 0.4)) * vec2(1.0, 1.4)));
  float calm = max(smoothstep(0.0, 0.45, skin), centre * (0.55 + 0.35 * smoothstep(0.15, 0.45, luma(b)))) * art;
  // Tilting slants the sun: the net reshapes, draws into focus and its knots split into spectrum.
  // The floor's depth varies across the pool, so some of the net is sharp and some is soft.
  float slant = min(dot(t, t), 2.0);
  float floorDepth = 0.7 + 0.6 * vnoise(p * 1.7 + 7.0);
  float depth = (0.54 + 0.12 * slant) * floorDepth * (1.0 - 0.5 * calm);
  float spread = 0.03 + 0.08 * slant;
  vec2 drift = t * 0.05;
  vec2 slope; vec3 curv;
  shSurface(p + drift, t, slope, curv);
  // The window's walls: distance in from the edge, in card widths.
  float sd = shWindow(ruv);
  float inside = -sd;
  // Seen from above, the floor wavers with the same surface that bends the light; the
  // wavering fades out at the walls, so the window's outline stays a clean line.
  vec2 bend = slope * vec2(1.0, 1.0 / 1.4) * 0.15 * art * smoothstep(0.004, 0.02, inside);
  vec4 fl = textureLod(uFace, ruv + par - bend, lod);
  // Near the rounded corners the bent ray can miss the card; keep the straight view there.
  vec3 floorC = fl.a > 0.5 ? fl.rgb / fl.a : c;
  // Per-colour focus: blue bends most, red least.
  vec3 dpt = depth * (1.0 + vec3(-spread, 0.0, spread));
  vec3 gather;
  vec2 sl2; vec3 cv;
  if (SH_LITE) {
    // One step back shared by all three colours.
    shSurface(p + drift - slope * depth, t, sl2, cv);
    gather = vec3(shGather(cv, dpt.r), shGather(cv, dpt.g), shGather(cv, dpt.b));
  } else {
    for (int ch = 0; ch < 3; ch++) {
      // Step back along the bent ray once, so the lines sit where the light actually lands.
      shSurface(p + drift - slope * dpt[ch], t, sl2, cv);
      gather[ch] = shGather(cv, dpt[ch]);
    }
  }
  // Spectrum only in the knots where the light gathers hardest, and only once the card is
  // tilted. It is a tint of the light itself, so it never shifts the picture's own edges.
  float mean = (gather.r + gather.g + gather.b) / 3.0;
  float prism = smoothstep(3.5, 10.0, mean) * smoothstep(0.5, 1.3, slant) * (1.0 - calm);
  vec3 spectrum = clamp(gather / mean - 1.0, -0.6, 0.8) * prism;
  // The sun, as a direction on the card (towards the light), leaning in from the upper left.
  vec2 sun = (uLight - 0.5) * vec2(1.0, 1.4) + vec2(-0.14, -0.2);
  vec2 sunN = normalize(sun);
  // The rim on the sun's side shades a band of the floor, wider the lower the light. The shade
  // is cast through the water, so its edge is bent by the same ripples (it wavers and drifts
  // with the net) and grows softer the further it falls from the rim, as a real penumbra does.
  vec2 reach = sun * 0.22;
  vec2 shadeAt = ruv + par + reach / vec2(1.0, 1.4) + slope * vec2(1.0, 1.0 / 1.4) * 1.3;
  float rimDist = shWindow(shadeAt);
  float soft = 0.012 + 0.03 * smoothstep(0.0, 0.06, inside);
  float shade = smoothstep(-soft, soft, rimDist) * art;
  float sunlit = 1.0 - shade;
  float wall = (1.0 - smoothstep(0.0, 0.03, inside)) * art;
  // The net, on a log scale so it reads as one continuous web: a soft bloom and a bright core.
  // The light multiplies the floor, so it lights the picture rather than lying over it; the
  // water as a whole only takes a little light, so there are no dark rims along the lines.
  // Out of the sun the net all but goes; only a faint trace of skylight caustics stays.
  float keep = (1.0 - 0.95 * calm) * mix(0.12, 1.0, sunlit);
  float lg = log2(max(mean, 1e-3));
  float line = smoothstep(0.3, 1.9, lg) * keep;
  float core = smoothstep(1.5, 3.0, lg) * keep;
  vec3 warm = uTLight * vec3(1.0, 0.96, 0.86);
  float gain = (0.9 * line + 1.1 * core) * (1.0 - 0.65 * smoothstep(0.55, 0.95, L));
  vec3 water = floorC * (0.9 - 0.06 * sunlit + gain * (vec3(1.0) + spectrum));
  // A little light also scatters in the water, so the net still shows over near-black floors.
  water += warm * (0.045 * line + 0.16 * core) * (1.0 - L) * (1.0 - L) + warm * spectrum * core * 0.25;
  // Shade under clear water: darker and a touch cooler, never a flat grey slab.
  water *= mix(vec3(0.58, 0.63, 0.7), vec3(1.0), sunlit) * (1.0 - 0.2 * wall);
  // The wall facing the sun catches it: a thin lit lip along the far edge of the pool.
  vec2 nrm = normalize(vec2(shWindow(ruv + vec2(0.002, 0.0)) - sd, (shWindow(ruv + vec2(0.0, 0.002)) - sd) / 1.4) + 1e-6);
  float lip = (1.0 - smoothstep(0.004, 0.016, inside)) * smoothstep(0.0, 0.5, dot(nrm, sunN)) * art;
  water += warm * lip * 1.3;
  // A faint aqua water column over the floor.
  water = mix(water, water * vec3(0.9, 0.98, 1.02) + vec3(0.0, 0.008, 0.016), 0.4);
  // Bright floors roll off into the light instead of clipping into flat white.
  water = mix(water, 0.72 + 0.3 * (1.0 - exp((0.72 - water) / 0.3)), step(0.72, water));
  // Where the floor has slid away, the window's own wall shows: dark, lit a touch at its top.
  water = mix(water, floorC * vec3(0.4, 0.45, 0.52) + warm * 0.06 * sunlit, wallSeen * 0.85);
  // The frame stays dry paper under a broad, warm dapple of light, faint behind the name.
  // It moves only with the waves and the tilt, so it loops with them.
  vec2 q = p * 2.4 + slope * 2.5 + t * 0.15;
  float dapple = smoothstep(0.3, 0.75, 0.65 * vnoise(q) + 0.35 * vnoise(q * 2.1 + 5.0));
  dapple *= 1.0 - 0.75 * smoothstep(0.865, 0.885, ruv.y);
  vec3 dry = c * mix(vec3(0.84, 0.85, 0.88), vec3(1.1, 1.02, 0.84), dapple);
  vec3 col = mix(dry, water, art);
  // Sun glitter: short streaks pointing at the sun, riding the bright net and flashing as the
  // ripples turn between sun and eye.
  vec2 g = p * 40.0;
  vec2 cell = floor(g);
  vec2 jit = hash22(cell + 3.7) - 0.5;
  vec2 o = fract(g) - 0.5 - jit * 0.25;
  float streak = smoothstep(0.45, 0.0, abs(dot(o, sunN))) * smoothstep(0.07, 0.0, abs(dot(o, vec2(-sunN.y, sunN.x))));
  streak = max(streak, smoothstep(0.12, 0.0, length(o)));
  vec3 n = normalize(vec3(-slope * 3.0 + jit * 0.25, 1.0));
  vec3 hv = normalize(normalize(vec3(sun * 1.2, 1.0)) + vec3(0.0, 0.0, 1.0));
  float glint = pow(max(dot(n, hv), 0.0), 200.0) * step(0.3, hash12(cell)) * smoothstep(1.2, 3.0, mean);
  col += warm * glint * streak * 2.6 * keep * (1.0 - wallSeen) * art;
  return col;
}
`;
