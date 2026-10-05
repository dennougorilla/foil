// Neon: a sign designed from the picture, mounted on a near-black backboard. Spliced into the card
// shader after the core helpers, so hash/fbm/luma/face are in scope.
//
// The tubes are laid out on the CPU once per picture (neonMap.ts): the subject's silhouette as one
// long tube, an eye ring with its pupil dot or another detail inside it, stylised strokes on a
// sparse picture, and a tube round the art window. The shader draws them from two maps: the tube
// map (distance to the nearest tube, how far along it, which tube) and the wall map (the colored
// light all tubes spill on the board behind them).
//
// The board is painted near black with a faint grain; the picture shows on it only as a matte
// print at a few percent, so the subject still reads up close. The light on the board comes from
// the tubes alone: a wide, soft, inverse-square spill in each tube's own color. Each tube is
// glass seen as a cylinder: a near-white hot core about a third of its width grading through the
// saturated gas color to a slightly darker clear-glass edge, and one narrow specular streak off
// its centre that slides across it as the card tilts. Its ends are short black electrode boots,
// darkest where they turn into the board. It stands off the board on clear clips and posts:
// tilting slides it a few pixels against the board, its spill and its soft contact shadow. Every
// tube burns a little differently, and now and then one stutters (never the frame), on cycles an
// exported loop holds a whole number of times; held still (uTime stays put) every tube is lit.
export const NEON_GLSL = /* glsl */ `
uniform sampler2D uNeonMap;   // r: distance to the nearest tube's centre line (face px), g: how far along that tube, b: which tube
uniform sampler2D uNeonWall;  // rgb: the light the tubes spill on the board, a: the tube that lights it most
uniform vec3 uNeonGas[8];     // each tube's gas color
uniform float uNeonLen[8];    // each tube's length (face px)
uniform vec4 uNeonInfo;       // x: tube width (face px), y: how many tubes, z: the border tube (-1: none), w: how many posts
#define NEON_POSTS 40
uniform vec4 uNeonPost[NEON_POSTS];  // each post: where it meets the board (face px), and the tube's direction there

// The face in face pixels (a short side of 900).
#define NEON_FACE (uCardK * 900.0)
// How far the tubes slide against the board at full tilt (face px).
#define NEON_STANDOFF 11.0
// How high the tubes stand off the board, for their shadows (face px).
#define NEON_HEIGHT 14.0
// The border tube burns at this share of the picture's tubes, so it frames rather than leads.
#define NEON_BORDER_DIM 0.3
// Past this distance (face px) the tube map holds no tube (NEON_REACH in neonMap.ts).
#define NEON_REACH 110.0

// A period near 2.4 s that an exported loop holds a whole number of times.
float neonPeriod() { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / 2.4 + 0.5)) : 2.4; }

bool neonIsBorder(int id) { return float(id) == uNeonInfo.z; }

// 1 while lit; drops towards 0 while this tube stutters. In about one cycle in five one of the
// picture's tubes (its own transformer failing for a moment) goes off, on, off a little longer,
// then catches dimly. The frame tube never does: it would read as a fault, not as a flicker.
float neonFlicker(int id) {
  float P = neonPeriod();
  float x = uTime / P;
  float k = floor(x);
  if (uLoop > 0.0) k = mod(k, max(1.0, floor(uLoop / P + 0.5)));
  float many = uNeonInfo.y - (uNeonInfo.z > -0.5 ? 1.0 : 0.0);
  if (hash12(vec2(k, 1.7)) > 0.2 || many < 0.5 || neonIsBorder(id)) return 1.0;
  if (id != int(floor(hash12(vec2(k, 4.2)) * many))) return 1.0;
  float s = (fract(x) - 0.15 - 0.5 * hash12(vec2(k, 3.1))) * P;
  float off = step(0.0, s) * step(s, 0.09) + step(0.16, s) * step(s, 0.32) + 0.55 * step(0.4, s) * step(s, 0.47);
  return 1.0 - 0.95 * off;
}

// The border tube's gas is much paler, so it frames the sign without competing with it. The
// sign's own tubes each come out of the bender a slightly different shade (a little more or less
// of each primary), as real gas fills and phosphor coatings do.
vec3 neonGas(int id) {
  vec3 g = uNeonGas[id];
  if (neonIsBorder(id)) return mix(vec3(dot(g, vec3(0.3, 0.5, 0.2))), g, 0.35);
  vec3 h = vec3(hash12(vec2(float(id), 2.7)), hash12(vec2(float(id), 5.3)), hash12(vec2(float(id), 8.9))) - 0.5;
  return clamp(g * (1.0 + 0.16 * h), 0.0, 1.0);
}
// Each tube burns a little brighter or dimmer (about 8 % either way), as transformers differ.
float neonPower(int id) { return neonIsBorder(id) ? NEON_BORDER_DIM : 0.92 + 0.16 * hash12(vec2(float(id), 7.31)); }

vec3 neonTubeAt(vec2 p) { return texture(uNeonMap, p).rgb; }
// The tube index and how far along it, without blending across the line where the nearest
// tube (or the nearest end of one) changes.
vec2 neonNearest(vec2 p) { return texelFetch(uNeonMap, ivec2(p * vec2(textureSize(uNeonMap, 0))), 0).gb; }
// The glow's color: the nearest tube's gas, blended over the four nearest cells, so where two
// tubes' glows meet the color fades from one to the other instead of stepping cell by cell.
vec3 neonGlowGas(vec2 p) {
  vec2 sz = vec2(textureSize(uNeonMap, 0));
  vec2 q = p * sz - 0.5;
  ivec2 b = ivec2(floor(q));
  vec2 f = fract(q);
  vec3 g = vec3(0.0);
  for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++) {
      float tid = texelFetch(uNeonMap, clamp(b + ivec2(i, j), ivec2(0), ivec2(sz) - 1), 0).b;
      int id = clamp(int(tid + 0.5), 0, 7);
      float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      g += tid < -0.5 ? vec3(0.0) : w * neonGas(id) * neonPower(id) * neonFlicker(id);
    }
  return g;
}

// art is 1 in the art window; the frame is the darker part of the board.
vec3 neon(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 fuv = tuneFaceUv(uv);
  vec2 px = 1.0 / NEON_FACE;
  float W = uNeonInfo.x;
  float R = 0.5 * W;
  vec2 par = t * NEON_STANDOFF;
  vec2 tp = fuv + par * px;
  vec2 X = fuv * NEON_FACE;
  vec2 XT = tp * NEON_FACE;
  // The room's faint light: from above left, following the light and leaning with the tilt.
  vec3 L3 = normalize(vec3(vec2(-0.3, -0.4) + (uLight - 0.5) * 0.6 + t * 0.8, 1.0));

  // ---- The board: near-black paint with a faint grain; the picture a matte print on it at a few
  // percent, from a wide soft blur so no pixel steps show ----
  float grain = hash12(floor(X * 0.7)) - 0.5;
  float mott = fbm(fuv * uCardK * 4.0) - 0.5;
  // Brushed black metal: fine streaks running across the board, each a long scratch of slightly
  // different sheen, so the light the tubes spill has something to catch on.
  float brush = 0.6 * hash12(vec2(floor(X.y * 1.3), floor(X.x * 0.006 + hash12(vec2(floor(X.y * 1.3), 3.0)) * 7.0))) + 0.4 * hash12(vec2(floor(X.y * 0.45), 9.1));
  vec3 board = vec3(0.02, 0.02, 0.024) * (1.0 + 0.35 * mott + 0.2 * (brush - 0.5)) + grain * 0.004;
  board *= mix(0.75, 1.0, art);
  vec2 bo = vec2(0.012, 0.0);
  vec3 pic = 0.25 * (face(uv + bo, 5.0).rgb + face(uv - bo, 5.0).rgb + face(uv + bo.yx, 5.0).rgb + face(uv - bo.yx, 5.0).rgb);
  vec3 col = board + mix(vec3(luma(pic)), pic, 0.5) * 0.045 * art;

  // The tubes' light spilled on the board, in their own colors: the only light on it.
  vec4 wm = texture(uNeonWall, fuv);
  float wid = texelFetch(uNeonWall, ivec2(fuv * vec2(textureSize(uNeonWall, 0))), 0).a;
  vec3 pool = wm.rgb * (wid > -0.5 ? neonFlicker(int(wid + 0.5)) : 1.0);
  // Where much tube is near (a bend, two runs side by side) the spill is deeper in color as well
  // as brighter; it catches on the brushed streaks.
  float pl = dot(pool, vec3(0.3, 0.5, 0.2));
  vec3 spill = max(mix(vec3(pl), pool, 1.0 + 0.7 * smoothstep(0.1, 0.9, pl)), 0.0);
  col += spill * 0.4 * (0.9 + 0.2 * brush);

  // Each tube's soft contact shadow on the board, a few pixels below and right of it (the room
  // light is above left). The tube stands off the board, so as the card tilts the shadow slides
  // the other way from the tube.
  vec2 shOff = vec2(5.0, 9.0) + t * 7.0 + (uLight - 0.5) * vec2(-6.0, -6.0);
  float sd = neonTubeAt(fuv - shOff * px).r;
  float shadow = 1.0 - 0.85 * exp(-pow(max(sd - 0.5 * R, 0.0) / (0.8 * W), 2.0));
  col *= shadow;

  // ---- The posts: a clear rod from the board to the tube. A small disc on the board with a
  // tiny shadow; once the card tilts, the rod between it and the tube shows ----
  float footD = 1e4;
  float postD = 1e4;
  for (int i = 0; i < NEON_POSTS; i++) {
    if (float(i) >= uNeonInfo.w) break;
    vec2 F = uNeonPost[i].xy;
    footD = min(footD, length(X - F));
    vec2 ab = -par;
    float u = clamp(dot(X - F, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    postD = min(postD, length(X - F - ab * u));
  }
  // A metal standoff: a round cap on the board with a small dark shadow and a bright rim on the
  // side facing the room light; tilted, the rod up to the tube shows.
  float footR = 0.72 * W;
  float footSh = 1e4;
  for (int i = 0; i < NEON_POSTS; i++) {
    if (float(i) >= uNeonInfo.w) break;
    footSh = min(footSh, length(X - shOff * 0.7 - uNeonPost[i].xy));
  }
  col *= 1.0 - 0.7 * exp(-pow(max(footSh - footR, 0.0) / (0.35 * W), 2.0));
  float post = 1.0 - smoothstep(footR - 0.8, footR + 0.8, postD);
  float cap = 1.0 - smoothstep(footR - 0.8, footR + 0.8, footD);
  vec3 metal = vec3(0.09, 0.095, 0.1) + spill * 0.55;
  col = mix(col, metal * 0.75, post * 0.9);
  // The cap: brushed metal lit by the tubes, a bright rim on its lit side, a dark one opposite.
  vec2 fq = vec2(1e4);
  for (int i = 0; i < NEON_POSTS; i++) {
    if (float(i) >= uNeonInfo.w) break;
    vec2 q = X - uNeonPost[i].xy;
    if (dot(q, q) < dot(fq, fq)) fq = q;
  }
  vec2 fn = fq / max(length(fq), 1e-3);
  float capEdge = smoothstep(footR * 0.55, footR * 0.95, footD);
  float capLit = dot(fn, normalize(-L3.xy + vec2(1e-4)));
  vec3 capCol = metal * (1.0 - 0.35 * capEdge) + vec3(0.42, 0.44, 0.46) * capEdge * smoothstep(0.1, 0.9, capLit) - vec3(0.05) * capEdge * smoothstep(0.1, 0.9, -capLit);
  col = mix(col, max(capCol, 0.0), cap);

  // ---- The tube here ----
  vec3 tm = neonTubeAt(tp);
  float d = tm.r;
  vec2 near = neonNearest(tp);
  float tid = near.y;
  int id = clamp(int(tid + 0.5), 0, 7);
  float has = tid < -0.5 || uNeonInfo.y < 0.5 ? 0.0 : 1.0;
  vec3 gas = neonGas(id);
  float len = uNeonLen[id];
  float on = neonFlicker(id);
  // The electrode boot at each end: short, black, turning down into the board at its very tip.
  // A tube no longer than it is wide (an eye's pupil) is all glass.
  // (How far along: filtered, so the boot's edge is smooth, unless that blends across two tubes.)
  float along = abs(tm.g - near.x) < 6.0 ? tm.g : near.x;
  float fromEnd = min(along, len - along);
  float EL = len < 2.0 * W ? -W : min(0.85 * W, 0.08 * len);
  float paint = 1.0 - smoothstep(EL - 1.2, EL + 1.2, fromEnd);
  float tip = smoothstep(0.35 * W, 0.0, fromEnd) * paint;
  float glow = neonPower(id) * on * (1.0 - paint);
  // Across the tube: x is 0 on its centre line and 1 at the glass; the normal points outwards.
  vec2 e = vec2(1.5, 0.0);
  vec2 grad = vec2(neonTubeAt(tp + e.xy * px).r - neonTubeAt(tp - e.xy * px).r, neonTubeAt(tp + e.yx * px).r - neonTubeAt(tp - e.yx * px).r);
  vec2 nrm = grad / max(length(grad), 1e-4);
  float x = d / R;
  float aa = max(fwidth(d) / R, 0.04);
  float inTube = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, x)) * has;

  // The glow in the air round the lit glass: soft, with no edge of its own.
  float hd = max(d - R, 0.0);
  float halo = 0.3 * exp(-pow(hd / (0.5 * W), 2.0)) + 0.1 / (1.0 + pow(hd / (1.4 * W), 2.0));
  halo *= 1.0 - smoothstep(0.75 * NEON_REACH, NEON_REACH, d);
  // (Taken over the whole tube, ends too: the glow of the line between two tubes must not step.)
  // The contact shadow still shows through it.
  col += neonGlowGas(tp) * halo * mix(0.6, 1.0, art) * mix(1.0, shadow, 0.85);

  // Lit glass, across its width: a near-white core (a gaussian about a third of the width) grading
  // into the saturated gas, which darkens a little towards the sides as a cylinder does, then a
  // thin darker line where the clear glass wall refracts the board behind it.
  float core = exp(-x * x / (2.0 * 0.22 * 0.22));
  vec3 sat = gas * (0.9 - 0.15 * x * x);
  vec3 hot = mix(gas, vec3(1.0), 0.65) * 1.22;
  vec3 lit = mix(sat, hot, core);
  float rim = exp(-pow((1.0 - x) * R / 0.8, 2.0));
  lit *= 1.0 - 0.3 * rim;
  vec3 tube = lit * glow;
  // Unlit glass (while it stutters): clear, with a trace of its colored coating.
  float cyl = sqrt(max(1.0 - x * x, 0.0));
  tube += (col * 0.5 + gas * 0.05 * cyl + vec3(0.03) * cyl) * (1.0 - min(glow * 1.5, 1.0)) * (1.0 - paint);
  // The boot: matt black with a faint glass sheen, darker still where it turns into the board.
  tube = mix(tube, vec3(0.022) * (0.45 + 0.55 * cyl) * (1.0 - 0.75 * tip) + gas * 0.015, paint);
  // One narrow specular streak on the side facing the room light, off the centre in the colored
  // glass, where the light reflects off the round tube. Tilting the card slides it across the
  // tube by a few pixels (towards the edge or towards the core).
  vec2 ld = normalize(vec2(-0.6, -0.8));
  float side = smoothstep(-0.05, 0.3, dot(ld, nrm));
  float hc = 0.6 + 0.3 * clamp(dot(t + (uLight - 0.5) * 0.5, nrm) * 1.4, -1.0, 1.0);
  float streak = exp(-pow((x - hc) * R / 0.75, 2.0)) * side;
  tube += vec3(0.95, 0.97, 1.0) * streak * mix(0.6, 0.25, paint) * (0.5 + 0.5 * min(glow + paint, 1.0));
  col = mix(col, tube, inTube);

  // ---- The clips: a metal strap round the tube at each post, moving with the tube ----
  float clip = 0.0;
  float clipRim = 0.0;
  for (int i = 0; i < NEON_POSTS; i++) {
    if (float(i) >= uNeonInfo.w) break;
    vec4 P = uNeonPost[i];
    vec2 q = XT - P.xy;
    float along = abs(dot(q, P.zw));
    float across = abs(dot(q, vec2(-P.w, P.z)));
    float hw = 0.28 * W;
    float reach = R + 0.22 * W;
    float m = (1.0 - smoothstep(hw - 0.8, hw + 0.8, along)) * (1.0 - smoothstep(reach - 0.8, reach + 0.8, across));
    clip = max(clip, m);
    clipRim = max(clipRim, m * max(smoothstep(hw - 2.0, hw - 0.5, along), smoothstep(reach - 2.2, reach - 0.6, across)));
  }
  // Clear plastic: it dims what is under it a little and catches a bright rim.
  // A metal strap: it hides the glass under it, lit by the tube's own glow, with bright edges.
  col = mix(col, gas * 0.18 * glow + vec3(0.07), clip * 0.92);
  col += vec3(0.5, 0.52, 0.55) * clipRim;

  // The name and the pips on the frame are lit as thin neon lettering: wherever the print is
  // darker than the paper round it, in the border tube's paler gas. Only clear of the art window
  // and the border tube, so the window's edge never becomes a second line.
  vec2 a0 = uArt.xy * NEON_FACE;
  vec2 a1 = uArt.zw * NEON_FACE;
  vec2 out2 = max(a0 - uv * NEON_FACE, uv * NEON_FACE - a1);
  float clear = smoothstep(0.024 * 900.0 + 0.8 * W, 0.024 * 900.0 + 1.3 * W, max(out2.x, out2.y));
  vec3 letters = uNeonInfo.z > -0.5 ? neonGas(int(uNeonInfo.z)) : uNeonInfo.y > 0.5 ? uNeonGas[0] : vec3(1.0, 0.2, 0.62);
  float ink = (1.0 - art) * clear * smoothstep(0.08, 0.24, luma(face(uv, 3.0).rgb) - L);
  col = mix(col, mix(letters, vec3(1.0), 0.4) * 0.7, ink);
  col += letters * smoothstep(0.03, 0.2, luma(face(uv, 4.0).rgb) - luma(face(uv, 1.0).rgb)) * (1.0 - art) * clear * 0.22;
  return col;
}
`;
