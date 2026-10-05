// Mirror Ball: the card's art window as the face of a disco ball, tiled with small square mirrors in a
// chrome frame. The mirrors are drawn by the card shader (MIRRORBALL_GLSL, in the Light pack's
// program); the spots of light the ball throws round the stage are a pass of their own (MirrorRoom),
// drawn behind every card already on the canvas, only where there is a room to light (the stage, and
// an exported loop's backdrop); it lives in mirrorRoom.ts so this file stays plain data, tested under
// Node.

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
// Mirror Ball. The art window looks onto a ball covered in small square mirrors set in dark grout,
// a touch bigger than the window, so it bulges past the middles of its edges and curves away inside
// the corners, where the dim wall behind it shows. The mirrors run in rows of latitude, and as many
// as fit along each, so they foreshorten toward the rim like a real ball's. Each mirror is a flat
// mirror set a touch askew: it reflects its own spot of a dark room (a stage, warm below and cool
// above, colored light bars overhead and a bright window, turning slowly as the ball turns), with a
// hard split across it where an edge of the room falls, and it is tinted by the picture behind it,
// so the picture reads under the reflections. The ball is lit from the light point: the far side
// falls into shadow, the rim to near black with a thin colored rim light right at the edge, and only
// the mirror under the light and a few round it throw the light straight at the eye, the brightest
// with a star, grading through cream round them. Colored spotlights add their color where they
// catch. The frame around it is polished chrome.
float mbPeriod(float want) { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / want + 0.5)) : want; }
// Mirrors across the art window's short side, at the middle of the ball.
const float MB_N = 17.0;
// The ball's radius over the art window's half size.
const float MB_R = 1.12;
// How far a row is turned, in mirrors, so the rows stagger.
float mbOff(float row) { return hash12(vec2(row, 3.7)); }
// The mirror under point p of the ball's disc (radius 1; D is a mirror's angle each way at the
// middle): its (col, row), the normal at its middle nc, where p falls in it (f, -0.5..0.5 each way)
// and p's own (longitude, latitude) on the ball.
vec2 mbTile(vec2 p, vec2 D, out vec3 nc, out vec2 f, out vec2 ll) {
  vec2 pc = p / max(1.0, length(p));
  float z = sqrt(max(1.0 - dot(pc, pc), 0.0));
  ll = vec2(atan(pc.x, max(z, 1e-5)), asin(clamp(pc.y, -1.0, 1.0)));
  float fr = ll.y / D.y + 0.5;
  float row = floor(fr);
  float latC = row * D.y;
  float cl = cos(latC);
  float fl = ll.x * cl / D.x + mbOff(row);
  float col = floor(fl);
  float lonC = (col + 0.5 - mbOff(row)) * D.x / cl;
  nc = vec3(cl * sin(lonC), sin(latC), cl * cos(lonC));
  f = vec2(fl - col, fr - row) - 0.5;
  return vec2(col, row);
}
// A mirror's own face: its middle's normal set a touch askew, rocking a little as the ball turns.
vec3 mbAskew(vec3 nc, vec2 id, float turn) {
  float ph = hash12(id + 13.0);
  vec2 rock = vec2(sin(6.2831853 * (turn * 2.0 + ph)), cos(6.2831853 * (turn * 2.0 + ph * 1.7)));
  return normalize(nc + vec3((hash22(id + 7.3) - 0.5) * 0.14 + rock * 0.012, 0.0));
}
// The room the mirrors reflect, looking along r: a dark stage, warm below and cool above, a band of
// light along the far wall, a ring of colored light bars overhead and a bright window with mullions.
// It repeats three times round and turns a third of the way round in one turn of the ball, so it
// comes round seamlessly. Gray and low key, so the picture keeps its say.
vec3 mbRoom(vec3 r, float turn) {
  float el = r.y;
  float u = atan(r.x, r.z) * 0.47746483 + turn; // thirds of the way round
  vec3 col = mix(vec3(0.03, 0.026, 0.03), vec3(0.06, 0.064, 0.08), smoothstep(-0.3, 0.4, el));
  col += vec3(0.15, 0.12, 0.13) * exp(-el * el * 30.0) * (0.6 + 0.4 * sin(u * 18.849556));
  // The window: a tall pane of cool daylight with a cross of mullions.
  vec2 wq = vec2(fract(u) - 0.5, el - 0.3) / vec2(0.13, 0.2);
  vec2 wa = abs(wq);
  float pane = step(max(wa.x, wa.y), 1.0) * step(0.07, wa.x) * step(0.08, wa.y);
  col += vec3(0.6, 0.64, 0.7) * pane * (0.65 + 0.35 * smoothstep(1.0, -1.0, wq.y));
  // The light bars: nine round the room, pink, cyan and amber in turn, softened toward gray.
  float s = u * 3.0;
  float k = mod(floor(s), 3.0);
  vec3 bc = k < 0.5 ? vec3(1.0, 0.42, 0.72) : k < 1.5 ? vec3(0.36, 0.78, 1.0) : vec3(1.0, 0.74, 0.4);
  float bar = step(abs(fract(s) - 0.5), 0.3) * step(abs(el - 0.7), 0.045);
  col += mix(bc, vec3(0.9), 0.3) * bar * 0.85;
  return col;
}
// A star at o (card units from its middle): four long rays along the rows and up and down, thick at
// the middle and tapering to a point, four short diagonal ones, and a soft bloom that spills over
// the grout. s0 is a mirror, px a pixel, in card units; h its strength.
float mbStar(vec2 o, float h, float s0, float px) {
  o /= s0;
  float th = px / s0;
  float len = 2.2 + 2.6 * h;
  vec2 a = abs(o);
  vec2 k = max(1.0 - a / len, 0.0); // how far along the rays across and up, 1 at the middle
  vec2 w = 0.14 * k;                // their half width, tapering
  float ray = k.x * k.x * smoothstep(w.x + th, max(w.x - th, 0.0), a.y)
    + k.y * k.y * smoothstep(w.y + th, max(w.y - th, 0.0), a.x);
  vec2 d = abs(vec2(o.x + o.y, o.x - o.y)) * 0.70710678;
  vec2 kd = max(1.0 - d / (len * 0.4), 0.0);
  ray += 0.55 * (kd.x * kd.x * smoothstep(0.09 * kd.x + th, 0.0, d.y) + kd.y * kd.y * smoothstep(0.09 * kd.y + th, 0.0, d.x));
  float r2 = dot(o, o);
  return (min(ray, 1.2) + exp(-r2 * 0.7) * 0.4 + exp(-r2 * 5.0) * 0.6) * h;
}
// Spotlight k of three, in its color: the way it shines, aimed so it catches a patch of the ball
// (p, on its disc) that drifts slowly and shifts as the card tilts.
vec3 mbSpot(int k, float turn, vec2 t, vec3 eye, vec2 Rb, out vec3 col) {
  float w = 6.2831853 * (turn + float(k) / 3.0);
  vec2 s = k == 0 ? vec2(-0.5, -0.42) : k == 1 ? vec2(0.52, 0.05) : vec2(-0.25, 0.5);
  s += 0.16 * vec2(sin(w), cos(w)) * (k == 1 ? -1.0 : 1.0) - t * 0.2;
  col = k == 0 ? vec3(1.0, 0.3, 0.66) : k == 1 ? vec3(0.25, 0.7, 1.0) : vec3(1.0, 0.62, 0.25);
  vec3 n = vec3(s, sqrt(max(1.0 - dot(s, s), 0.0)));
  return reflect(-normalize(eye - vec3(s * Rb, 0.0)), n);
}
// The frame: polished chrome, brushed along each side, reflecting a studio (bright above, a dark
// horizon, a softer floor) that slides as the card tilts, with one specular streak across it.
vec3 mbChrome(vec3 c, vec2 uv, vec2 t) {
  vec2 p = (uv - 0.5) * uCardK;
  vec2 out2 = max(uArt.xy - uv, uv - uArt.zw) * uCardK; // how far outside the art window, each way
  float side = step(out2.y, out2.x);
  float grain = vnoise(mix(vec2(p.x * 4.0, p.y * 170.0), vec2(p.x * 170.0, p.y * 4.0), side));
  float s = p.y * 1.1 - p.x * 0.3 + t.y * 0.45 + t.x * 0.15;
  float env = 0.52 + 0.42 * sin(s * 3.6 - 0.4) + 0.14 * sin(s * 8.5 + 1.1);
  vec3 col = mix(vec3(0.13, 0.14, 0.17), vec3(0.93, 0.95, 0.99), clamp(env, 0.0, 1.0));
  float d = dot(p, vec2(0.83, 0.55)) - 0.15 + t.x * 0.55 + t.y * 0.35;
  col += vec3(1.0, 0.99, 0.97) * exp(-d * d * 260.0) * 0.7;
  col *= 0.93 + 0.14 * grain;
  // A hint of the frame's own color.
  col *= mix(vec3(1.0), c / max(max(c.r, max(c.g, c.b)), 0.05), 0.15);
  // A dark lip where it meets the mirrors, and a bright line just outside it.
  float e = max(out2.x, out2.y);
  col *= mix(0.3, 1.0, smoothstep(0.0, 0.01, e));
  col += 0.3 * smoothstep(0.01, 0.014, e) * smoothstep(0.019, 0.014, e);
  return col;
}

vec3 mirrorball(vec3 c, vec2 uv, vec2 g0, vec2 t, float lod, float art) {
  vec2 mid = (uArt.xy + uArt.zw) * 0.5;
  vec2 H = (uArt.zw - uArt.xy) * 0.5 * uCardK;
  // The ball's radii, card units: rounder than the window, so it reads as a ball, not a lozenge.
  vec2 Rb = vec2(mix(H.x, H.y, 0.35), H.y) * MB_R;
  float s0 = 2.0 * min(H.x, H.y) / MB_N; // a mirror at the middle, card units
  vec2 D = s0 / Rb;                      // its angle each way
  vec2 q = (uv - mid) * uCardK;
  vec2 p = q / Rb;
  float rad = length(p);
  float aaR = max(fwidth(rad), 1e-4);
  float px = length(fwidth(q)) * 0.70710678;
  // The eye, a little way in front; tilting the card swings it across.
  vec3 eye = vec3(-t * vec2(0.9, 0.8), 2.6);
  float turn = uTime / mbPeriod(12.0);
  // This mirror.
  vec3 nc;
  vec2 f, ll;
  vec2 id = mbTile(p, D, nc, f, ll);
  vec2 at = nc.xy * Rb; // its middle, card units
  vec3 r = reflect(-normalize(eye - vec3(at, 0.0)), mbAskew(nc, id, turn));
  // The key light: the mirror under the light point throws it straight at the eye.
  vec2 wL = (uLight - mid) * uCardK / Rb;
  wL *= min(1.0, 0.72 / max(length(wL), 1e-4));
  vec3 nk;
  vec2 fk, lk;
  vec2 idK = mbTile(wL, D, nk, fk, lk);
  vec2 atK = nk.xy * Rb;
  vec3 key = reflect(-normalize(eye - vec3(atK, 0.0)), mbAskew(nk, idK, turn));
  vec3 Ld = normalize(vec3(wL, 0.75)); // where the key light comes from, for the ball's shading
  // Now and then a mirror elsewhere lines up with a lamp for a moment and throws a small star.
  float ep = turn * 4.0;
  vec2 pG = (hash22(vec2(floor(ep), 3.1)) - 0.5) * 1.3;
  vec3 nG;
  vec2 fG, lG;
  vec2 idG = mbTile(pG, D, nG, fG, lG);
  float hG = pow(sin(3.1415927 * fract(ep)), 6.0) * 0.6 * smoothstep(0.5, 0.8, nG.z);
  // The picture: in a mirror as one tone, read once at its middle; on the wall behind as it is.
  bool onBall = rad < 1.0;
  vec2 atUv = onBall ? mid + at / uCardK : uv;
  vec4 sp = face(g0 + atUv - uv, onBall ? max(lod, log2(s0 * uFaceTexels / uCardK.x) - 1.0) : lod);
  vec3 pic = sp.rgb / max(sp.a, 1e-4);
  // What the mirror reflects, across it: the room, swung a little from one side of the mirror to
  // the other, so an edge of the room falls across it as a hard split.
  vec3 rp = normalize(r + vec3(f.x, -f.y, 0.0) * 0.3);
  vec3 env = mbRoom(rp, turn);
  float L = luma(env);
  float tone = 0.82 + 0.36 * hash12(id + 1.7);
  vec3 mir = pic * (0.32 + 1.1 * L) * tone + env * 0.5;
  // A diagonal sheen: one side of the glass catches a brighter spot than the other, split hard.
  vec2 toL = normalize(atK - at + vec2(1e-4, 0.0));
  float sd = dot(f, toL) + 0.35 * (hash12(id + 4.4) - 0.5) + 0.12 * sin(6.2831853 * (turn + hash12(id + 9.1))) + 0.15 * (t.x - t.y);
  vec2 fw = max(vec2(fwidth(ll.x * cos(ll.y) / D.x), fwidth(ll.y / D.y)), 1e-4);
  float sa = 0.12 + 0.3 * hash12(id + 2.2);
  float sheen = mix(1.0 - sa * 0.6, 1.0 + sa * 1.2, smoothstep(-fw.x, fw.x, sd));
  mir *= sheen;
  // The ball's shading: its far side in shadow and the rim falling to near black.
  float lit = 0.3 + 0.7 * smoothstep(-0.25, 0.75, dot(nc, Ld));
  mir *= lit * smoothstep(0.02, 0.6, nc.z);
  // The colored spotlights add their color where they catch, flashing in the mirrors that line up.
  for (int k = 0; k < 3; k++) {
    vec3 lc;
    vec3 l = mbSpot(k, turn, t, eye, Rb, lc);
    float dk = dot(r, l);
    mir += lc * (exp((dk - 1.0) * 7.0) * (0.06 + 0.35 * L + 0.15 * luma(pic)) + smoothstep(0.987, 0.997, dk) * 0.6 * sheen);
  }
  // Round the key light the mirrors grade through warm cream; two to four throw it at the eye in
  // full, and the one under the light point, and a passing glint, flood white.
  float hk = dot(r, key);
  mir += vec3(1.0, 0.84, 0.62) * exp((hk - 1.0) * 28.0) * 0.6;
  float hot = max(smoothstep(0.988, 0.997, hk), float(id == idK));
  hot = max(hot, float(id == idG) * hG * 1.6);
  mir = mix(mir, vec3(1.06, 1.04, 1.0), clamp(hot, 0.0, 1.0));
  // Grout: near black, widening toward the rim as the mirrors turn away; where the mirrors get
  // too small to show it, its share of them.
  float hw = mix(0.35, 0.44, smoothstep(0.1, 0.8, nc.z));
  vec2 ein = (hw - abs(f)) / fw;
  float inside = clamp(ein.x + 0.5, 0.0, 1.0) * clamp(ein.y + 0.5, 0.0, 1.0);
  inside = mix(inside, 4.0 * hw * hw, smoothstep(0.25, 0.6, max(fw.x, fw.y)));
  // A bright mirror's cut edge toward the light catches a one-pixel line.
  vec2 facing = step(0.0, f * toL);
  float bevel = max(facing.x * (1.0 - smoothstep(0.5, 1.5, ein.x)), facing.y * (1.0 - smoothstep(0.5, 1.5, ein.y)));
  vec3 ball = mix(mir, vec3(1.0), bevel * smoothstep(0.35, 0.8, luma(mir)) * 0.5);
  ball = mix(vec3(0.006, 0.006, 0.01) + pic * 0.015, ball, inside);
  // The rim light: a thin line of stage color right at the edge, strongest on the shadow side.
  float ang = atan(p.y, p.x);
  vec3 rimc = mix(vec3(1.0, 0.34, 0.7), vec3(0.3, 0.8, 1.0), 0.5 + 0.5 * sin(ang + 6.2831853 * turn));
  float rimw = smoothstep(0.86, 0.985, rad) * (0.45 + 0.55 * smoothstep(0.3, -0.6, dot(p / max(rad, 1e-4), normalize(wL + vec2(1e-4, 0.0)))));
  ball += rimc * rimw * (0.25 + 0.75 * inside) * 0.9;
  // The wall behind, in the corners: the picture, dim, darkest in the ball's shadow.
  vec3 wall = pic * 0.34 * (1.0 - 0.75 * exp(-(rad - 1.0) * 12.0));
  vec3 col = mix(wall, ball, smoothstep(1.0 + aaR, 1.0 - aaR, rad));
  // The stars: the mirror under the light point, and a passing glint.
  float glare = mbStar(q - atK, 0.9 + 0.1 * sin(6.2831853 * turn * 4.0), s0, px) + mbStar(q - nG.xy * Rb, hG, s0, px);
  vec3 glw = vec3(1.0, 0.95, 0.86) * glare;
  // The frame is chrome; the nameplate keeps only a faint coat of it, so the name reads.
  vec3 chrome = mbChrome(c, uv, t);
  chrome = mix(chrome, c, (1.0 - art) * step(uArt.w, g0.y) * 0.8);
  return mix(chrome + glw * 0.6, col + glw, art);
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
// Smooth noise over the cells, for the clusters.
float mbNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mbHash(i), mbHash(i + vec2(1.0, 0.0)), f.x), mix(mbHash(i + vec2(0.0, 1.0)), mbHash(i + 1.0), f.x), f.y);
}
// The spots at time tm, at a point of the wall seen from the ball at (lon, lat). Each cell of the
// wall holds at most one spot, kept inside it, so only the one cell is looked at. The cells run
// round the ball in rows of latitude, so as it turns the spots sweep along arcs together. They
// come in clusters, each thrown by one spotlight catching a patch of the ball (pink, cyan or
// amber), with dark stretches of wall between.
vec3 mbSpots(vec2 ll, float tm) {
  vec2 G = ll / 0.085 + vec2(tm * uMbSpin, 0.0);
  vec2 cell = max(fwidth(G), 1e-5); // a device pixel, in cells
  vec2 cid = floor(G);
  float dens = smoothstep(0.42, 0.78, mbNoise(cid / vec2(6.0, 3.5)));
  if (mbHash(cid) > dens * 0.8) return vec3(0.0);
  // The spot, from its middle, in device pixels.
  vec2 at = (G - cid - (0.3 + 0.4 * mbHash2(cid + 4.1))) / cell;
  float ph = mbHash(cid + 9.7);
  float tw = 0.75 + 0.25 * sin(6.2831853 * (tm / uMbTwinkle + ph));
  // Now and then a spot flares into a star as a mirror lines up, and as the tilt swings it.
  vec2 nd = mbHash2(cid + 5.5) * 2.0 - 1.0;
  float flare = step(0.8, mbHash(cid + 7.7)) * max(pow(0.5 + 0.5 * sin(dot(nd, uMbTilt) * 4.0 + ph * 6.2831853), 20.0),
    pow(0.5 + 0.5 * sin(6.2831853 * (tm / uMbTwinkle * 0.5 + ph)), 30.0));
  // The image of a little mirror thrown at a slant: an ellipse drawn out along the way it travels,
  // with a crisp edge, a hot middle and a faint glow; from a speck to a short streak.
  float hs = mbHash(cid + 2.3);
  float b = (0.9 + 1.6 * hs * hs) * uMbDpr * (1.0 + flare * 0.3);
  vec2 ab = vec2(b * (2.2 + 1.6 * mbHash(cid + 3.9)), b);
  float e = length(at / ab);
  float sd = (e - 1.0) * b;
  float core = clamp(0.5 - sd, 0.0, 1.0);
  float glow = exp(-max(sd, 0.0) / (b + 2.5 * uMbDpr)) * 0.25;
  // A star's rays: thick at the middle, tapering to a point.
  float arm = b * (6.0 + 10.0 * flare);
  vec2 k = max(1.0 - abs(at) / arm, 0.0);
  float cross = flare * (k.x * k.x * clamp(1.0 - abs(at.y) / (uMbDpr * (0.3 + 1.3 * k.x)), 0.0, 1.0)
    + k.y * k.y * clamp(1.0 - abs(at.x) / (uMbDpr * (0.3 + 1.3 * k.y)), 0.0, 1.0));
  float hc = mbNoise(cid / vec2(10.0, 5.0) + 17.3);
  vec3 tint = hc < 0.42 ? vec3(1.0, 0.34, 0.72) : hc < 0.56 ? vec3(1.0, 0.7, 0.32) : vec3(0.3, 0.78, 1.0);
  vec3 body = mix(tint, vec3(1.0), clamp(1.0 - e, 0.0, 1.0) * 0.75);
  float s = (0.55 + 0.6 * mbHash(cid + 6.6)) * (0.6 + 0.4 * dens) * tw * (1.0 + flare * 0.8);
  return (body * core + tint * glow) * s + mix(tint, vec3(1.0), 0.6) * cross;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uMbRes.y * uMbDpr - gl_FragCoord.y) / uMbDpr;
  vec2 p = (px - uMbCenter) / uMbSize;
  p.y = -p.y;
  // A ray from the ball to this point of the back wall, a card's height behind it.
  vec3 dir = normalize(vec3(p, -0.9));
  // Tilting the card turns the ball, and a mirror swings its spot twice as far.
  vec2 ll = vec2(atan(dir.x, -dir.z) + uMbTilt.x * 0.55, asin(clamp(dir.y, -1.0, 1.0)) - uMbTilt.y * 0.45);
  vec3 acc = mbSpots(ll, uMbTime) * (1.0 - uMbFade);
  if (uMbFade > 0.0) acc += mbSpots(ll, uMbTime - uMbLoop) * uMbFade;
  acc *= uMbPower / (1.0 + dot(p, p) * 0.25);
  float a = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 0.95);
  o = vec4(acc / max(max(acc.r, max(acc.g, acc.b)), 1e-4) * a, a);
}
`;
