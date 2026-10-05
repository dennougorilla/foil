// Mirror Ball: the card tiled with small square mirrors, like a disco ball. The mirrors are drawn by
// the card shader (MIRRORBALL_GLSL, in the Light pack's program); the spots of light the ball throws
// round the stage are a pass of their own (MirrorRoom), drawn behind every card already on the
// canvas, only where there is a room to light (the stage, and an exported loop's backdrop); it lives
// in mirrorRoom.ts so this file stays plain data, tested under Node.

/** Card shader index of the finish. */
export const MIRRORBALL_SHADER = 104;

/** Cells of spots the ball turns by in a second on the stage. */
export const SPIN = 0.9;
/** Seconds of one shimmer of a spot. */
const TWINKLE = 1.6;

/** A whole number of cells per exported loop (at least one), so the spots come round seamlessly; SPIN live. */
export const roomSpin = (loop: number): number => (loop > 0 ? Math.max(1, Math.round(SPIN * loop)) / loop : SPIN);
export const twinkle = (loop: number): number => (loop > 0 ? loop / Math.max(1, Math.round(loop / TWINKLE)) : TWINKLE);

/** The mirrors, spliced into the card shader. `uv` is the pattern, `g` the face uv the picture is read at. */
export const MIRRORBALL_GLSL = /* glsl */ `
// Mirror Ball: small square mirrors in dark grout. Each faces its own way; the ones that face the
// light flash white, and two colored stage lights going round catch others.
float mbPeriod(float want) { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / want + 0.5)) : want; }

// How brightly the mirror of tile id flashes, in the color of the light it catches.
vec3 mbFlash(vec2 id, float N, vec2 t, float turn, float turn2) {
  vec2 j = hash22(id + 7.3) - 0.5;
  // Where it faces: across the ball, a little askew, and further with the tilt.
  vec2 a = (id + 0.5) / N * vec2(1.15, 0.95) + j * 0.24 + t * vec2(0.5, 0.42);
  // The ball turns: its face slides sideways and comes round again.
  vec2 d = a - (uLight - 0.5) * uCardK * 1.15;
  d.x = mod(d.x - turn * 1.8 + 0.9, 1.8) - 0.9;
  float sel = 0.55 + 0.7 * hash12(id + 3.1);
  float hit = exp(-dot(d, d) / 0.011) * sel;
  // Anywhere on the ball, a few mirrors line up with the light for a moment as it turns or tilts.
  vec2 n = hash22(id + 11.0) * 2.0 - 1.0;
  float glint = pow(0.5 + 0.5 * sin(dot(n, t) * 5.0 + hash12(id + 13.0) * 6.2831853 + turn * 12.5663706), 70.0);
  vec3 f = vec3(1.0, 0.98, 0.94) * smoothstep(0.4, 0.95, max(hit, glint));
  // Two stage lights, pink and cyan, sweep round the other way.
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float an = 6.2831853 * (turn2 + fk * 0.5);
    vec2 lp = vec2(cos(an) * 0.55, sin(an) * 0.4) * uCardK;
    vec2 e = a - lp;
    float w = exp(-dot(e, e) / 0.006) * (0.4 + 0.9 * hash12(id + 5.0 + fk));
    f += (k == 0 ? vec3(1.0, 0.45, 0.78) : vec3(0.4, 0.86, 1.0)) * smoothstep(0.45, 0.95, w) * 0.85;
  }
  return f;
}

vec3 mirrorball(vec3 c, vec2 uv, vec2 g0, vec2 t, float lod, float art) {
  float N = 15.0; // mirrors across the short side
  vec2 g = (uv - 0.5) * uCardK * N;
  vec2 id = floor(g);
  vec2 f = g - id - 0.5;
  float turn = uTime / mbPeriod(9.0);
  float turn2 = uTime / mbPeriod(6.0);
  vec2 j = hash22(id + 7.3) - 0.5;
  // Each mirror shows the picture a touch askew; the frame is bare silvered glass in its own color.
  vec4 s = face(g0 + j * 0.006 / uCardK * art, lod);
  vec3 pic = s.rgb / max(s.a, 1e-4);
  pic = mix(mix(vec3(0.5, 0.53, 0.6), pic, 0.3) + 0.06, pic, art);
  vec2 a = (id + 0.5) / N * vec2(1.15, 0.95) + j * 0.24 + t * vec2(0.5, 0.42);
  vec2 d = a - (uLight - 0.5) * uCardK * 1.15;
  d.x = mod(d.x - turn * 1.8 + 0.9, 1.8) - 0.9;
  float sheen = exp(-dot(d, d) / 0.12);
  // Every mirror sits at its own angle: its own brightness, and a little gradient of the room across it.
  float tone = 0.62 + 0.46 * hash12(id + 1.7) + 0.25 * sheen;
  vec2 lean = normalize(j + t * 0.4 + 1e-3);
  float grad = clamp(0.5 + dot(f, lean) * 1.1, 0.0, 1.0);
  vec3 mir = pic * tone * (0.82 + 0.36 * grad);
  mir = mix(mir, vec3(luma(mir)) * vec3(0.94, 0.98, 1.07) + 0.03, 0.2);
  // Dark grout between the mirrors; the cut edge of each catches the light on one side.
  float e = max(abs(f.x), abs(f.y));
  float grout = smoothstep(0.43, 0.46, e);
  float bevel = smoothstep(0.37, 0.43, e) * (1.0 - grout);
  float side = clamp(0.5 - (f.x + f.y) / max(e, 1e-3) * 0.5, 0.0, 1.0);
  vec3 col = mir + vec3(0.95, 0.97, 1.0) * bevel * side * 0.6 * sheen;
  col = mix(col, pic * 0.12 + 0.01, grout);
  // Flashing mirrors blaze, and throw a four-point glint over their neighbours.
  vec3 glare = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 nid = id + vec2(float(x), float(y));
      vec3 fl = mbFlash(nid, N, t, turn, turn2);
      float k = max(fl.r, max(fl.g, fl.b));
      if (k < 0.02) continue;
      vec2 o = g - (nid + 0.5);
      if (x == 0 && y == 0) col = mix(col, min(fl / k, 1.0), k * 0.9 * (1.0 - grout));
      float star = max(smoothstep(0.08, 0.0, abs(o.y)) * smoothstep(1.5, 0.15, abs(o.x)), smoothstep(0.08, 0.0, abs(o.x)) * smoothstep(1.5, 0.15, abs(o.y)));
      glare += fl * (star * smoothstep(0.45, 1.0, k) * 1.1 + exp(-dot(o, o) * 3.5) * 0.45);
    }
  }
  // The nameplate stays as printed under a faint coat of the mirrors, so the name reads.
  float plate = (1.0 - art) * step(uArt.w, g0.y);
  return mix(col, c, plate * 0.7) + glare;
}
`;

export const ROOM_VS = /* glsl */ `#version 300 es
in vec2 aMbPos;
void main() { gl_Position = vec4(aMbPos, 0.0, 1.0); }
`;

/** The spots of light round the stage. Every uniform is uMb…, apart from any other program's. */
export const ROOM_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uMbRes;      // canvas size, css px
uniform float uMbDpr;
uniform vec2 uMbCenter;   // the card's centre, css px (y down)
uniform float uMbSize;    // the card's height on screen, css px
uniform vec2 uMbTilt;
uniform float uMbTime;
uniform float uMbSpin;    // cells the ball turns by per second
uniform float uMbTwinkle; // seconds of one shimmer
uniform float uMbPower;
out vec4 o;
float mbHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 mbHash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uMbRes.y * uMbDpr - gl_FragCoord.y) / uMbDpr;
  // In the backdrop's chunky pixels.
  px = (floor(px / 4.0) + 0.5) * 4.0;
  vec2 p = (px - uMbCenter) / uMbSize;
  p.y = -p.y;
  // A ray from the ball to this point of the back wall, a card's height behind it.
  vec3 dir = normalize(vec3(p, -0.9));
  float lon = atan(dir.x, -dir.z);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  // Tilting the card turns the ball, and a mirror swings its spot twice as far.
  lon += uMbTilt.x * 0.55;
  lat -= uMbTilt.y * 0.45;
  vec2 G = vec2(lon, lat) / 0.13 + vec2(uMbTime * uMbSpin, 0.0);
  vec2 ip = floor(G);
  vec2 fp = G - ip;
  float squeeze = cos(lat);
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cid = ip + vec2(float(x), float(y));
      if (mbHash(cid) > 0.62) continue;
      vec2 at = vec2(float(x), float(y)) + 0.2 + 0.6 * mbHash2(cid + 4.1) - fp;
      at.x *= squeeze;
      float ph = mbHash(cid + 9.7);
      // Each spot shimmers, and flares when the tilt lines its mirror up with the light.
      float tw = 0.72 + 0.28 * sin(6.2831853 * (uMbTime / uMbTwinkle + ph));
      vec2 n = mbHash2(cid + 5.5) * 2.0 - 1.0;
      float flare = pow(0.5 + 0.5 * sin(dot(n, uMbTilt) * 4.0 + ph * 6.2831853), 10.0);
      float hs = mbHash(cid + 2.3);
      float r = (0.07 + 0.15 * hs * hs) * (1.0 + flare * 0.3);
      float dist = length(at);
      float core = smoothstep(r, r * 0.7, dist);
      float halo = exp(-dist / r * 2.0) * 0.3;
      float cross = flare * (smoothstep(0.06, 0.0, abs(at.y)) * smoothstep(r * 2.2, 0.0, abs(at.x)) + smoothstep(0.06, 0.0, abs(at.x)) * smoothstep(r * 2.2, 0.0, abs(at.y)));
      float ht = mbHash(cid + 8.8);
      vec3 tint = ht < 0.7 ? vec3(1.0, 0.97, 0.9) : ht < 0.8 ? vec3(1.0, 0.72, 0.86) : ht < 0.9 ? vec3(0.72, 0.9, 1.0) : vec3(1.0, 0.86, 0.6);
      // A white-hot middle, the color only at the rim.
      tint = mix(tint, vec3(1.0), smoothstep(r * 0.65, r * 0.2, dist));
      acc += tint * (core + halo + cross * 0.9) * (0.55 + 0.6 * mbHash(cid + 6.6)) * tw * (1.0 + flare * 0.7);
    }
  }
  acc *= uMbPower / (1.0 + dot(p, p) * 0.2);
  float a = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 0.95);
  o = vec4(acc / max(max(acc.r, max(acc.g, acc.b)), 1e-4) * a, a);
}
`;
