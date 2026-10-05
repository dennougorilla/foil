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

// The tube path and how firmly it holds at a point p (face uv, already in the tubes' plane):
// x, zw as neonEdge; y is 1 where a tube runs. Traced on a blurred picture, so the tube is a smooth
// bend over pixel-art steps and texture, the way a glass bender simplifies a drawing.
vec4 neonPath(vec2 p, float art) {
  vec4 e = neonEdge(p, 4.0, 9.0);
  float big = neonEdge(p, 5.0, 22.0).y;
  // Only outlines that hold when blurred further; on the frame only its strongest lines.
  float hold = mix(smoothstep(0.26, 0.38, big), smoothstep(0.16, 0.26, big), art);
  e.y = smoothstep(0.07, 0.16, e.y) * hold;
  return e;
}

// art is 1 in the art window; the frame is the board the sign is mounted on.
vec3 neon(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 px = 1.0 / NEON_FACE;
  // The tubes stand off the wall on standoffs: tilting slides them against the wall and the light
  // they pool on it (the pool stays where the tube is mounted).
  vec2 par = t * 44.0;
  vec2 tuv = uv + par * px;
  vec4 tube = neonPath(tuv, art);
  // The card's own edge is the sign's board, not a tube.
  vec2 fuv = tuneFaceUv(uv);
  vec2 rimv = min(fuv, 1.0 - fuv) * uCardK;
  float rim = smoothstep(0.025, 0.045, min(rimv.x, rimv.y));
  float lit = tube.y * rim;
  // A tube takes the color of the shape it outlines (the bright side), not a blend of both sides.
  vec3 tint = neonGas(tuv + tube.zw * 22.0 * px);
  float on = neonFlicker(uv, tint);

  // The wall: the picture in a dark room, a little more contrast so it is not murky, lit only by
  // a faint room light from the light's side; the frame is a darker painted board.
  vec3 alb = pow(c, vec3(1.2));
  float room = 0.12 + 0.2 * exp(-pow(length((uv - uLight) * uCardK) / 0.75, 2.0));
  vec3 col = alb * vec3(0.9, 0.92, 1.05) * room * mix(0.5, 1.0, art);

  // The line on the wall behind the tube (where it is mounted), from the tube's own distance field.
  float wallX = tube.x - dot(tube.zw, par);
  vec4 big = neonEdge(uv, 5.0, 22.0);
  float gate = mix(smoothstep(0.24, 0.36, big.y), smoothstep(0.14, 0.24, big.y), art) * rim;
  float pool = (exp(-abs(wallX) / 9.0) + 0.3 * exp(-abs(wallX) / 24.0)) * lit + exp(-abs(big.x) / 26.0) * gate * 0.35;
  float wide = smoothstep(0.04, 0.3, neonSpread(uv)) * 0.14;
  vec3 light = tint * (pool + wide) * on;
  // The wall shows the picture's own colors where the gas lights it; a faint haze hangs in the air.
  col += (alb * light * 1.5 + light * 0.08) * mix(0.35, 1.0, art);
  // Standoffs: every so often a post holds the tube off the wall, a small dark disc on the wall
  // that the tube slides off as the card tilts, and a clip that crosses the tube.
  vec2 P = tuv * NEON_FACE;
  vec2 cell = floor(P / 120.0);
  vec2 q = (cell + 0.2 + 0.6 * hash22(cell + 9.1)) * 120.0;
  vec4 at = neonPath(q / NEON_FACE, art);
  vec2 foot = q - at.zw * at.x;
  float has = smoothstep(0.7, 0.9, at.y) * step(abs(at.x), 50.0);
  vec2 dq = P - foot;
  float alongQ = dot(dq, vec2(-at.w, at.z));
  float acrossQ = dot(dq, at.zw);
  float post = has * (1.0 - smoothstep(4.0, 5.5, length(P - par - foot)));
  col = mix(col, vec3(0.05, 0.05, 0.06) + col * 0.3, post * 0.85);

  // The name and the pips on the frame are lit as thin neon lettering: wherever the print is
  // darker than the paper round it.
  float ink = (1.0 - art) * smoothstep(0.08, 0.24, luma(face(uv, 3.0).rgb) - L);
  col = mix(col, mix(tint, vec3(1.0), 0.55) * on, ink);
  col += tint * smoothstep(0.03, 0.2, luma(face(uv, 4.0).rgb) - luma(face(uv, 1.0).rgb)) * (1.0 - art) * 0.45 * on;

  // The tube: a glass wall of even thickness round a column of gas, white-hot at its core and
  // deep in color towards the glass (at least two screen pixels across on a small card).
  float W = max(6.5, fwidth(tube.x) * 0.9);
  float across = tube.x / W;
  float x = abs(across);
  // At a tube's end the gas stops before the glass: the electrode, a dark metal cap in clear glass.
  float glass = smoothstep(0.25, 0.4, lit);
  float gasOn = smoothstep(0.4, 0.55, lit);
  float gas = (1.0 - smoothstep(0.72, 0.95, x)) * gasOn;
  float wall = (1.0 - smoothstep(1.0, 1.2, x)) * glass;
  float cap = (1.0 - smoothstep(0.55, 0.75, x)) * glass * (1.0 - gasOn);
  // Light right round the glass: tight and saturated.
  float bloom = exp(-max(x - 0.9, 0.0) * 1.1) * glass * gasOn;
  col += tint * bloom * 0.55 * on;
  float core = exp(-x * x * 7.0);
  vec3 burn = mix(tint * (1.5 - 0.5 * x), vec3(1.0, 0.98, 0.95), core * 0.85);
  // Unlit, the gas is a pale glass tube with a trace of its colored coating.
  vec3 gasCol = mix(vec3(0.2, 0.2, 0.23) + tint * 0.12 + col * 0.3, burn, on);
  // The glass round it carries the color faintly, and the room's light runs along its edge on the
  // side that faces the light, changing sides as the card tilts.
  vec2 toLight = (uLight - uv) * uCardK * 2.0 + t * 1.4;
  float facing = dot(tube.zw, toLight) / max(length(toLight), 0.35);
  float edge = 0.7 * exp(-pow((x - 0.95) / 0.12, 2.0)) * max(sign(across) * facing, 0.0);
  float streak = exp(-pow((across - 0.55 * clamp(facing, -1.0, 1.0)) / 0.12, 2.0)) * gas * 0.5;
  float shoulder = smoothstep(0.7, 0.9, x) * (1.0 - smoothstep(1.0, 1.2, x));
  vec3 glassCol = col * (1.0 - 0.22 * shoulder) + tint * 0.12 * on + vec3(0.9, 0.94, 1.0) * edge;
  col = mix(col, glassCol, wall);
  col = mix(col, vec3(0.22, 0.21, 0.22) + tint * 0.08 + 0.4 * exp(-pow(across + 0.3, 2.0) * 8.0), cap * 0.8);
  col = mix(col, gasCol * mix(0.8, 1.0, art), gas);
  col += vec3(0.95, 0.97, 1.0) * streak;
  // The clip across the tube at a standoff: a thin band of dark metal with a bright edge.
  float clip = has * (1.0 - smoothstep(2.4, 3.4, abs(alongQ))) * (1.0 - smoothstep(W * 1.15, W * 1.35, abs(acrossQ))) * gas;
  col = mix(col, vec3(0.16, 0.16, 0.18) + 0.5 * exp(-pow((alongQ + 1.2) / 0.9, 2.0)) * (1.0 - 0.5 * abs(acrossQ) / W), clip * 0.9);
  return col;
}
`;
