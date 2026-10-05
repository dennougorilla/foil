// Chameleon: color-shift (chameleon) car paint under a deep clear coat. Spliced into CARD_FS after
// COMMON and TUNE_GLSL, so vnoise/screen, tunePattern, uLight, vUv and uArt are in scope.
//
// The paint's color depends on the angle it is seen from, through gold, green, blue and violet.
// The tilt moves that angle over the whole card at once, so the card flows from one color to the
// next as a body; the way to the highlight and the card's own breadth add a gentle gradient. No
// grains: the paint is smooth.
// The frame is painted solid in a deep lacquer, keeping its light and dark so the name stays
// readable. Over the art the paint is a thin color-shift film: the picture keeps its colors, and
// the light the film reflects (a soft highlight and a softbox strip that slide faster than the
// color) comes back in the paint's color.
// Nothing reads the shader clock: it moves only with the tilt and the light, so it holds still
// under reduced motion and every export loop closes by itself.

export const CHAMELEON_GLSL = /* glsl */ `
// The paint at angle k: 0 faces the light (gold), 1 is turned away (violet). Past either end it
// comes back, so a big tilt keeps changing color. Blue sits between green and violet so the
// sweep never passes through grey.
vec3 chamPaint(float k) {
  k = 1.0 - abs(fract(k * 0.5) * 2.0 - 1.0);
  const vec3 GOLD = vec3(1.0, 0.66, 0.12);
  const vec3 GREEN = vec3(0.1, 0.78, 0.34);
  const vec3 BLUE = vec3(0.06, 0.42, 0.9);
  const vec3 VIOLET = vec3(0.52, 0.12, 0.86);
  vec3 c = mix(GOLD, GREEN, smoothstep(0.0, 0.36, k));
  c = mix(c, BLUE, smoothstep(0.36, 0.66, k));
  return mix(c, VIOLET, smoothstep(0.66, 1.0, k));
}

/** \`art\` is 1 in the art window: the paint is a thin coat over the picture there, solid on the frame. */
vec3 chameleon(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 p = (uv - 0.5) * uCardK;
  vec2 q = (uv - tunePattern(uLight)) * uCardK;
  float d = length(q);
  // The angle: the tilt moves it over the whole card at once; the way to the highlight and the
  // card's breadth spread it a little, so neighboring colors meet across the card and that
  // meeting slides as it tilts.
  float k = 0.42 + 1.1 * dot(t, vec2(0.62, -0.5)) + 0.18 * (d - 0.45) + 0.12 * dot(p, vec2(0.5, 0.8));
  vec3 paint = chamPaint(k);
  // Flop: facing the light the paint is bright; turned away it deepens into a denser, more
  // saturated shade of itself (squared), the depth of a lacquered coat rather than a dimmed one.
  float face = exp(-d * d * 1.3);
  vec3 body = mix(paint * paint * 0.85, paint, 0.3 + 0.7 * face);
  // Frame: solid paint keeping the frame's light and dark (dark ink stays a deep shade of it).
  // Where it meets the art it dips into a shaded bevel, and its outer edge catches a thin line of gloss.
  vec2 cu = vUv;
  vec2 box = (abs(cu - (uArt.xy + uArt.zw) * 0.5) - (uArt.zw - uArt.xy) * 0.5) * uCardK;
  float bevel = smoothstep(0.0, 0.03, length(max(box, 0.0)));
  vec2 eg = min(cu, 1.0 - cu) * uCardK;
  float edge = min(eg.x, eg.y);
  vec3 solid = body * (0.2 + 0.85 * pow(L, 0.9)) * (0.6 + 0.4 * bevel) * (0.7 + 0.3 * smoothstep(0.0, 0.04, edge));

  // A softbox reflected in the clear coat: a long strip across the card with soft edges and ends,
  // sliding with the tilt faster than the color.
  float r = dot(p, vec2(0.34, 0.94)) + dot(t, vec2(0.55, 1.1)) * 0.9;
  // Orange peel: the clear coat is not quite flat, so the strip's edges ripple a little.
  r += (vnoise(p * 34.0) - 0.5) * 0.008 + (vnoise(p * 9.0 + 3.7) - 0.5) * 0.01;
  float strip = smoothstep(0.12, 0.035, abs(r + 0.18)) * smoothstep(0.75, 0.2, abs(dot(p, vec2(0.94, -0.34))));
  // The highlight: a soft patch of light.
  float glow = exp(-d * d / 0.06);

  // Art: a thin color-shift film over the print. The picture keeps its light and dark, barely
  // tinted; the film shows where it reflects light (the highlight and the strip), and the light it
  // gives back there is the paint's color, as on a real color-shift film.
  vec3 tint = paint / max(max(paint.r, max(paint.g, paint.b)), 1e-3);
  vec3 coat = c * mix(vec3(1.0), tint, 0.2) + paint * 0.1 * pow(1.0 - L, 2.0);
  coat = screen(coat, paint * (0.06 + 0.3 * glow + 0.55 * strip) * (1.0 - 0.5 * L));
  vec3 col = mix(solid, coat, art);

  // The clear coat's own light, near white: the strip and the highlight on the paint, the edge line.
  vec3 gloss = vec3(1.0) * (strip * mix(0.15, 0.06, art) + glow * mix(0.12, 0.05, art));
  gloss += mix(paint, vec3(1.0), 0.6) * smoothstep(0.022, 0.006, edge) * (1.0 - art) * (0.18 + 0.22 * face);
  // The coat reflects more the further the card is turned from you.
  gloss *= 0.85 + 0.5 * min(dot(t, t), 1.0);
  col = col + gloss * (1.0 - 0.5 * col);
  // Bright parts roll off into the light instead of clipping into flat white.
  return mix(col, 0.86 + 0.14 * (1.0 - exp((0.86 - col) / 0.14)), step(0.86, col));
}
`;
