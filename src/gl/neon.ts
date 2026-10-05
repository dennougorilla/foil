// Neon: a sign bent from the picture's main outlines, hung in a dark room. Spliced into the card
// shader after the core helpers, so hash/luma/face are in scope.
//
// The tubes are laid out on the CPU from each new face (neonMap.ts): a few long outlines, smoothed
// into broad bends, each one glass tube of one gas, plus a tube round the art window. The shader
// draws them from two maps: the tube map (distance to the nearest tube, how far along it, which
// tube) and the wall map (the colored light all tubes pool on the wall behind them).
// Each tube: a thick body of saturated glass with a narrow cream-hot core, a darker rim and one
// sharp reflection along the side facing the room; a tight bright halo in the air round it and a
// wide soft one; clear electrode sleeves at both ends. Short clear standoffs hold it off the wall,
// seen as small discs with a contact shadow. The wall is near black but for the light the tubes
// pool on it, in which the picture shows. The tubes stand a little off the wall: tilting slides
// them a few pixels against their pools and posts. Now and then one tube stutters, on cycles an
// exported loop holds a whole number of times; held still (uTime stays put) every tube is lit.
export const NEON_GLSL = /* glsl */ `
uniform sampler2D uNeonMap;   // r: distance to the nearest tube's centre line (face px), g: how far along that tube, b: which tube
uniform sampler2D uNeonWall;  // rgb: the light the tubes pool on the wall, a: the tube that lights it most
uniform vec3 uNeonGas[8];     // each tube's gas color
uniform float uNeonLen[8];    // each tube's length (face px)
uniform vec4 uNeonInfo;       // x: tube width (face px), y: how many tubes, z: the border tube (-1: none), w: how many posts
#define NEON_POSTS 40
uniform vec2 uNeonPost[NEON_POSTS];  // where each post meets the wall (face px)

// The face in face pixels (a short side of 900).
#define NEON_FACE (uCardK * 900.0)
// How far the tubes stand off the wall, as face px of slide at full tilt.
#define NEON_STANDOFF 16.0
// The border tube burns at this share of the picture's tubes, so it frames rather than leads.
#define NEON_BORDER_DIM 0.62
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

vec3 neonTubeAt(vec2 p) { return texture(uNeonMap, p).rgb; }
// The tube index without blending across the line between two tubes.
float neonIdAt(vec2 p) { return texelFetch(uNeonMap, ivec2(p * vec2(textureSize(uNeonMap, 0))), 0).b; }

// art is 1 in the art window; the frame is the darker board the sign is mounted on.
vec3 neon(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 fuv = tuneFaceUv(uv);
  vec2 px = 1.0 / NEON_FACE;
  float W = uNeonInfo.x;
  float R = 0.5 * W;
  // The tubes stand off the wall on short posts: tilting slides them a little against the wall
  // and the light they pool on it, which stays where they are mounted.
  vec2 par = t * NEON_STANDOFF;
  vec2 tp = fuv + par * px;
  vec2 X = fuv * NEON_FACE;

  // ---- The wall: near black, lit by the colored light the tubes pool on it ----
  vec2 ws = vec2(textureSize(uNeonWall, 0));
  vec4 wm = texture(uNeonWall, fuv);
  float wid = texelFetch(uNeonWall, ivec2(fuv * ws), 0).a;
  vec3 pool = wm.rgb * (wid > -0.5 ? neonFlicker(int(wid + 0.5)) : 1.0);
  vec3 alb = pow(c, vec3(1.2));
  // A faint room light from the light's side; the frame a darker painted board.
  float room = 0.035 + 0.025 * exp(-pow(length((fuv - uLight) * uCardK) / 0.7, 2.0));
  float board = mix(0.55, 1.0, art);
  vec3 col = alb * vec3(0.9, 0.94, 1.06) * room * board;
  // The picture shows where tube light falls on it; the light itself tints the wall a little.
  vec3 fall = pool * pool / (pool + 0.25);
  col += (alb * fall * 1.9 + pool * 0.035) * mix(0.3, 1.0, art);

  // ---- The posts: short clear glass standoffs. A small disc on the wall with a soft contact
  // shadow; once the card tilts, the bit of post between the disc and the tube shows ----
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
  float footR = 0.42 * W;
  col *= 1.0 - 0.55 * exp(-pow(max(footD - footR * 0.6, 0.0) / (0.5 * W), 2.0));
  float post = 1.0 - smoothstep(footR - 1.0, footR + 1.0, postD);
  // Clear glass: dark where it shows the wall, a lit rim and a spark of the gas light it carries.
  float rim = smoothstep(footR * 0.55, footR, postD);
  vec3 glassPost = col * 0.6 + pool * (0.1 + 0.35 * rim) + vec3(0.06) * rim;
  col = mix(col, glassPost, post * 0.9);

  // ---- The tube here ----
  vec3 tm = neonTubeAt(tp);
  float d = tm.r;
  float tid = neonIdAt(tp);
  int id = clamp(int(tid + 0.5), 0, 7);
  bool none = tid < -0.5 || uNeonInfo.y < 0.5;
  float has = none ? 0.0 : 1.0;
  vec3 gas = uNeonGas[id];
  float len = uNeonLen[id];
  bool border = float(id) == uNeonInfo.z;
  float on = neonFlicker(id);
  // The gas is a little brighter near the electrode it starts from; the border burns lower.
  float glow = (1.0 - 0.12 * clamp(tm.g / len, 0.0, 1.0)) * on * (border ? NEON_BORDER_DIM : 1.0);
  // Across the tube: x is 0 on its centre line and 1 at the glass; the normal points outwards.
  vec2 e = vec2(1.5, 0.0);
  vec2 grad = vec2(neonTubeAt(tp + e.xy * px).r - neonTubeAt(tp - e.xy * px).r, neonTubeAt(tp + e.yx * px).r - neonTubeAt(tp - e.yx * px).r);
  vec2 nrm = grad / max(length(grad), 1e-4);
  float x = d / R;
  float aa = max(fwidth(d) / R, 0.04);
  float inTube = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, x)) * has;
  // Which side of the tube faces the room light (and turns as the card tilts).
  vec2 toLight = normalize((uLight - fuv) * uCardK * 2.0 + t * 1.2 + vec2(-0.35, -0.5));
  float facing = dot(nrm, toLight);

  // Two halos in the air round the glass: a tight bright one hugging the tube, and a wide, faint
  // one spilling far out (the pool on the wall carries the rest).
  float hd = max(d - R, 0.0);
  float tight = exp(-pow(hd / (0.32 * W), 2.0)) * 0.5 + 0.22 / (1.0 + pow(hd / (0.45 * W), 2.0));
  float wide = 0.1 / (1.0 + pow(hd / (2.2 * W), 2.0)) * (1.0 - smoothstep(0.75 * NEON_REACH, NEON_REACH, d));
  col += gas * (tight + wide) * glow * board * has;

  // Electrodes: the last stretch at each end is a metal sleeve in clear glass; the gas stops there.
  float fromEnd = min(tm.g, len - tm.g);
  float EL = 1.1 * W;
  float cap = 1.0 - smoothstep(EL - 1.0, EL + 1.0, fromEnd);

  // Lit glass: a thick body of the gas's saturated color, brightest towards the middle, with a
  // narrow cream-hot core (about 15 % of the width) and a darker rim where the glass turns away.
  vec3 cream = vec3(1.0, 0.95, 0.82);
  vec3 lit = gas * (1.18 - 0.4 * x * x);
  lit = mix(lit, mix(gas, cream, 0.5) * 1.15, 0.45 * (1.0 - smoothstep(0.12, 0.42, x)));
  lit = mix(lit, cream, 0.95 * (1.0 - smoothstep(0.1, 0.26, x)));
  lit *= mix(1.0, 0.78, smoothstep(0.72, 1.0, x));
  lit *= glow;
  // Unlit (while it stutters) the glass is pale with a trace of its colored coating.
  vec3 dead = vec3(0.12, 0.12, 0.14) + gas * 0.08 + col * 0.25;
  vec3 tube = mix(dead, lit, clamp(on * 1.1 - 0.05, 0.0, 1.0));
  // One sharp, narrow reflection of the room along the side facing it; the far side a shade darker.
  float hiA = exp(-pow((x - 0.6) / 0.08, 2.0));
  tube += vec3(0.95, 0.97, 1.0) * hiA * 0.5 * smoothstep(0.15, 0.6, facing);
  tube *= 1.0 - 0.18 * x * smoothstep(0.0, 0.7, -facing);
  // The electrode: dark grey metal with a bright line along it, a dark ring where the gas starts.
  float lit2 = max(facing, 0.0);
  vec3 sleeve = vec3(0.22, 0.22, 0.24) * (0.55 + 0.45 * (1.0 - x * x)) + vec3(0.85) * exp(-pow((x - 0.5) / 0.12, 2.0)) * (0.2 + 0.6 * lit2);
  sleeve += gas * 0.25 * glow;
  tube = mix(tube, sleeve, cap);
  tube *= 1.0 - 0.55 * exp(-pow((fromEnd - EL) / 1.6, 2.0)) * (1.0 - cap);
  col = mix(col, tube, inTube);

  // The name and the pips on the frame are lit as thin neon lettering: wherever the print is
  // darker than the paper round it, in the border tube's gas. Only clear of the art window and
  // the border tube, so the window's edge never becomes a second line.
  vec2 a0 = uArt.xy * NEON_FACE;
  vec2 a1 = uArt.zw * NEON_FACE;
  vec2 out2 = max(a0 - uv * NEON_FACE, uv * NEON_FACE - a1);
  float clear = smoothstep(0.024 * 900.0 + 0.8 * W, 0.024 * 900.0 + 1.3 * W, max(out2.x, out2.y));
  vec3 letters = uNeonInfo.z > -0.5 ? uNeonGas[int(uNeonInfo.z)] : uNeonInfo.y > 0.5 ? uNeonGas[0] : vec3(1.0, 0.2, 0.62);
  float ink = (1.0 - art) * clear * smoothstep(0.08, 0.24, luma(face(uv, 3.0).rgb) - L);
  col = mix(col, mix(letters, vec3(1.0), 0.45) * 0.85, ink);
  col += letters * smoothstep(0.03, 0.2, luma(face(uv, 4.0).rgb) - luma(face(uv, 1.0).rgb)) * (1.0 - art) * clear * 0.3;
  return col;
}
`;
