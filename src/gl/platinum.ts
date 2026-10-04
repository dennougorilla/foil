// Platinum: the card printed on cold white metal with a hairline (brushed) finish.
// Spliced into CARD_FS after COMMON and TUNE_GLSL, so vnoise/hash/luma and tunePattern are in scope.
//
// The grooves run along the pattern's x. A groove spreads light across itself only, so the
// metal reflects anisotropically: a light shows as one hard streak across the lines, right
// under the light, and tilting slides it along them. Each line catches it over its own length
// and sits a little off its neighbours, so the streak breaks into single glinting lines.
// Nothing reads the shader clock: it moves only with the tilt and the light, so it holds still
// when motion is reduced and every export loop closes by itself.

export const PLATINUM_GLSL = /* glsl */ `
// Rows per card height, from fine to coarse, and how often a row breaks along its length.
const vec3 PL_ROWS = vec3(1100.0, 400.0, 130.0);
const vec3 PL_RUNS = vec3(6.0, 3.2, 1.4);

// Hairline relief (about -1..1), the wobble that shifts a line's piece of the streak, and how
// far along itself the line catches it (steeper lines spread the light wider).
// Rows finer than a pixel fade to their mean, so the lines never shimmer or moire.
float plLines(vec2 uv, out float wobble, out float reach, out float flash) {
  uv = asTrading(uv);
  float px = fwidth(uv.y);
  // Rows wander a little, so the lines are unevenly spaced and never line up into a grid.
  uv.y += (vnoise(vec2(uv.x * 0.8, uv.y * 37.0)) - 0.5) * 0.006;
  float v = 0.0;
  wobble = 0.0;
  reach = 1.0;
  for (int i = 0; i < 3; i++) {
    float aa = 1.0 - smoothstep(0.18, 0.42, PL_ROWS[i] * px);
    float n = vnoise(vec2(uv.x * PL_RUNS[i] + float(i) * 7.31, uv.y * PL_ROWS[i])) * 2.0 - 1.0;
    v += n * aa * (i == 0 ? 0.6 : i == 1 ? 0.3 : 0.12);
    wobble += n * aa * (i == 2 ? 0.4 : 0.6);
    if (i == 1) reach = mix(1.0, 0.45 + 1.4 * vnoise(vec2(uv.x * 2.0 + 3.1, uv.y * PL_ROWS[i] + 0.5)), aa);
  }
  // A few deeper lines, coarse enough to see at a glance: they flash on their own in the streak.
  float aaF = 1.0 - smoothstep(0.2, 0.45, 210.0 * px);
  flash = smoothstep(0.55, 1.0, vnoise(vec2(uv.x * (2.5 + 3.0 * hash12(vec2(floor(uv.y * 210.0), 9.1))) + 1.7, uv.y * 210.0))) * 2.2 * aaF;
  return v;
}

/** \`art\` is 1 in the art window: the art is ink printed on the metal, the frame is plated. */
vec3 platinum(vec3 c, vec2 uv, vec2 t, float L, float art) {
  float wobble, reach, flash;
  float hl = plLines(uv, wobble, reach, flash);
  // The light in the same (pattern) coordinates as the lines.
  vec2 lp = tunePattern(uLight);
  // The streak: a soft envelope under the light, filled with single lines that each catch it
  // over their own length, so it reads as a bundle of bright hairlines, not one smooth beam.
  float s = ((uv.x - lp.x) * uCardK.x + wobble * 0.012) / reach;
  float dy = (uv.y - lp.y) * uCardK.y;
  float along = 0.08 + 0.92 * exp(-dy * dy * 3.5);
  float core = exp(-s * s / 0.0006);
  float shoulder = exp(-s * s / 0.02);
  // Only some lines catch it hard (the brightest of the fine ones), at uneven spacing.
  float catchy = 0.25 + 2.2 * pow(clamp(0.5 + 0.5 * hl, 0.0, 1.0), 3.0);
  float halo = exp(-s * s / 0.12);
  float streak = (core * (1.1 * catchy + flash) + shoulder * (0.3 * (0.6 + 0.4 * catchy) + 0.25 * flash)) * along + halo * 0.16 * (0.5 + 0.5 * along);
  // The room in the metal: two broad upright strips of light (blurred down the grooves) that
  // slide faster than the streak, and a sky that is brighter towards the top.
  float r = uv.x * 0.9 + t.x * 0.42;
  float room = exp(-pow((r - 0.12) / 0.11, 2.0)) * 0.7 + exp(-pow((r - 0.95) / 0.16, 2.0)) * 0.45;
  float body = 0.22 + 0.36 * room + 0.16 * (1.0 - uv.y) - 0.06 * t.y;
  body *= 1.0 + 0.2 * hl;
  // Cool grey in the shade, near white where lit: platinum, not chrome blue and never gold.
  vec3 metal = mix(vec3(0.2, 0.215, 0.24), vec3(0.97, 0.98, 1.0), clamp(body, 0.0, 1.0));
  // Ink on metal: light parts of the picture let the metal through, dark ones cover it, and a
  // faint cold sheen of the room lies over all of it.
  vec3 ink = mix(vec3(L), c, mix(0.12, 0.72, art));
  float bare = smoothstep(0.45, 0.95, L) * 0.55;
  vec3 printed = mix(ink * (0.6 + 0.75 * body) * vec3(0.95, 0.98, 1.03), metal, bare);
  printed += metal * (0.03 + 0.08 * room) * (1.0 + 0.5 * hl + 0.5 * flash);
  // The frame is plated: the metal keeps the frame's lightness, so its paper turns to bright
  // metal while the name, light or dark, stays apart from it on every frame colour.
  vec3 plated = metal * pow(ink, vec3(1.4)) * 1.15 + metal * 0.09 * (1.0 + 1.5 * hl);
  vec3 col = mix(plated, printed, art);
  col *= 1.0 + 0.24 * hl * mix(1.0, 0.2 + 0.8 * L, art);
  // The streak is the metal's own light: near white, only lightly tinted by the ink over it.
  // Dark ink on the frame (the name) is matte and doesn't catch it.
  float shine = mix(smoothstep(0.45, 0.95, L), bare, art);
  // It covers what is under it rather than adding to it, so over coloured ink it stays white.
  vec3 lit = mix(ink, vec3(1.0), 0.93 + 0.07 * shine) * vec3(0.95, 0.98, 1.03);
  float k = streak * mix(shine, (0.6 + 0.4 * max(L, shine)) * (1.0 - 0.55 * L), art);
  col = mix(col, lit, clamp(k * 0.9, 0.0, 0.85)) + lit * k * 0.3;
  // Bright parts roll off into the light instead of clipping into flat white.
  col = mix(col, 0.82 + 0.2 * (1.0 - exp((0.82 - col) / 0.2)), step(0.82, col));
  return col;
}
`;
