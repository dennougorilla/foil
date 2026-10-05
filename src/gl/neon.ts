// Neon: a sign designed from the picture, mounted on a near-black backboard. Spliced into the card
// shader after the core helpers, so hash/fbm/luma/face are in scope.
//
// The tubes are laid out on the CPU once per picture (neonMap.ts): the subject's silhouette as one
// long tube, two or three details inside it, stylised strokes on a sparse picture, and a dim tube
// round the art window. The shader draws them from two maps: the tube map (distance to the nearest
// tube, how far along it, which tube) and the wall map (the colored light all tubes spill on the
// board behind them).
//
// The board is painted near black with a faint grain; the picture shows on it only as a faint,
// blurred, pale tint, so the subject still reads. Each tube is saturated glass with one soft hot
// core and a body that darkens towards its edges (no bright rim), one specular streak that slides
// across it as the card tilts, and its last stretch at each end painted out black where the
// electrodes are. It stands off the board on small clear posts: tilting slides it a few pixels
// against the board, its spill and its soft contact shadow. Every tube burns a little differently,
// and now and then one stutters, on cycles an exported loop holds a whole number of times; held
// still (uTime stays put) every tube is lit.
export const NEON_GLSL = /* glsl */ `
uniform sampler2D uNeonMap;   // r: distance to the nearest tube's centre line (face px), g: how far along that tube, b: which tube
uniform sampler2D uNeonWall;  // rgb: the light the tubes spill on the board, a: the tube that lights it most
uniform vec3 uNeonGas[8];     // each tube's gas color
uniform float uNeonLen[8];    // each tube's length (face px)
uniform vec4 uNeonInfo;       // x: tube width (face px), y: how many tubes, z: the border tube (-1: none), w: how many posts
#define NEON_POSTS 40
uniform vec2 uNeonPost[NEON_POSTS];  // where each post meets the board (face px)

// The face in face pixels (a short side of 900).
#define NEON_FACE (uCardK * 900.0)
// How far the tubes slide against the board at full tilt (face px).
#define NEON_STANDOFF 11.0
// How high the tubes stand off the board, for their shadows (face px).
#define NEON_HEIGHT 16.0
// The border tube burns at this share of the picture's tubes, so it frames rather than leads.
#define NEON_BORDER_DIM 0.4
// Past this distance (face px) the tube map holds no tube (NEON_REACH in neonMap.ts).
#define NEON_REACH 110.0

// A period near 2.4 s that an exported loop holds a whole number of times.
float neonPeriod() { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / 2.4 + 0.5)) : 2.4; }

// 1 while lit; drops towards 0 while this tube stutters. In most cycles one tube (its own
// transformer failing for a moment) goes off, on, off a little longer, then catches dimly.
float neonFlicker(int id) {
  float P = neonPeriod();
  float x = uTime / P;
  float k = floor(x);
  if (uLoop > 0.0) k = mod(k, max(1.0, floor(uLoop / P + 0.5)));
  if (hash12(vec2(k, 1.7)) > 0.75 || uNeonInfo.y < 0.5) return 1.0;
  if (id != int(floor(hash12(vec2(k, 4.2)) * uNeonInfo.y))) return 1.0;
  float s = (fract(x) - 0.15 - 0.5 * hash12(vec2(k, 3.1))) * P;
  float off = step(0.0, s) * step(s, 0.09) + step(0.16, s) * step(s, 0.32) + 0.55 * step(0.4, s) * step(s, 0.47);
  return 1.0 - 0.95 * off;
}

bool neonIsBorder(int id) { return float(id) == uNeonInfo.z; }
// The border tube's gas is paler, so it does not compete with the sign.
vec3 neonGas(int id) {
  vec3 g = uNeonGas[id];
  return neonIsBorder(id) ? mix(vec3(dot(g, vec3(0.3, 0.5, 0.2))), g, 0.45) : g;
}
// Each tube burns a little differently, as real gas fills and transformers do.
float neonPower(int id) { return neonIsBorder(id) ? NEON_BORDER_DIM : 0.9 + 0.18 * hash12(vec2(float(id), 7.31)); }

vec3 neonTubeAt(vec2 p) { return texture(uNeonMap, p).rgb; }
// The tube index and how far along it, without blending across the line where the nearest
// tube (or the nearest end of one) changes.
vec2 neonNearest(vec2 p) { return texelFetch(uNeonMap, ivec2(p * vec2(textureSize(uNeonMap, 0))), 0).gb; }

// art is 1 in the art window; the frame is the darker part of the board.
vec3 neon(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 fuv = tuneFaceUv(uv);
  vec2 px = 1.0 / NEON_FACE;
  float W = uNeonInfo.x;
  float R = 0.5 * W;
  vec2 par = t * NEON_STANDOFF;
  vec2 tp = fuv + par * px;
  vec2 X = fuv * NEON_FACE;
  // The room light: from above left, following the light and leaning with the tilt.
  vec3 L3 = normalize(vec3(vec2(-0.3, -0.4) + (uLight - 0.5) * 0.6 + t * 0.8, 1.0));

  // ---- The board: near-black paint with a faint grain, the picture a faint, pale, blurred tint ----
  float grain = hash12(floor(X * 0.7)) - 0.5;
  float mott = fbm(fuv * uCardK * 4.0) - 0.5;
  vec3 board = vec3(0.021, 0.021, 0.025) * (1.0 + 0.4 * mott) + grain * 0.007;
  board *= mix(0.7, 1.0, art);
  vec3 pic = face(uv, 3.5).rgb;
  vec3 tint = mix(vec3(luma(pic)), pic, 0.4);
  vec3 col = mix(board, tint, 0.12 * art);

  // The tubes' light spilled on the board, in their own colors.
  vec4 wm = texture(uNeonWall, fuv);
  float wid = texelFetch(uNeonWall, ivec2(fuv * vec2(textureSize(uNeonWall, 0))), 0).a;
  vec3 pool = wm.rgb * (wid > -0.5 ? neonFlicker(int(wid + 0.5)) : 1.0);
  col += pool * (0.2 + 0.25 * luma(tint) * art);

  // Each tube's soft contact shadow on the board, cast away from the room light.
  float sd = neonTubeAt(fuv + L3.xy / L3.z * NEON_HEIGHT * px).r;
  col *= 1.0 - 0.65 * exp(-pow(max(sd - 0.4 * R, 0.0) / (0.75 * W), 2.0));

  // ---- The posts: small clear standoffs. A disc on the board with a soft shadow; once the
  // card tilts, the bit of post between the disc and the tube shows ----
  float footD = 1e4;
  float postD = 1e4;
  for (int i = 0; i < NEON_POSTS; i++) {
    if (float(i) >= uNeonInfo.w) break;
    vec2 F = uNeonPost[i];
    footD = min(footD, length(X - F));
    vec2 ab = -par;
    float u = clamp(dot(X - F, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    postD = min(postD, length(X - F - ab * u));
  }
  float footR = 0.4 * W;
  col *= 1.0 - 0.5 * exp(-pow(max(footD - footR * 0.6, 0.0) / (0.45 * W), 2.0));
  float post = 1.0 - smoothstep(footR - 1.0, footR + 1.0, postD);
  float prim = smoothstep(footR * 0.55, footR, postD);
  col = mix(col, col * 0.6 + pool * (0.12 + 0.35 * prim) + vec3(0.05) * prim, post * 0.9);

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
  // The last stretch at each end is painted out black where the electrodes sit.
  float fromEnd = min(near.x, len - near.x);
  float EL = min(1.3 * W, 0.06 * len);
  float paint = 1.0 - smoothstep(EL - 0.3 * W, EL + 0.3 * W, fromEnd);
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
  float halo = 0.28 * exp(-pow(hd / (0.55 * W), 2.0)) + 0.09 / (1.0 + pow(hd / (1.6 * W), 2.0));
  halo *= 1.0 - smoothstep(0.75 * NEON_REACH, NEON_REACH, d);
  // (Taken over the whole tube, ends too: the glow of the line between two tubes must not step.)
  col += gas * halo * neonPower(id) * on * has * mix(0.6, 1.0, art);

  // Lit glass: saturated gas color, darkening towards the edges as a cylinder does, with one
  // soft hot core about a third of its width.
  float cyl = sqrt(max(1.0 - x * x, 0.0));
  vec3 body = gas * (0.28 + 0.9 * cyl);
  float core = exp(-x * x / (2.0 * 0.3 * 0.3));
  vec3 hot = mix(gas, vec3(1.0), 0.62) * 1.25;
  vec3 tube = mix(body, hot, 0.85 * core) * glow;
  // Unlit glass (while it stutters): clear, with a trace of its colored coating.
  tube += (col * 0.45 + gas * 0.05 * cyl + vec3(0.025) * cyl) * (1.0 - min(glow * 1.5, 1.0)) * (1.0 - paint);
  // The painted ends: matt black.
  tube = mix(tube, vec3(0.016) * (0.5 + 0.5 * cyl), paint);
  // One specular streak on the side facing the room light; it slides across as the card tilts.
  vec3 H = normalize(L3 + vec3(0.0, 0.0, 1.0));
  float hA = dot(H.xy, nrm);
  float streak = exp(-pow((x - clamp(hA * 1.6, 0.18, 0.6)) / 0.1, 2.0)) * smoothstep(0.03, 0.12, hA);
  tube += vec3(0.9, 0.95, 1.0) * streak * mix(0.28, 0.2, paint);
  col = mix(col, tube, inTube);

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
