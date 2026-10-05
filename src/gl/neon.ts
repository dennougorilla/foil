// Neon: a sign bent from the picture's main outlines, hung in a dark room. Spliced into the card
// shader after the core helpers, so hash/luma/face are in scope.
//
// The tubes are laid out on the CPU from each new face (neonMap.ts): a few long outlines, smoothed
// into broad bends, each one glass tube of one gas, plus a tube round the art window. The shader
// draws them from two maps: the tube map (distance to the nearest tube, how far along it, which
// tube) and the wall map (the colored light all tubes pool on the wall behind them).
// Each tube: a white-hot core about a third of its width, saturated glass of its gas with a darker
// rim, a soft halo falling off as the inverse square, electrode caps at both ends and clips on
// posts that hold it off the wall. The wall is near black but for the light the tubes pool on it,
// in which the picture shows. The tubes stand off the wall: tilting slides them off their pools
// and shows their posts. Now and then one tube stutters, on cycles an exported loop holds a whole
// number of times; held still (uTime stays put) every tube is lit.
export const NEON_GLSL = /* glsl */ `
uniform sampler2D uNeonMap;   // r: distance to the nearest tube's centre line (face px), g: how far along that tube, b: which tube
uniform sampler2D uNeonWall;  // rgb: the light the tubes pool on the wall, a: the tube that lights it most
uniform vec3 uNeonGas[8];     // each tube's gas color
uniform float uNeonLen[8];    // each tube's length (face px)
uniform vec4 uNeonInfo;       // x: tube width (face px), y: how many tubes, z: the border tube (-1: none), w: how many posts
#define NEON_POSTS 40
#define NEON_POST_GAP 300.0
uniform vec2 uNeonPost[NEON_POSTS];  // where each post meets the wall (face px)

// The face in face pixels (a short side of 900).
#define NEON_FACE (uCardK * 900.0)

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

// Where a post holds the tube: x across, y along the tube from the nearest post (face px). Posts
// sit evenly along each tube (neonPosts in neonMap.ts puts them in uNeonPost).
vec2 neonPost(vec3 m) {
  int id = int(m.b + 0.5);
  float len = uNeonLen[clamp(id, 0, 7)];
  float n = max(2.0, floor(len / NEON_POST_GAP));
  float gap = len / n;
  return vec2(m.r, (fract(m.g / gap) - 0.5) * gap);
}

vec3 neonTubeAt(vec2 p) { return texture(uNeonMap, p).rgb; }
// The tube index without blending across the line between two tubes.
float neonIdAt(vec2 p) { return texelFetch(uNeonMap, ivec2(p * vec2(textureSize(uNeonMap, 0))), 0).b; }

// art is 1 in the art window; the frame is the darker board the sign is mounted on.
vec3 neon(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 fuv = tuneFaceUv(uv);
  vec2 px = 1.0 / NEON_FACE;
  float W = uNeonInfo.x;
  float R = 0.5 * W;
  // The tubes stand off the wall on posts: tilting slides them against the wall and the light they
  // pool on it, which stays where they are mounted.
  vec2 par = t * 54.0;
  vec2 tp = fuv + par * px;

  // ---- The wall: near black, lit by the colored light the tubes pool on it ----
  vec2 ws = vec2(textureSize(uNeonWall, 0));
  vec4 wm = texture(uNeonWall, fuv);
  float wid = texelFetch(uNeonWall, ivec2(fuv * ws), 0).a;
  vec3 pool = wm.rgb * (wid > -0.5 ? neonFlicker(int(wid + 0.5)) : 1.0);
  vec3 alb = pow(c, vec3(1.15));
  // A faint room light from the light's side; the frame a darker painted board.
  float room = 0.1 + 0.05 * exp(-pow(length((fuv - uLight) * uCardK) / 0.8, 2.0));
  float board = mix(0.5, 1.0, art);
  vec3 col = alb * vec3(0.92, 0.94, 1.04) * room * board;
  col += (alb * pool * 1.15 + pool * 0.03) * mix(0.25, 1.0, art);

  // ---- The posts: a round foot on the wall with a soft shadow round it, and the post itself,
  // a short dark rod from the foot to the tube, seen once the card tilts ----
  vec2 X = fuv * NEON_FACE;
  float footD = 1e4;
  float postD = 1e4;
  float postU = 0.0;
  for (int i = 0; i < NEON_POSTS; i++) {
    if (float(i) >= uNeonInfo.w) break;
    vec2 F = uNeonPost[i];
    footD = min(footD, length(X - F));
    vec2 ab = -par;
    float u = clamp(dot(X - F, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    float dd = length(X - F - ab * u);
    if (dd < postD) { postD = dd; postU = u; }
  }
  col *= 1.0 - 0.6 * exp(-footD * footD / (W * W * 0.9));
  float post = 1.0 - smoothstep(0.3 * W, 0.38 * W, postD);
  float foot = 1.0 - smoothstep(0.42 * W, 0.52 * W, footD);
  vec3 metal = vec3(0.1, 0.1, 0.11) + pool * 0.12;
  col = mix(col, metal * 0.8 + vec3(0.25) * (1.0 - smoothstep(0.3 * W, 0.45 * W, footD)) * 0.3, foot * 0.9);
  // The rod is a cylinder: a bright line down its middle catching the gas light.
  col = mix(col, metal + (pool * 0.3 + vec3(0.12)) * (1.0 - postD / (0.38 * W)), post * step(0.02, postU));

  // ---- The tube here ----
  vec3 tm = neonTubeAt(tp);
  float d = tm.r;
  float tid = neonIdAt(tp);
  int id = clamp(int(tid + 0.5), 0, 7);
  bool none = tid < -0.5 || uNeonInfo.y < 0.5;
  vec3 gas = uNeonGas[id];
  float len = uNeonLen[id];
  bool border = float(id) == uNeonInfo.z;
  float on = neonFlicker(id);
  // The gas is a little brighter near the electrode it starts from.
  float glow = (1.0 - (border ? 0.3 : 0.12) * clamp(tm.g / len, 0.0, 1.0)) * on;
  // Across the tube: x is 0 on its centre line and 1 at the glass; the normal points outwards.
  vec2 e = vec2(1.5, 0.0);
  vec2 grad = vec2(neonTubeAt(tp + e.xy * px).r - neonTubeAt(tp - e.xy * px).r, neonTubeAt(tp + e.yx * px).r - neonTubeAt(tp - e.yx * px).r);
  vec2 nrm = grad / max(length(grad), 1e-4);
  float x = d / R;
  float aa = max(fwidth(d) / R, 0.04);
  float inTube = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, x)) * (none ? 0.0 : 1.0);
  // Which side of the tube faces the room light (and turns as the card tilts).
  vec2 toLight = normalize((uLight - fuv) * uCardK * 2.0 + t * 1.2 + vec2(-0.35, -0.5));
  float facing = dot(nrm, toLight);

  // The halo in the air round the glass: inverse square, about 3–4 tube widths across.
  float h = max(d - R, 0.0) / (0.55 * W);
  float halo = (1.0 / (1.0 + h * h)) * (1.0 - smoothstep(2.6 * W, 4.2 * W, d)) * (none ? 0.0 : 1.0);
  col += gas * halo * 0.55 * glow * board;

  // Electrodes: the last stretch at each end is a metal sleeve in clear glass; the gas stops there.
  float fromEnd = min(tm.g, len - tm.g);
  float EL = 1.3 * W;
  float cap = 1.0 - smoothstep(EL - 1.0, EL + 1.0, fromEnd);
  // Clips round the tube at each post.
  vec2 tpst = neonPost(tm);
  float clip = (1.0 - smoothstep(0.24 * W, 0.34 * W, abs(tpst.y))) * (1.0 - cap);

  // Lit glass: white-hot core about 30% of the width, saturated gas, a darker rim at the glass.
  float core = 1.0 - smoothstep(0.16, 0.36, x);
  vec3 lit = gas * (1.25 - 0.35 * x * x);
  lit = mix(lit, gas * 0.82, smoothstep(0.72, 1.0, x));
  lit = mix(lit, vec3(1.0, 0.98, 0.95), core * 0.92);
  lit *= glow;
  // Unlit (while it stutters) the glass is pale with a trace of its colored coating.
  vec3 dead = vec3(0.16, 0.16, 0.18) + gas * 0.1 + col * 0.25;
  vec3 tube = mix(dead, lit, clamp(on * 1.1 - 0.05, 0.0, 1.0));
  // A thin reflection of the room on the side facing it.
  tube += vec3(0.9, 0.94, 1.0) * exp(-pow((x - 0.62) / 0.09, 2.0)) * max(facing, 0.0) * 0.45;
  // The electrode: dark grey metal with a bright line along it, a dark ring where the gas starts.
  float lit2 = max(facing, 0.0);
  vec3 sleeve = vec3(0.26, 0.26, 0.28) * (0.55 + 0.45 * (1.0 - x * x)) + vec3(0.85) * exp(-pow((x - 0.5) / 0.14, 2.0)) * (0.25 + 0.6 * lit2);
  sleeve += gas * 0.2 * glow;
  tube = mix(tube, sleeve, cap);
  tube *= 1.0 - 0.6 * exp(-pow((fromEnd - EL) / 1.6, 2.0)) * (1.0 - cap);
  // The clip: a band of dark metal a little wider than the tube, with a bright edge.
  vec3 clipCol = vec3(0.16, 0.16, 0.18) + vec3(0.7) * exp(-pow((tpst.y + 0.12 * W) / (0.07 * W), 2.0)) * (0.3 + 0.7 * lit2);
  float clipIn = clip * (1.0 - smoothstep(1.12 - aa, 1.12 + aa, x));
  col = mix(col, tube, inTube);
  col = mix(col, clipCol, clipIn * 0.95 * (none ? 0.0 : 1.0));

  // The name and the pips on the frame are lit as thin neon lettering: wherever the print is
  // darker than the paper round it, in the border tube's gas.
  vec3 letters = uNeonInfo.z > -0.5 ? uNeonGas[int(uNeonInfo.z)] : uNeonInfo.y > 0.5 ? uNeonGas[0] : vec3(1.0, 0.2, 0.62);
  float ink = (1.0 - art) * smoothstep(0.08, 0.24, luma(face(uv, 3.0).rgb) - L);
  col = mix(col, mix(letters, vec3(1.0), 0.55), ink);
  col += letters * smoothstep(0.03, 0.2, luma(face(uv, 4.0).rgb) - luma(face(uv, 1.0).rgb)) * (1.0 - art) * 0.4;
  return col;
}
`;
