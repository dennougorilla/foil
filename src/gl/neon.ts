// Neon: the picture's outlines bent into glass tubes of glowing gas, hung in a dark room. Spliced
// into the card shader after the core helpers, so hash/rgb2hsv/face are in scope.
//
// The outlines are found at two scales. Each is a signed distance to the outline, in face pixels:
// how far the picture here is from its local average, over how fast it changes (a step blurred
// by the mip chain crosses its own average right at the edge), so the tubes come out of an even
// thickness however hard the edge is. The fine scale draws the tubes; the coarse one keeps only
// the outlines that still stand out when blurred (the big shapes, not texture) and casts the glow.
// A tube's gas is the color of the shape it outlines, snapped to a neon color.
// The tubes stand a little off the wall (the picture, dimmed): tilting slides them against their
// glow, and a reflection slides across each tube and along its glass on the side facing the light.
// Now and then the tubes of one gas round one spot stutter, on cycles an exported loop holds a
// whole number of times; held still (uTime stays put) they are lit.
export const NEON_GLSL = /* glsl */ `
// The face in face pixels (a short side of 900).
#define NEON_FACE (uCardK * 900.0)

// What the outlines are traced on: brightness, with saturated color counted as bright, so a red
// shape on a dark ground has as clear an outline as a white one.
float neonTone(vec2 uv, float lod) {
  vec3 c = face(uv, lod).rgb;
  return 0.5 * luma(c) + 0.5 * max(c.r, max(c.g, c.b));
}

// x: signed distance to the outline (face px, + on the bright side); y: how much the picture
// changes across it; zw: the direction across it, towards the bright side.
vec4 neonEdge(vec2 uv, float lod, float span) {
  vec2 dx = vec2(span / NEON_FACE.x, 0.0), dy = vec2(0.0, span / NEON_FACE.y);
  float l = neonTone(uv - dx, lod), r = neonTone(uv + dx, lod);
  float b = neonTone(uv - dy, lod), t = neonTone(uv + dy, lod);
  vec2 g = vec2(r - l, t - b) / (2.0 * span);
  float gl = max(length(g), 1e-5);
  float mean = neonTone(uv, lod + 2.0);
  return vec4((0.25 * (l + r + b + t) - mean) / gl, gl * span * 2.0, g / gl);
}

// How much the picture changes around uv, seen very blurred: a broad field that is high all round
// a big outline, the light the tubes throw on the wall.
float neonSpread(vec2 uv) {
  vec2 dx = vec2(26.0 / NEON_FACE.x, 0.0), dy = vec2(0.0, 26.0 / NEON_FACE.y);
  return length(vec2(neonTone(uv + dx, 5.2) - neonTone(uv - dx, 5.2), neonTone(uv + dy, 5.2) - neonTone(uv - dy, 5.2)));
}

// The gas: a color snapped to the nearest neon color, or none (-1) when it is grey or very dark.
const vec3 NEON_PINK = vec3(1.0, 0.2, 0.66);
vec3 neonHue(vec3 src) {
  vec3 h = rgb2hsv(src);
  if (h.y < 0.2 || h.z < 0.1) return vec3(-1.0);
  float hue = h.x;
  if (hue < 0.045 || hue > 0.95) return vec3(1.0, 0.14, 0.1);   // red
  if (hue < 0.11) return vec3(1.0, 0.45, 0.08);                   // amber
  if (hue < 0.2) return vec3(1.0, 0.82, 0.18);                    // yellow
  if (hue < 0.42) return vec3(0.42, 1.0, 0.22);                   // lime
  if (hue < 0.57) return vec3(0.12, 0.88, 1.0);                   // cyan
  if (hue < 0.7) return vec3(0.25, 0.42, 1.0);                    // blue
  if (hue < 0.83) return vec3(0.66, 0.26, 1.0);                   // violet
  return NEON_PINK;
}
// The gas at uv: the picture's own color there, or for grey parts (and the paper frame) the color
// of the whole card, so the sign keeps one tone there; a grey picture glows pink.
vec3 neonGas(vec2 uv) {
  vec3 own = neonHue(face(uv, 4.0).rgb);
  if (own.x >= 0.0) return own;
  vec3 all = neonHue(face(vec2(0.5), 10.0).rgb);
  return all.x >= 0.0 ? all : NEON_PINK;
}

// A period near 2.4 s that an exported loop holds a whole number of times.
float neonPeriod() { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / 2.4 + 0.5)) : 2.4; }

// 1 while lit; drops towards 0 while the tube here stutters. In most cycles one tube flickers
// once: the gas at a point picked for the cycle, in the tubes of that gas round that point (one
// transformer feeding them), fading out with distance so no line is drawn across the picture.
float neonFlicker(vec2 uv, vec3 tint) {
  float P = neonPeriod();
  float x = uTime / P;
  float k = floor(x);
  if (uLoop > 0.0) k = mod(k, max(1.0, floor(uLoop / P + 0.5)));
  if (hash12(vec2(k, 1.7)) > 0.75) return 1.0;
  vec2 at = mix(uArt.xy, uArt.zw, 0.15 + 0.7 * hash22(vec2(k, 4.2)));
  if (distance(neonGas(at), tint) > 0.01) return 1.0;
  float reach = 1.0 - smoothstep(0.18, 0.4, length((uv - at) * uCardK));
  // Seconds since it began: off, on, off a little longer, then a dim catch before it holds.
  float s = (fract(x) - 0.15 - 0.5 * hash12(vec2(k, 3.1))) * P;
  float off = step(0.0, s) * step(s, 0.09) + step(0.16, s) * step(s, 0.32) + 0.55 * step(0.4, s) * step(s, 0.47);
  return 1.0 - 0.95 * off * reach;
}

// art is 1 in the art window; the frame is the dark wall round the sign and catches less light.
vec3 neon(vec3 c, vec2 uv, vec2 t, float L, float art) {
  // The tubes stand off the wall, so they slide against it as the card tilts.
  vec4 fine = neonEdge(uv + t * 34.0 / NEON_FACE, 2.6, 5.0);
  vec4 big = neonEdge(uv, 3.9, 14.0);
  // Only outlines that hold at both scales become tubes; on the frame only its strongest lines
  // (the window and the card's edge), so the name and the pips are not traced into a tangle.
  float hold = mix(smoothstep(0.3, 0.42, big.y), smoothstep(0.2, 0.3, big.y), art);
  float lit = smoothstep(0.12, 0.2, fine.y) * hold;
  // The card's own edge is the sign's board, not a tube.
  vec2 fuv = tuneFaceUv(uv);
  vec2 rim = min(fuv, 1.0 - fuv) * uCardK;
  lit *= smoothstep(0.025, 0.045, min(rim.x, rim.y));
  hold *= smoothstep(0.025, 0.045, min(rim.x, rim.y));
  // A tube takes the color of the shape it outlines (the bright side), not a blend of both sides.
  vec3 tint = neonGas(uv + big.zw * 18.0 / NEON_FACE);
  float on = neonFlicker(uv, tint);

  // The wall: the picture in a dark room, cooler and dimmer.
  vec3 col = c * vec3(0.44, 0.44, 0.52) * mix(0.62, 1.0, art);
  // Light from the tubes falls on the wall around them, lighting the picture in their color, and
  // hangs in the air as a haze: close and bright, then wide and faint.
  float near = exp(-abs(big.x) / 14.0) * hold;
  float wide = smoothstep(0.03, 0.3, neonSpread(uv));
  float bloom = exp(-abs(fine.x) / 7.0) * lit;
  vec3 light = tint * (near * 1.1 + wide * 0.6 + bloom * 0.8) * on;
  col += (c * light * 1.3 + light * 0.34) * mix(0.25, 1.0, art);

  // The name and the pips on the frame are lit as thin neon lettering: wherever the print is
  // darker than the paper round it.
  float ink = (1.0 - art) * smoothstep(0.08, 0.24, luma(face(uv, 3.0).rgb) - L);
  col = mix(col, mix(tint, vec3(1.0), 0.5) * on, ink);
  col += tint * smoothstep(0.03, 0.2, luma(face(uv, 4.0).rgb) - luma(face(uv, 1.0).rgb)) * (1.0 - art) * 0.5 * on;

  // The tube: a column of glowing gas (white-hot at its core, deep in color at its edge) inside a
  // glass wall of its own thickness (at least two screen pixels across on a small card).
  float W = max(7.0, fwidth(fine.x) * 0.9);
  float across = fine.x / W;
  float x = abs(across);
  float gas = (1.0 - smoothstep(0.8, 1.05, x)) * lit;
  float wall = (1.0 - smoothstep(1.3, 1.55, x)) * lit;
  vec3 burn = mix(tint * (1.35 - 0.6 * x), mix(tint, vec3(1.0), 0.7), exp(-x * x * 10.0));
  // Unlit, the gas is a dull grey tube with a trace of its color.
  vec3 gasCol = mix(vec3(0.16, 0.16, 0.19) + tint * 0.12, burn, on);
  // The glass round it carries the color faintly, and the room's light runs along its edge on the
  // side that faces the light, changing sides as the card tilts.
  vec2 toLight = (uLight - uv) * uCardK * 2.0 + t * 1.4;
  float facing = dot(fine.zw, toLight) / max(length(toLight), 0.35);
  float edge = 0.8 * exp(-pow((x - 1.2) / 0.18, 2.0)) * max(sign(across) * facing, 0.0);
  // On the round tube itself the reflection is a narrow streak that slides across it with the angle.
  float streak = exp(-pow((across - 0.6 * clamp(facing, -1.0, 1.0)) / 0.13, 2.0)) * gas * 0.55;
  // The glass's shoulders, seen edge-on, are a little darker than what lies behind them.
  float shoulder = smoothstep(0.95, 1.15, x) * (1.0 - smoothstep(1.35, 1.55, x));
  vec3 glassCol = col * (1.0 - 0.35 * shoulder) + tint * 0.1 * on + vec3(0.92, 0.95, 1.0) * edge;
  col = mix(col, glassCol, wall);
  col = mix(col, gasCol * mix(0.7, 1.0, art), gas);
  col += vec3(0.95, 0.97, 1.0) * streak;
  return col;
}
`;
