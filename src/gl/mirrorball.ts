// Mirror Ball: the card as the face of a disco ball, tiled with small square mirrors. The mirrors are
// drawn by the card shader (MIRRORBALL_GLSL, in the Light pack's program); the spots of light the ball
// throws round the stage are a pass of their own (MirrorRoom), drawn behind every card already on the
// canvas, only where there is a room to light (the stage, and an exported loop's backdrop); it lives
// in mirrorRoom.ts so this file stays plain data, tested under Node.

/** Card shader index of the finish. */
export const MIRRORBALL_SHADER = 104;

/** Cells of spots the ball turns by in a second. */
export const SPIN = 0.9;
/** Seconds of one shimmer of a spot. */
const TWINKLE = 1.6;

/** A whole number of shimmers per exported loop, so they come round seamlessly; TWINKLE live. */
export const twinkle = (loop: number): number => (loop > 0 ? loop / Math.max(1, Math.round(loop / TWINKLE)) : TWINKLE);

/** Share of a loop over which the spots of the lap ahead fade in. */
const FADE = 0.3;

/**
 * Where the turning spots stand in an exported loop: the seconds into the loop, and how far the
 * spots one loop back (the ones the loop starts with) have faded in. The ball turns on for good,
 * so the loop closes by handing over to the spots it began with near its end. Live: time, 0.
 */
export function roomLap(time: number, loop: number): [number, number] {
  if (loop <= 0) return [time, 0];
  const t = ((time % loop) + loop) % loop;
  const x = Math.min(1, Math.max(0, (t / loop - (1 - FADE)) / FADE));
  return [t, x * x * (3 - 2 * x)];
}

/** The mirrors, spliced into the card shader. `uv` is the pattern, `g0` the face uv the picture is read at. */
export const MIRRORBALL_GLSL = /* glsl */ `
// Mirror Ball. The card is the near face of a big ball: rows of small square mirrors run round it
// like lines of latitude, each row holding as many as fit, so the mirrors narrow and the rows
// stagger toward the edges as on a real ball. Every mirror is a flat little mirror set a touch
// askew: it shows the picture at its own brightness, and flashes in full when it throws a light
// straight at the eye (the white key light that follows the pointer, and three colored stage lights
// going round the ball). The brightest flashes throw a star.
float mbPeriod(float want) { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / want + 0.5)) : want; }
// Mirrors across the short side, at the middle of the card.
const float MB_N = 16.0;
// The ball's radius, card units: the corners sit about 60 degrees round it.
float mbRadius() { return 0.57 * length(uCardK); }
// The ball's surface under a point q of the card (card units from its centre), as a unit normal.
vec3 mbDome(vec2 q, float R) {
  q *= min(1.0, 0.97 * R / max(length(q), 1e-4));
  return vec3(q, sqrt(max(R * R - dot(q, q), 1e-4))) / R;
}
// A ring of mirrors: the longitude one spans, and how far the ring is turned (so the rows stagger).
vec2 mbRing(float row, float a) {
  float dl = a / max(cos((row + 0.5) * a), 0.1);
  return vec2(dl, hash12(vec2(row, 3.7)) * dl);
}
// A light going round the ball: k-th of three, in its color.
vec3 mbStage(int k, float turn, out vec3 col) {
  float fk = float(k);
  float an = 6.2831853 * (turn + fk / 3.0) * (k == 1 ? -1.0 : 1.0);
  float el = k == 0 ? 0.42 : k == 1 ? -0.3 : 0.12;
  col = k == 0 ? vec3(1.0, 0.36, 0.72) : k == 1 ? vec3(0.32, 0.82, 1.0) : vec3(1.0, 0.7, 0.32);
  return vec3(sin(an) * cos(el), sin(el), cos(an) * cos(el));
}
// Mirror (row, col): where its middle lies on the card, its soft sheen, and the light it throws to
// the eye (0 when it catches none).
vec3 mbMirror(float row, float col, vec2 ring, float a, float R, vec3 key, vec3 eye, float turn, float turn2, out vec2 at, out float sheen) {
  float lat = (row + 0.5) * a;
  float lon = (col + 0.5) * ring.x - ring.y;
  vec3 n = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  at = R * n.xy;
  vec3 v = normalize(eye - R * n);
  vec2 id = vec2(col, row);
  // No mirror sits quite true.
  n = normalize(n + (vec3(hash22(id + 7.3), hash12(id + 2.9)) - 0.5) * 0.17);
  vec3 r = reflect(-v, n);
  float d = dot(r, key);
  sheen = exp((d - 1.0) * 3.0);
  vec3 f = vec3(1.0, 0.97, 0.92) * exp((d - 1.0) * 120.0) * 1.3;
  for (int k = 0; k < 3; k++) {
    vec3 lc;
    vec3 l = mbStage(k, turn2, lc);
    f += lc * exp((dot(r, l) - 1.0) * 28.0) * 0.9;
  }
  // Now and then one lines up with a light for a moment as the ball turns.
  float ph = hash12(id + 13.0);
  f += vec3(1.0, 0.98, 0.95) * step(0.82, ph) * pow(0.5 + 0.5 * sin(ph * 61.0 + turn * 18.849556), 90.0);
  return f;
}

vec3 mirrorball(vec3 c, vec2 uv, vec2 g0, vec2 t, float lod, float art) {
  float R = mbRadius();
  float a = 1.0 / (R * MB_N);
  vec2 q = (uv - 0.5) * uCardK;
  // The eye, a little way in front; tilting the card swings it across.
  vec3 eye = vec3(-t * vec2(0.9, 0.8), R + 2.4);
  float turn = uTime / mbPeriod(12.0);
  float turn2 = uTime / mbPeriod(8.0);
  // The key light, placed so the mirror under the light point throws it straight at the eye.
  vec2 qL = (uLight - 0.5) * uCardK;
  vec3 nL = mbDome(qL, R);
  vec3 key = reflect(-normalize(eye - R * nL), nL);
  // Which mirror this is: the row by latitude, the mirror along its ring by longitude.
  vec3 n0 = mbDome(q, R);
  float fr = asin(clamp(n0.y, -1.0, 1.0)) / a;
  float lon = atan(n0.x, n0.z);
  float row = floor(fr);
  vec2 ring = mbRing(row, a);
  float fl = (lon + ring.y) / ring.x;
  float cix = floor(fl);
  vec2 f = vec2(fl - cix, fr - row) - 0.5;
  vec2 id = vec2(cix, row);
  // Its light, and the stars the brightest mirrors round about throw over it.
  vec3 own = vec3(0.0);
  float sheen = 0.0;
  vec3 glare = vec3(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    float r2 = row + float(dy);
    vec2 rg = mbRing(r2, a);
    float c0 = floor((lon + rg.y) / rg.x);
    for (int dx = -1; dx <= 1; dx++) {
      vec2 at;
      float sh;
      vec3 fl3 = mbMirror(r2, c0 + float(dx), rg, a, R, key, eye, turn, turn2, at, sh);
      if (dx == 0 && dy == 0) { own = fl3; sheen = sh; }
      float k = max(fl3.r, max(fl3.g, fl3.b));
      if (k < 0.8) continue;
      vec2 o = (q - at) / (R * a); // in mirrors
      float len = 3.4 * smoothstep(0.8, 1.3, k);
      float star = smoothstep(0.07, 0.0, abs(o.y)) * smoothstep(len, 0.0, abs(o.x)) + smoothstep(0.07, 0.0, abs(o.x)) * smoothstep(len, 0.0, abs(o.y));
      vec2 w = vec2(o.x + o.y, o.x - o.y) * 0.70710678;
      star += 0.6 * (smoothstep(0.06, 0.0, abs(w.y)) * smoothstep(len * 0.4, 0.0, abs(w.x)) + smoothstep(0.06, 0.0, abs(w.x)) * smoothstep(len * 0.4, 0.0, abs(w.y)));
      glare += mix(fl3 / k, vec3(1.0), 0.5) * (min(star, 1.2) + exp(-dot(o, o) * 2.2) * 0.22) * (k - 0.8) * 2.0;
    }
  }
  // The picture in this mirror, a touch askew; over the frame the mirrors are silvered paper.
  vec4 s = face(g0 + (hash22(id + 7.3) - 0.5) * 0.006 / uCardK * art, lod);
  vec3 pic = s.rgb / max(s.a, 1e-4);
  pic = mix(mix(vec3(luma(pic)) * vec3(0.95, 0.98, 1.04), pic, 0.55) + 0.03, pic, art);
  // Every mirror catches its own bit of the room: its own brightness, brighter toward the light, and
  // a faint slope across it.
  float h = hash12(id + 1.7);
  float tone = 0.52 + 0.55 * h * h + 0.55 * sheen;
  vec2 lean = normalize(key.xy + (hash22(id + 4.4) - 0.5) + 1e-3);
  vec3 mir = pic * tone * (0.92 + 0.22 * clamp(0.5 + dot(f, lean), 0.0, 1.0));
  mir = mix(mir, vec3(luma(mir)) * vec3(0.94, 0.98, 1.06) + 0.02, 0.14);
  // The ball curves away toward the edges: darker there, and the stage lights' colors wash over it.
  float rim = smoothstep(0.0, 0.5, 1.0 - n0.z);
  float side = atan(n0.x, n0.y) / 6.2831853 + turn2;
  vec3 wash = mix(vec3(1.0, 0.36, 0.72), vec3(0.32, 0.82, 1.0), 0.5 + 0.5 * sin(side * 6.2831853));
  mir = mir * (1.0 - rim * 0.5) + wash * rim * rim * (0.2 + 0.6 * hash12(id + 6.1)) * 0.7;
  // A mirror that throws a light at the eye floods with it.
  float k = max(own.r, max(own.g, own.b));
  mir = mix(mir, min(own / max(k, 1e-3), 1.0) * 1.05 + pic * 0.08, smoothstep(0.08, 1.0, k) * 0.88);
  // Dark grout between the mirrors, its lines thinning with the rows toward the edges; the cut
  // edge of each mirror catches the light on the side that faces it.
  vec2 aa = max(fwidth(vec2(fl, fr)), 1e-4);
  vec2 gm = smoothstep(0.43 - aa, 0.43 + aa * 0.5, abs(f));
  float grout = max(gm.x, gm.y);
  vec2 bm = smoothstep(0.33, 0.43, abs(f)) * (1.0 - gm);
  float lit = clamp(0.5 + dot(sign(f) * vec2(bm.x, bm.y), normalize(key.xy + 1e-3)), 0.0, 1.0);
  vec3 col = mir + vec3(0.95, 0.97, 1.0) * max(bm.x, bm.y) * lit * (0.12 + 0.5 * sheen);
  col = mix(col, pic * 0.1 + 0.012, grout * mix(0.75, 1.0, art));
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
uniform float uMbTime;    // seconds into the loop (roomLap); the clock live
uniform float uMbLoop;    // an exported loop's length, 0 live
uniform float uMbFade;    // how far the spots one loop back have faded in (roomLap)
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
// The spots at time tm, at a point of the wall seen from the ball at (lon, lat). Each cell of the
// wall holds at most one spot, kept inside it, so only the one cell is looked at.
vec3 mbSpots(vec2 ll, float tm) {
  vec2 G = ll / 0.11 + vec2(tm * uMbSpin, 0.0);
  vec2 cid = floor(G);
  if (mbHash(cid) > 0.72) return vec3(0.0);
  vec2 at = G - cid - (0.36 + 0.28 * mbHash2(cid + 4.1));
  // A cell spans less wall toward the top and bottom; the spots stay round.
  at.x *= cos(ll.y);
  float ph = mbHash(cid + 9.7);
  float tw = 0.7 + 0.3 * sin(6.2831853 * (tm / uMbTwinkle + ph));
  // A spot flares into a star as a mirror lines up: now and then, and as the tilt swings it.
  vec2 n = mbHash2(cid + 5.5) * 2.0 - 1.0;
  float flare = max(pow(0.5 + 0.5 * sin(dot(n, uMbTilt) * 4.0 + ph * 6.2831853), 12.0),
    step(0.86, mbHash(cid + 3.3)) * pow(0.5 + 0.5 * sin(6.2831853 * (tm / uMbTwinkle * 0.5 + ph)), 30.0));
  float hs = mbHash(cid + 2.3);
  float r = (0.09 + 0.1 * hs) * (1.0 + flare * 0.25);
  // Rounded squares: each spot is a little square mirror's image, a touch soft.
  vec2 aa = abs(at);
  float dist = pow(pow(aa.x, 4.0) + pow(aa.y, 4.0), 0.25);
  float core = smoothstep(r, r * 0.6, dist);
  float halo = exp(-length(at) / r * 2.2) * 0.35 * smoothstep(0.34, 0.2, length(at));
  float arm = 0.33 * flare;
  float cross = flare * (smoothstep(0.012, 0.0, aa.y) * smoothstep(arm, 0.0, aa.x) + smoothstep(0.012, 0.0, aa.x) * smoothstep(arm, 0.0, aa.y));
  // Spots come in patches of the stage lights' colors, as each light catches a stretch of the ball.
  float ht = mbHash(floor(cid / vec2(4.0, 3.0)) + 8.8);
  vec3 tint = ht < 0.5 ? vec3(1.0, 0.96, 0.9) : ht < 0.68 ? vec3(1.0, 0.5, 0.8) : ht < 0.86 ? vec3(0.45, 0.85, 1.0) : vec3(1.0, 0.78, 0.45);
  // A white-hot middle, the color toward the rim.
  tint = mix(tint, vec3(1.0), smoothstep(r * 0.7, r * 0.15, dist));
  return tint * (core + halo + cross) * (0.7 + 0.6 * mbHash(cid + 6.6)) * tw * (1.0 + flare * 0.8);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uMbRes.y * uMbDpr - gl_FragCoord.y) / uMbDpr;
  // In the backdrop's chunky pixels.
  px = (floor(px / 4.0) + 0.5) * 4.0;
  vec2 p = (px - uMbCenter) / uMbSize;
  p.y = -p.y;
  // A ray from the ball to this point of the back wall, a card's height behind it.
  vec3 dir = normalize(vec3(p, -0.9));
  // Tilting the card turns the ball, and a mirror swings its spot twice as far.
  vec2 ll = vec2(atan(dir.x, -dir.z) + uMbTilt.x * 0.55, asin(clamp(dir.y, -1.0, 1.0)) - uMbTilt.y * 0.45);
  vec3 acc = mbSpots(ll, uMbTime) * (1.0 - uMbFade);
  if (uMbFade > 0.0) acc += mbSpots(ll, uMbTime - uMbLoop) * uMbFade;
  acc *= uMbPower / (1.0 + dot(p, p) * 0.2);
  float a = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 0.95);
  o = vec4(acc / max(max(acc.r, max(acc.g, acc.b)), 1e-4) * a, a);
}
`;
