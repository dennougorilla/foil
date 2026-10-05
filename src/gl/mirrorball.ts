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
// Mirror Ball. The art window is the near face of a ball covered in small square mirrors set in
// dark grout. It bulges out to all four edges: the rows run across it like lines of latitude and
// the mirrors along them like lines of longitude, and both narrow as the ball curves away, so the
// mirrors stay little rectangles that shrink toward the edges and the corners. Each mirror is flat
// and set a touch askew, so it shows the picture as one tone of its own (a few near black, some
// bright) and floods with any light it throws straight at the eye: the white key light under the
// light point (the brightest throw a long thin star) and three colored spotlights, each lighting a
// patch of the ball. The ball darkens toward its rim, with one broad soft sheen where the key light
// falls. The frame around it is polished chrome.
float mbPeriod(float want) { return uLoop > 0.0 ? uLoop / max(1.0, floor(uLoop / want + 0.5)) : want; }
// Mirrors across the art window's short side, at the middle of the ball.
const float MB_N = 18.0;
// How far the ball curves away by the window's edges: the angle there is asin(MB_S).
const float MB_S = 0.94;
// The ball under a point w of the window (-1..1 each way) as (longitude, latitude), and back.
vec2 mbAngles(vec2 w) { return asin(clamp(w * MB_S, -0.999, 0.999)); }
vec2 mbPoint(vec2 ll) { return sin(ll) / MB_S; }
// The ball's surface at (longitude, latitude), facing out.
vec3 mbNormal(vec2 ll) { return normalize(vec3(sin(ll), cos(ll.x) * cos(ll.y))); }
// How far a row is turned, in mirrors, so the rows stagger.
float mbOff(float row) { return hash12(vec2(row, 3.7)); }
// Where x (window units) falls along a row, in mirrors. B is the ball: the window's half size
// (card units) and a mirror's angle each way.
float mbCol(float row, float x, vec4 B) { return mbAngles(vec2(x, 0.0)).x / B.z + mbOff(row); }
// Mirror (row, col): its true normal n, where its middle lies (at, card units), and the way its
// own slightly askew face reflects the eye (which rocks a little as the ball turns).
vec3 mbFace(float row, float col, vec4 B, vec3 eye, float turn, out vec3 n, out vec2 at) {
  vec2 ll = vec2(col + 0.5 - mbOff(row), row + 0.5) * B.zw;
  n = mbNormal(ll);
  at = mbPoint(ll) * B.xy;
  vec2 id = vec2(col, row);
  float ph = hash12(id + 13.0);
  vec2 rock = vec2(sin(6.2831853 * (turn + ph)), cos(6.2831853 * (turn + ph * 1.7)));
  vec3 nj = normalize(n + vec3((hash22(id + 7.3) - 0.5) * 0.2 + rock * 0.03, 0.0));
  return reflect(-normalize(eye - vec3(at, 0.0)), nj);
}
// The white light a mirror (facing n, reflecting r, its middle at) throws at the eye: the key light,
// in a cluster round the light point lp (s0 is a mirror), and now and then one elsewhere that lines
// up with a lamp for a moment. Mirrors seen edge on, round the rim, hardly ever do.
float mbHot(vec3 r, vec3 n, vec2 at, vec3 key, vec2 lp, float s0, vec2 id, float turn) {
  float ph = hash12(id + 13.0);
  // Round the light point about one mirror in two lines up, fewer further out, each brightest
  // where its face meets the light and flickering as the ball turns.
  vec2 d = (at - lp) / (s0 * 2.3);
  float lined = step(hash12(id + 21.0), 0.7 * exp(-dot(d, d))) * smoothstep(0.9, 0.985, dot(r, key));
  return (lined * (1.0 + 0.3 * sin(6.2831853 * (turn * 2.0 + ph)))
    + step(0.95, ph) * 0.9 * pow(0.5 + 0.5 * sin(ph * 61.0 + turn * 12.566371), 40.0)) * smoothstep(0.3, 0.6, n.z);
}
// A hot mirror's star at o (card units from its middle): long thin rays along the rows and up and
// down, short diagonals and a soft bloom. s0 is a mirror, px a pixel, in card units.
float mbStar(vec2 o, float h, float s0, float px) {
  o /= s0;
  float th = px / s0;
  h = min(h, 1.3);
  float len = 1.2 + 2.6 * h;
  vec2 ao = abs(o);
  float ray = smoothstep(1.5 * th, 0.3 * th, ao.y) * pow(max(1.0 - ao.x / len, 0.0), 2.5)
    + smoothstep(1.5 * th, 0.3 * th, ao.x) * pow(max(1.0 - ao.y / len, 0.0), 2.5);
  vec2 w = abs(vec2(o.x + o.y, o.x - o.y)) * 0.70710678;
  float dl = min(len * 0.3, 1.3);
  ray += 0.5 * (smoothstep(1.3 * th, 0.2 * th, w.y) * pow(max(1.0 - w.x / dl, 0.0), 2.0)
    + smoothstep(1.3 * th, 0.2 * th, w.x) * pow(max(1.0 - w.y / dl, 0.0), 2.0));
  return (min(ray, 1.0) + exp(-dot(o, o) * 3.0) * 0.45) * h;
}
// Spotlight k of three, in its color: the way it shines, aimed so it lights a patch of the ball
// that drifts slowly (and shifts as the card tilts).
vec3 mbSpot(int k, float turn, vec2 t, vec3 eye, vec4 B, out vec3 col) {
  float w = 6.2831853 * (turn + float(k) / 3.0);
  vec2 s = k == 0 ? vec2(0.42, -0.45) : k == 1 ? vec2(-0.45, 0.12) : vec2(0.22, 0.52);
  s += 0.14 * vec2(sin(w), cos(w)) * (k == 1 ? -1.0 : 1.0) - t * 0.2;
  col = k == 0 ? vec3(1.0, 0.28, 0.68) : k == 1 ? vec3(0.22, 0.72, 1.0) : vec3(1.0, 0.64, 0.22);
  vec3 n = mbNormal(mbAngles(s));
  return reflect(-normalize(eye - vec3(s * B.xy, 0.0)), n);
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
  // The ball fills the art window.
  vec2 mid = (uArt.xy + uArt.zw) * 0.5;
  vec2 H = (uArt.zw - uArt.xy) * 0.5 * uCardK;
  float s0 = 2.0 * min(H.x, H.y) / MB_N; // a mirror at the middle, card units
  vec4 B = vec4(H, s0 * MB_S / H);
  vec2 q = (uv - mid) * uCardK;
  vec2 w = q / H;
  float px = length(fwidth(q)) * 0.70710678;
  // The eye, a little way in front; tilting the card swings it across.
  vec3 eye = vec3(-t * vec2(0.9, 0.8), 2.6);
  float turn = uTime / mbPeriod(10.0);
  // The key light, placed so the mirror under the light point throws it straight at the eye.
  vec2 wL = clamp((uLight - mid) * uCardK / H, -0.65, 0.65);
  vec2 lp = wL * H;
  vec3 key = reflect(-normalize(eye - vec3(lp, 0.0)), mbNormal(mbAngles(wL)));
  // This mirror: the row by latitude, then the mirror along the row.
  float fr = mbAngles(w).y / B.w;
  float row = floor(fr);
  float fl = mbCol(row, w.x, B);
  float cix = floor(fl);
  vec2 f = vec2(fl - cix, fr - row) - 0.5;
  vec2 id = vec2(cix, row);
  vec3 n;
  vec2 at;
  vec3 r = mbFace(row, cix, B, eye, turn, n, at);
  vec3 r0 = reflect(-normalize(eye - vec3(at, 0.0)), n);
  // Stars of the hot mirrors round about: along this row, and straight above and below.
  vec3 glare = vec3(0.0);
  for (int i = -4; i <= 4; i++) {
    vec3 nn;
    vec2 ac;
    float c2 = cix + float(i);
    float hh = mbHot(mbFace(row, c2, B, eye, turn, nn, ac), nn, ac, key, lp, s0, vec2(c2, row), turn);
    if (hh > 0.05) glare += vec3(mbStar(q - ac, hh, s0, px));
    if (i == 0) continue;
    float r2 = row + float(i);
    float c3 = floor(mbCol(r2, w.x, B));
    for (int j = -1; j <= 1; j++) {
      if (j != 0 && abs(i) > 1) continue;
      float c4 = c3 + float(j);
      hh = mbHot(mbFace(r2, c4, B, eye, turn, nn, ac), nn, ac, key, lp, s0, vec2(c4, r2), turn);
      if (hh > 0.05) glare += vec3(mbStar(q - ac, hh, s0, px));
    }
  }
  // The picture in this mirror as one tone: read once at its middle, averaged over it.
  vec2 atUv = mid + at / uCardK;
  vec4 sp = face(g0 + atUv - uv, max(lod, log2(s0 * uFaceTexels / uCardK.x) - 1.0));
  vec3 pic = sp.rgb / max(sp.a, 1e-4);
  // Each mirror catches its own bit of the room: a few near black, most in between, some bright.
  float h = hash12(id + 1.7);
  float h2 = hash12(id + 5.9);
  float tone = (0.48 + 0.85 * h * h) * (hash12(id + 8.1) < 0.06 ? 0.35 : 1.0);
  // The ball darkens toward its rim, with one broad soft sheen where the key light falls.
  float limb = 0.38 + 0.62 * smoothstep(0.1, 0.9, n.z);
  float lobe = exp((dot(r0, key) - 1.0) * 6.0);
  vec3 mir = pic * tone * limb * (0.95 + 0.6 * lobe) + vec3(0.85, 0.88, 0.95) * lobe * lobe * 0.16 * (0.4 + h);
  // A faint slope across the mirror, brighter on the side toward the light.
  vec2 toL = normalize(lp - at + 1e-4);
  mir *= 0.9 + 0.2 * clamp(0.5 + dot(f, toL), 0.0, 1.0);
  // The spotlights: each washes a patch of the ball in its color, and its mirrors that line up flash.
  for (int k = 0; k < 3; k++) {
    vec3 lc;
    vec3 l = mbSpot(k, turn, t, eye, B, lc);
    float wash = exp((dot(r0, l) - 1.0) * 9.0);
    mir = mix(mir, mir * 0.35 + lc * (0.18 + 0.9 * h2), wash * 0.75);
    mir += lc * exp((dot(r, l) - 1.0) * 60.0) * wash * 1.2;
  }
  // The rim picks up the stage's colors.
  float side = atan(n.x, n.y) / 6.2831853 + turn;
  vec3 rimc = mix(vec3(1.0, 0.36, 0.72), vec3(0.32, 0.82, 1.0), 0.5 + 0.5 * sin(side * 6.2831853));
  mir += rimc * pow(1.0 - n.z, 2.0) * (0.15 + 0.5 * h2 * h2) * 0.6;
  mir = mix(mir, vec3(luma(mir)) * vec3(0.95, 0.98, 1.05), 0.1);
  // A mirror that throws the key light at the eye floods white.
  float hot = mbHot(r, n, at, key, lp, s0, id, turn);
  mir = mix(mir, vec3(1.08, 1.06, 1.02), clamp(hot, 0.0, 1.0));
  // Near-black grout between the mirrors; the cut edge toward the light of a bright mirror
  // catches a one-pixel line.
  vec2 fw = max(fwidth(vec2(fl, fr)), 1e-4);
  vec2 ep = (0.43 - abs(f)) / fw; // pixels in from the mirror's edge
  float inside = clamp(ep.x + 0.5, 0.0, 1.0) * clamp(ep.y + 0.5, 0.0, 1.0);
  vec2 facing = step(0.0, f * toL);
  float bevel = max(facing.x * (1.0 - smoothstep(0.5, 1.5, ep.x)), facing.y * (1.0 - smoothstep(0.5, 1.5, ep.y)));
  vec3 col = mix(mir, vec3(1.0), bevel * smoothstep(0.3, 0.75, luma(mir)) * 0.6);
  col = mix(vec3(0.006, 0.006, 0.01) + pic * 0.02, col, inside);
  // The frame is chrome; the nameplate keeps only a faint coat of it, so the name reads.
  vec3 chrome = mbChrome(c, uv, t);
  chrome = mix(chrome, c, (1.0 - art) * step(uArt.w, g0.y) * 0.8);
  return mix(chrome + glare * 0.7, col + glare, art);
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
// A line one css pixel wide, through 0.
float mbLine(float x) { return clamp(1.0 - abs(x) / uMbDpr, 0.0, 1.0); }
// The spots at time tm, at a point of the wall seen from the ball at (lon, lat). Each cell of the
// wall holds at most one spot, kept inside it, so only the one cell is looked at. The cells run
// round the ball in rows of latitude, so as it turns the spots sweep along arcs together.
vec3 mbSpots(vec2 ll, float tm) {
  vec2 G = ll / 0.1 + vec2(tm * uMbSpin, 0.0);
  vec2 cell = max(fwidth(G), 1e-5); // a device pixel, in cells
  vec2 cid = floor(G);
  if (mbHash(cid) > 0.7) return vec3(0.0);
  // The spot, from its middle, in device pixels.
  vec2 at = (G - cid - (0.3 + 0.4 * mbHash2(cid + 4.1))) / cell;
  float ph = mbHash(cid + 9.7);
  float tw = 0.75 + 0.25 * sin(6.2831853 * (tm / uMbTwinkle + ph));
  // A spot flares into a star as a mirror lines up: now and then, and as the tilt swings it.
  vec2 nd = mbHash2(cid + 5.5) * 2.0 - 1.0;
  float flare = max(pow(0.5 + 0.5 * sin(dot(nd, uMbTilt) * 4.0 + ph * 6.2831853), 14.0),
    step(0.86, mbHash(cid + 3.3)) * pow(0.5 + 0.5 * sin(6.2831853 * (tm / uMbTwinkle * 0.5 + ph)), 30.0));
  // A little square mirror's image: a rounded square with a hard edge and a faint glow, in sizes
  // from a speck to a few pixels.
  float hs = mbHash(cid + 2.3);
  float r = (1.4 + 3.4 * hs * hs) * uMbDpr * (1.0 + flare * 0.3);
  float sd = length(max(abs(at) - r * 0.55, 0.0)) - r * 0.45;
  float core = clamp(0.5 - sd, 0.0, 1.0);
  float glow = exp(-max(sd, 0.0) / (r + 2.0 * uMbDpr)) * 0.3;
  float arm = r * (3.0 + 6.0 * flare);
  float cross = flare * (mbLine(at.y) * pow(max(1.0 - abs(at.x) / arm, 0.0), 2.0)
    + mbLine(at.x) * pow(max(1.0 - abs(at.y) / arm, 0.0), 2.0));
  // Spots come in patches of the stage lights' colors, as each light catches a stretch of the ball.
  float ht = mbHash(floor(cid / vec2(5.0, 3.0)) + 8.8);
  vec3 tint = ht < 0.5 ? vec3(1.0, 0.96, 0.9) : ht < 0.68 ? vec3(1.0, 0.36, 0.74) : ht < 0.86 ? vec3(0.3, 0.78, 1.0) : vec3(1.0, 0.7, 0.3);
  // A white-hot middle, the color toward the edge.
  vec3 body = mix(tint, vec3(1.0), clamp(-sd / r, 0.0, 1.0) * 0.8);
  float k = (0.65 + 0.7 * mbHash(cid + 6.6)) * tw * (1.0 + flare * 0.8);
  return (body * core + tint * glow) * k + vec3(1.0) * cross;
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
