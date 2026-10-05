// Snow Globe: the art window is a pane of clear liquid with thousands of glitter and gold-leaf
// flakes in it, drawn as GPU points that tumble and catch the light over the card. The liquid and
// glass themselves are drawn by the card shader (SNOWGLOBE_GLSL below, in the Nature pack's program).
//
// Left alone the glitter is a function of the moment in the loop (docs/motion.md): the dome is
// shaken lightly as the loop starts, so the bed of leaf and glitter on the floor is thrown up,
// swirls, sinks and settles back where it lay by the loop's end, while fine glitter drifts with the
// liquid's slow convection, each flake fading in and out once a life (a whole fraction of the loop).
// So a file closes without a seam and the stage left alone shows the same flakes. A hand stirs it (a drag or toss of
// the card, a pointer sweeping across the art, a shaken phone): a transform-feedback pass moves each
// flake away from its place through a simple fluid (a swirl, a slosh, turbulence), and once the
// liquid calms the flakes drift back into the loop. Exports and reduced motion never take input.
import { artOf } from '../card/face';
import { cardK } from '../card/shape';
import type { CardDraw } from './renderers';

/** Card shader index of the finish. Kept clear of the regular and sponsor ranges. */
export const SNOWGLOBE_SHADER = 60;

/** The liquid and the glass, spliced into the card shader. */
export const SNOWGLOBE_GLSL = /* glsl */ `
// Snow Globe: the art seen through a curved pane of clear liquid. The glitter in it is drawn as
// GPU particles on top of the card (below). g is the card uv (not the pattern).
// The water moves round in circles once a loop (six seconds when there is none), so a file closes.
vec2 sgFlow(float speed, float phase) {
  float w = 6.2831853 / (uLoop > 0.0 ? uLoop : 6.0);
  return speed / w * vec2(cos(w * uTime + phase), sin(w * uTime + phase));
}
vec3 snowglobe(vec3 c, vec2 g, vec2 t, float L, float lod, float art) {
  vec4 W = uArt; // art window: left, top, right, bottom
  vec2 a = (g - W.xy) / (W.zw - W.xy);
  // The window in units of its short side.
  vec2 win = (W.zw - W.xy) * uCardK;
  win /= min(win.x, win.y);
  vec2 q = (a - 0.5) * 2.0 * win;
  float r2 = dot(q, q) / 2.8;
  // The liquid lens magnifies a touch toward the middle and never quite stops moving.
  vec2 wob = vec2(vnoise(g * 5.0 + sgFlow(0.2, 0.0)), vnoise(g * 5.0 + vec2(5.2, 0.0) + sgFlow(0.17, 2.1))) - 0.5;
  vec2 s = g - (g - (W.xy + W.zw) * 0.5) * 0.07 * (1.0 - min(r2, 1.0)) + wob * 0.006 + t * 0.005;
  vec3 col = mix(c, face(tunePattern(s), lod).rgb, art);
  // Clear water with a faint cool cast, deeper toward the walls.
  float edge = min(min(a.x, 1.0 - a.x) * win.x, min(a.y, 1.0 - a.y) * win.y);
  col = mix(col, col * vec3(0.9, 0.97, 1.05) + vec3(0.0, 0.012, 0.03), 0.7);
  col *= 1.0 - 0.3 * smoothstep(0.14, 0.0, edge);
  // Light through the moving water, rippling over the lower half.
  float caus = 1.0 - abs(vnoise(g * vec2(9.0, 7.0) + sgFlow(0.27, 4.0)) * 2.0 - 1.0);
  col += vec3(0.75, 0.9, 1.0) * pow(caus, 6.0) * 0.12 * smoothstep(0.35, 1.0, a.y);
  // The pane bulges like a dome: a thin highlight follows its curve in one corner and a soft
  // sheet of reflected light fills in behind it, both swinging round as the card turns.
  vec2 e = q / (win - vec2(0.16, 0.17));
  float ell = length(e);
  vec2 dir = normalize(vec2(-0.62, -0.78) + t * vec2(-0.35, -0.3));
  float side = smoothstep(0.55, 0.97, dot(e / max(ell, 1e-3), dir));
  float arc = smoothstep(0.035, 0.0, abs(ell - 1.0)) * side;
  float sheet = smoothstep(0.55, 1.0, ell) * smoothstep(1.06, 0.98, ell) * side;
  float back = smoothstep(0.03, 0.0, abs(ell - 0.97)) * smoothstep(0.8, 0.98, dot(e / max(ell, 1e-3), -dir));
  col += vec3(0.85, 0.93, 1.0) * (sheet * 0.12 + arc * 0.35 + back * 0.15);
  // A bright rim where the glass curves away.
  col += vec3(0.8, 0.9, 1.0) * smoothstep(0.03, 0.0, edge) * 0.3;
  return mix(c, col, art);
}
`;

/** The art window of a face, in card uv (x, y, width, height), its height in widths (A) and the card's proportions (k). */
function artUv(face: HTMLCanvasElement) {
  const a = artOf(face);
  const [W, H] = [face.width, face.height];
  return { uv: [a.x / W, a.y / H, a.w / W, a.h / H] as const, A: a.h / a.w, k: cardK(W, H) };
}

const COARSE = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const COUNT = COARSE ? 3072 : 8192;

const HASH = /* glsl */ `
float rnd(int id, int salt) {
  uint n = uint(id) * 747796405u + uint(salt) * 2891336453u + 1u;
  n = ((n >> ((n >> 28u) + 4u)) ^ n) * 277803737u;
  n = (n >> 22u) ^ n;
  return float(n) / 4294967295.0;
}
`;

/**
 * Where each flake is left alone, `uTau` seconds into a loop `uLoopT` long: shared by the drawing
 * and the stirring. Square units: x across the art window 0..1, y down it 0..A.
 */
const FLAKES = /* glsl */ `
uniform float uTau;      // seconds into the loop
uniform float uLoopT;    // the loop's length
uniform float uLives;    // a drifting flake's lives per loop, a whole number
uniform float uA;        // height of the art window in widths
#define A uA
${HASH}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// The liquid's stream functions fade to zero at the glass, so the flow runs along the walls and
// never into them. Calm, a lazy convection keeps the light glitter turning over; turbulence
// reaches close to the glass so nothing gets stranded against it.
float wallOf(vec2 P) { return sin(3.14159 * clamp(P.x, 0.0, 1.0)) * sin(3.14159 * clamp(P.y / A, 0.0, 1.0)); }
float turb(vec2 P, float t) {
  vec2 p = P * 1.3;
  return noise(p * 2.4 + vec2(0.0, t)) + 0.5 * noise(p * 5.1 + vec2(t * 0.7, 3.1));
}
float calmStream(vec2 P) { return pow(wallOf(P), 0.35) * (turb(P, 0.0) * 0.006 + 0.011); }
#define CURL(f, P) (vec2(f(P + vec2(0.0, 0.01)) - f(P - vec2(0.0, 0.01)), f(P - vec2(0.01, 0.0)) - f(P + vec2(0.01, 0.0))) / 0.02)
float leafOf(int id) { return step(0.82, rnd(id, 2)); }
// All the leaf lies in the bed on the floor, and a quarter of the glitter with it.
bool bedded(int id) { return leafOf(id) > 0.5 || rnd(id, 17) < 0.25; }
float floorY(int id) { return A - 0.006 - 0.035 * rnd(id, 6); }
struct Home {
  vec2 P;        // where the flake is
  float shown;   // how much of it shows: a drifting flake fades in and out once a life
  float age;     // seconds into its life
  float life;    // which of its lives this is
  float flying;  // 0 at rest .. 1 thrown highest by the loop's shake
};
// The light shake at the start of every loop: each flake is thrown up and aside in a moment, then
// sinks slowly (the leaf first, the fine glitter last) and has settled where it began by the loop's
// end. Its offset from its place, and how far into the throw it is. A short loop shakes lightly.
vec3 toss(int id, bool bed) {
  float s = uTau / uLoopT;
  float leaf = leafOf(id);
  float reach = min(1.0, uLoopT / 6.0);
  float a = mix(0.03, 0.2, rnd(id, 22) * rnd(id, 22));
  float b = leaf > 0.5 ? mix(0.35, 0.6, rnd(id, 23)) : mix(0.5, 0.95, rnd(id, 23));
  float f = s < a ? 1.0 - pow(1.0 - s / a, 2.0) : 1.0 - smoothstep(a, b, s);
  // Thrown anywhere up to the top of the dome, most of the bed high, the heavy leaf a little lower.
  float h = (bed ? mix(0.1, 0.95, rnd(id, 24)) * (1.0 - 0.25 * leaf) : mix(0.04, 0.2, rnd(id, 24))) * A * reach;
  // Thrown aside too, swirling round as it rises and slowing as the liquid calms.
  float side = mix(0.05, 0.3, rnd(id, 25)) * reach * (rnd(id, 26) < 0.5 ? -1.0 : 1.0);
  float turn = rnd(id, 27) * 6.2832 + 4.0 * (1.0 - exp(-6.0 * s));
  return vec3(side * sin(turn) * f, -h * f, f);
}
Home home(int id) {
  Home h;
  if (bedded(id)) {
    vec3 t = toss(id, true);
    h.P = clamp(vec2(0.008 + 0.984 * rnd(id, 20), floorY(id)) + t.xy, vec2(0.008), vec2(0.992, A));
    h.shown = 1.0;
    h.age = 0.0;
    h.life = 0.0;
    h.flying = t.z;
    return h;
  }
  float span = uLoopT / uLives;
  float k = uTau / span + rnd(id, 21);
  h.life = mod(floor(k), uLives);
  float u = fract(k);
  int s = 30 + int(h.life) * 2;
  vec2 P0 = vec2(0.03 + 0.94 * rnd(id, s), 0.03 + (A - 0.08) * rnd(id, s + 1));
  // Fine glitter barely sinks: it rides the convection.
  vec2 v = CURL(calmStream, P0) + vec2(0.0, mix(0.006, 0.03, rnd(id, 3)));
  h.age = u * span;
  vec3 t = toss(id, false);
  h.P = clamp(P0 + v * h.age + t.xy, vec2(0.008), vec2(0.992, A - 0.008));
  h.shown = smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u);
  h.flying = t.z;
  return h;
}
`;

const SIM_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec4 aState;          // how far the flake was stirred from its place, and its velocity (art widths, art widths/s)
uniform float uDt;
uniform float uTime;
uniform vec2 uKick;      // the glass was jolted: flakes lag behind it (art widths/s)
uniform float uSpin;     // swirl of the liquid
uniform float uStir;     // turbulence, 0 calm .. ~1.5 shaken hard
uniform vec4 uPoke;      // a pointer sweeping through: position (art uv), velocity
out vec4 vState;
${FLAKES}
// Stirred, the liquid swirls as a whole and churns.
float stirStream(vec2 P) {
  float wall = wallOf(P);
  return uSpin * 0.1 * wall * wall + pow(wall, 0.35) * turb(P, uTime * 0.25) * 0.1 * uStir;
}
void main() {
  int id = gl_VertexID;
  Home h = home(id);
  vec2 P = h.P + aState.xy;
  vec2 v = aState.zw;
  float leaf = leafOf(id);
  float follow = mix(mix(6.0, 10.0, rnd(id, 5)), 2.5, leaf);

  vec2 U = CURL(stirStream, P);
  v += uKick * mix(0.6, 1.0, max(leaf, rnd(id, 15)));
  vec2 pp = vec2(uPoke.x, uPoke.y * A);
  vec2 dp = P - pp;
  U += uPoke.zw * exp(-dot(dp, dp) / 0.012);
  // Each flake is drawn back to its place: barely while the liquid churns, firmly once it is calm.
  float calm = 1.0 - min(1.0, uStir + abs(uSpin) * 0.3);
  U += (h.P - P) * mix(0.15, 1.6, calm);

  v += (U - v) * min(follow * uDt, 1.0);
  P += v * uDt;

  // Glass walls; the floor is a loose bed a few flakes deep.
  float floorY = floorY(id);
  if (P.y > floorY) {
    P.y = floorY;
    // Stirred, the bed is lifted off the floor a flake at a time.
    v.y = min(v.y, -uStir * mix(0.0, 0.9, rnd(id, 16)));
    v.x *= 0.9;
  }
  if (P.y < 0.008) { P.y = 0.008; v.y = abs(v.y) * 0.3; }
  if (P.x < 0.008) { P.x = 0.008; v.x = abs(v.x) * 0.3; }
  if (P.x > 0.992) { P.x = 0.992; v.x = -abs(v.x) * 0.3; }
  vState = vec4(P - h.P, v);
}
`;

const SIM_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }
`;

const DRAW_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec4 aState;          // how far a hand stirred the flake from its place (see SIM_VS); zero left alone
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform vec3 uRot;
uniform float uScale;
uniform float uDpr;
uniform float uShow;     // share of the flakes drawn
uniform vec2 uTilt;
uniform vec2 uLight;
uniform sampler2D uMask;
uniform vec4 uArtUv;     // the art window in card uv: x, y, width, height
uniform vec2 uCardK;     // the card in units of its short side
#define ART_UV uArtUv
out vec3 vCol;
out float vGlint;
out vec2 vAxis;          // flake orientation (cos, sin)
out float vSquash;       // how edge-on the flake is
out float vCover;        // opacity of the flake
${FLAKES}
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  int id = gl_VertexID;
  Home h = home(id);
  vec2 P = clamp(h.P + aState.xy, vec2(0.0), vec2(1.0, A));
  vec2 cuv = ART_UV.xy + vec2(P.x, P.y / A) * ART_UV.zw;
  bool shown = rnd(id, 1) < uShow && h.shown > 0.0 && textureLod(uMask, cuv, 0.0).r > 0.5;
  // Same projection as the card itself (CARD_VS).
  vec3 p = vec3((cuv - 0.5) * uSize * uScale, 0.0);
  vec3 n = vec3(0.0, 0.0, 1.0);
  float cz = cos(uRot.z), sz = sin(uRot.z);
  p.xy = mat2(cz, sz, -sz, cz) * p.xy;
  float cx = cos(uRot.x), sx = sin(uRot.x);
  p.yz = mat2(cx, sx, -sx, cx) * p.yz;
  n.yz = mat2(cx, sx, -sx, cx) * n.yz;
  float cy = cos(uRot.y), sy = sin(uRot.y);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  n.xz = mat2(cy, -sy, sy, cy) * n.xz;
  if (!shown || n.z < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float D = max(max(uSize.x, uSize.y), 120.0) * 3.2;
  float w = (D - p.z) / D;
  vec2 s = uCenter + p.xy / w;
  gl_Position = vec4(vec2(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0) * w, 0.0, w);

  float leaf = leafOf(id);
  float size = mix(mix(0.0028, 0.0055, rnd(id, 7)), mix(0.008, 0.014, rnd(id, 8)), leaf) * min(uSize.x, uSize.y) * (7.0 / 5.0) * uScale / w; // sized as on the trading card's height
  // The sprite leaves room around the flake for its glint to flare.
  gl_PointSize = max(size * 3.0 * uDpr, 2.0);

  // A drifting flake tumbles through its life; one in the bed rocks to and fro once a loop. Both
  // tumble faster while a stirred liquid carries them.
  float speed = length(aState.zw);
  float a, b;
  if (bedded(id)) {
    float w = 6.2832 * uTau / uLoopT;
    a = rnd(id, 9) * 6.2832 + mix(0.4, 1.0, rnd(id, 10)) * sin(w + rnd(id, 18) * 6.2832);
    b = rnd(id, 11) * 6.2832 + mix(0.4, 1.0, rnd(id, 12)) * sin(w + rnd(id, 19) * 6.2832);
  } else {
    a = rnd(id, 9) * 6.2832 + h.life * 1.7 + h.age * mix(0.3, 1.4, rnd(id, 10));
    b = rnd(id, 11) * 6.2832 + h.life * 2.3 + h.age * mix(0.2, 1.1, rnd(id, 12));
  }
  // Thrown up by the loop's shake, flakes tumble over and over as they sink.
  a += speed * 2.0 + h.flying * mix(3.0, 7.0, rnd(id, 28));
  b += speed * 3.0 + h.flying * mix(2.0, 5.0, rnd(id, 29));
  vec3 fn = normalize(vec3(cos(a) * sin(b), sin(a) * sin(b), 0.6 + abs(cos(b))));
  vAxis = vec2(cos(a), sin(a));
  vSquash = clamp(fn.z, 0.25, 1.0);

  vec3 L = normalize(vec3((uLight - cuv) * uCardK * 1.6 - uTilt * 0.35, 1.0));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = max(dot(fn, H), 0.0);
  vGlint = pow(spec, mix(40.0, 18.0, leaf)) * mix(1.2, 2.2, leaf);
  float kind = rnd(id, 13);
  vec3 base = kind < 0.5 ? vec3(1.0, 0.74, 0.3)       // gold
            : kind < 0.72 ? vec3(1.0, 0.9, 0.66)      // champagne
            : kind < 0.93 ? vec3(0.86, 0.92, 1.0)     // silver
            : hue(rnd(id, 14) + dot(fn.xy, vec2(0.8, 0.5)) + uTilt.x * 0.3) * 0.6 + 0.4; // iridescent
  // Fine glitter mostly shows when it catches the light; leaf reads as gold even in shade.
  vCol = base * mix(0.1 + 0.3 * max(dot(fn, L), 0.0), 0.3 + 0.5 * max(dot(fn, L), 0.0), leaf) * h.shown;
  vGlint *= h.shown;
  vCover = mix(0.55, 0.95, leaf) * h.shown;
}
`;

const DRAW_FS = /* glsl */ `#version 300 es
precision mediump float;
in vec3 vCol;
in float vGlint;
in vec2 vAxis;
in float vSquash;
in float vCover;
uniform float uAlpha;
out vec4 o;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * 3.0;  // the flake spans -0.5..0.5
  vec2 f = mat2(vAxis.x, -vAxis.y, vAxis.y, vAxis.x) * q;
  f.y /= vSquash;
  float core = 1.0 - smoothstep(0.32, 0.5, abs(f.x) + abs(f.y) * 0.75);
  float star = (exp(-abs(q.x) * 12.0) * exp(-abs(q.y) * 2.2) + exp(-abs(q.y) * 12.0) * exp(-abs(q.x) * 2.2));
  star *= smoothstep(0.35, 1.0, vGlint);
  vec3 rgb = vCol * core * (1.0 + vGlint * 2.5) + mix(vCol, vec3(1.0), 0.6) * star * vGlint;
  float a = core * vCover;
  if (a + rgb.r + rgb.g < 0.004) discard;
  o = vec4(rgb, a) * uAlpha;
}
`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string, feedback?: string[]): WebGLProgram {
  const prog = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Snow globe shader: ${gl.getShaderInfoLog(s)}`);
    gl.attachShader(prog, s);
  }
  if (feedback) gl.transformFeedbackVaryings(prog, feedback, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Snow globe link: ${gl.getProgramInfoLog(prog)}`);
  return prog;
}

const uniforms = (gl: WebGL2RenderingContext, prog: WebGLProgram, names: string[]) =>
  Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));

// Input shared by every live globe: a pointer sweeping across, and the phone's motion sensor.
const input = { x: 0, y: 0, vx: 0, vy: 0, at: -1, shake: [0, 0] as [number, number], sensor: false };
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  addEventListener('pointermove', (e) => {
    const now = performance.now();
    const dt = Math.max(8, now - input.at) / 1000;
    // A held button means the card is being dragged; the card's own motion covers that.
    const vx = e.buttons ? 0 : (e.clientX - input.x) / dt;
    const vy = e.buttons ? 0 : (e.clientY - input.y) / dt;
    const fresh = now - input.at < 120;
    input.vx = fresh ? input.vx * 0.5 + vx * 0.5 : 0;
    input.vy = fresh ? input.vy * 0.5 + vy * 0.5 : 0;
    input.x = e.clientX;
    input.y = e.clientY;
    input.at = now;
  });
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    if (!a || a.x === null || a.y === null) return;
    input.shake[0] += a.x;
    input.shake[1] -= a.y;
  };
  const start = () => {
    if (input.sensor) return;
    input.sensor = true;
    addEventListener('devicemotion', onMotion);
  };
  // iOS asks for permission, and only from a tap: tapping the card is the natural "pick it up".
  const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  if (typeof DME?.requestPermission === 'function') {
    document.addEventListener('click', (e) => {
      if (input.sensor || !(e.target as Element | null)?.closest?.('#cardSlot')) return;
      DME.requestPermission!()
        .then((r) => r === 'granted' && start())
        .catch(() => {});
    });
  } else if ('DeviceMotionEvent' in window) start();
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const MAX_DT = 1 / 20;
/** The loop when the card has none (speed 0: the clock stands still anyway). */
const NO_LOOP = 6;
/** A drifting flake lives about this long (s), a whole fraction of the loop. */
const LIFE = 6;
/** Where in the loop a stage held still (reduced motion) stands: the glitter thrown up and sinking. */
const HELD = 0.16;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
/** Calm this long (s), a stirred globe is back in its loop: the flakes are put home and stirring stops. */
const SETTLE = 4;

export interface GlobeView {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  cssW: number;
  cssH: number;
  dpr: number;
}

/** One globe per GL context; every card drawn with the finish shares its flakes. */
export class SnowGlobe {
  private sim: WebGLProgram;
  private draw_: WebGLProgram;
  private su: Record<string, WebGLUniformLocation | null>;
  private du: Record<string, WebGLUniformLocation | null>;
  private bufs: WebGLBuffer[];
  private simVao: WebGLVertexArrayObject[];
  private drawVao: WebGLVertexArrayObject[];
  private tf: WebGLTransformFeedback;
  private cur = 0;
  private time = NaN;
  /** The art window of the card's face (see setFace). */
  private art: ReturnType<typeof artUv> = { uv: [0.062, 0.0443, 0.876, 0.8343], A: 1.3333, k: [1, 1.4] }; // any shape: the classic trading card until setFace
  // Liquid state, eased back to calm.
  private impulse: [number, number] = [0, 0];
  private spin = 0;
  private stir = 0;
  private poke: [number, number, number, number] = [0, 0, 0, 0];
  /** A hand stirred the flakes away from their places, and they are not all back yet. */
  private stirred = false;
  private calmFor = 0;
  // The hand's last pose on the main card, to feel how it is being moved.
  private prev: { t: number; x: number; y: number; rx: number; ry: number; rz: number; vx: number; vy: number; wx: number; wy: number; wz: number } | null = null;

  constructor(
    private gl: WebGL2RenderingContext,
    /** Exports: no input, the flakes keep to the loop. */
    private settled: boolean,
  ) {
    this.sim = compile(gl, SIM_VS, SIM_FS, ['vState']);
    this.draw_ = compile(gl, DRAW_VS, DRAW_FS);
    const loop = ['uTau', 'uLoopT', 'uLives', 'uA'];
    this.su = uniforms(gl, this.sim, ['uDt', 'uTime', 'uKick', 'uSpin', 'uStir', 'uPoke', ...loop]);
    this.du = uniforms(gl, this.draw_, [
      'uRes', 'uCenter', 'uSize', 'uRot', 'uScale', 'uDpr', 'uShow', 'uTilt', 'uLight', 'uMask', 'uAlpha', 'uArtUv', 'uCardK', ...loop,
    ]);
    // Every flake at its place: nothing stirred yet.
    const data = new Float32Array(COUNT * 4);
    this.bufs = [0, 1].map(() => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
      return b;
    });
    const vao = (prog: WebGLProgram, buf: WebGLBuffer) => {
      const v = gl.createVertexArray()!;
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const loc = gl.getAttribLocation(prog, 'aState');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
      return v;
    };
    this.simVao = this.bufs.map((b) => vao(this.sim, b));
    this.drawVao = this.bufs.map((b) => vao(this.draw_, b));
    gl.bindVertexArray(null);
    this.tf = gl.createTransformFeedback()!;
    if (!settled) listen();
  }

  /** The face the flakes are drawn over: they fill its art window, wherever the layout puts it. */
  setFace(face: HTMLCanvasElement): void {
    this.art = artUv(face);
  }

  /** The loop's uniforms: the moment in it, its length and the drifting flakes' lives in it. */
  private loopUniforms(u: Record<string, WebGLUniformLocation | null>, loop: number) {
    const { gl } = this;
    const L = loop > 0 ? loop : NO_LOOP;
    // Held still (reduced motion), the stage shows the moment the glitter is in the air.
    gl.uniform1f(u.uTau, !this.settled && REDUCED.matches ? L * HELD : ((this.time % L) + L) % L);
    gl.uniform1f(u.uLoopT, L);
    gl.uniform1f(u.uLives, Math.max(1, Math.round(L / LIFE)));
    gl.uniform1f(u.uA, this.art.A);
  }

  /** Draws the flakes over a card that was just drawn; the mask must still be bound to unit 1. */
  draw(view: GlobeView, d: CardDraw, time: number): void {
    const { gl } = this;
    if (d.hand && !this.settled) this.feel(view, d, d.hand);
    if (time !== this.time) {
      const dt = Number.isNaN(this.time) ? 0 : clamp(time - this.time, 0, MAX_DT);
      this.time = time;
      if (dt > 0 && !this.settled) this.step(dt, d.loop ?? 0);
    }

    gl.useProgram(this.draw_);
    gl.bindVertexArray(this.drawVao[this.cur]);
    const u = this.du;
    gl.uniform2f(u.uRes, view.cssW, view.cssH);
    gl.uniform2f(u.uCenter, d.cx, d.cy);
    gl.uniform2f(u.uSize, d.w, d.h);
    gl.uniform3f(u.uRot, d.rx, d.ry, d.rz);
    gl.uniform1f(u.uScale, d.scale);
    gl.uniform1f(u.uDpr, view.dpr);
    this.loopUniforms(u, d.loop ?? 0);
    // Thumbnails carry a lighter sprinkle so the flakes stay readable at that size.
    gl.uniform1f(u.uShow, clamp(d.intensity, 0, 1) * (d.plate === false ? 0.35 : 1));
    gl.uniform2f(u.uTilt, d.tilt[0], d.tilt[1]);
    gl.uniform2f(u.uLight, d.light[0], d.light[1]);
    gl.uniform1i(u.uMask, 1);
    gl.uniform1f(u.uAlpha, d.alpha);
    gl.uniform4fv(u.uArtUv, this.art.uv);
    gl.uniform2fv(u.uCardK, this.art.k);
    gl.drawArrays(gl.POINTS, 0, COUNT);
  }

  /** Moves the stirred flakes on by `dt`; once the liquid has been calm a while they are home again. */
  private step(dt: number, loop: number) {
    const { gl } = this;
    // The liquid calms down slowly; the flakes take even longer to settle.
    this.spin *= Math.exp(-dt / 2.4);
    this.stir *= Math.exp(-dt / 1.8);
    const s = input.shake;
    if (s[0] || s[1]) {
      // Phone shaken: the liquid lags behind the glass.
      const m = Math.hypot(s[0], s[1]);
      if (m > 1.5) {
        this.kick(-s[0] * 0.05, -s[1] * 0.05, (Math.random() - 0.5) * m * 0.15, m * 0.04);
      }
      s[0] = s[1] = 0;
    }
    if (!this.stirred) return;
    this.calmFor = Math.abs(this.spin) < 0.05 && this.stir < 0.02 ? this.calmFor + dt : 0;
    if (this.calmFor > SETTLE) {
      // Back in the loop: what is left of the stirring is too small to see, and goes.
      const zero = new Float32Array(COUNT * 4);
      for (const b of this.bufs) {
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, zero);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.stirred = false;
      return;
    }
    const src = this.cur;
    const dst = 1 - src;
    gl.useProgram(this.sim);
    const u = this.su;
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uTime, this.time);
    this.loopUniforms(u, loop);
    gl.uniform2f(u.uKick, this.impulse[0], this.impulse[1]);
    this.impulse = [0, 0];
    gl.uniform1f(u.uSpin, this.spin);
    gl.uniform1f(u.uStir, this.stir);
    gl.uniform4f(u.uPoke, ...this.poke);
    this.poke = [0, 0, 0, 0];
    gl.bindVertexArray(this.simVao[src]);
    // The buffer written to may not stay bound anywhere else.
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.bufs[dst]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, COUNT);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    this.cur = dst;
  }

  private kick(ix: number, iy: number, spin: number, stir: number) {
    this.impulse[0] = clamp(this.impulse[0] + ix, -1.5, 1.5);
    this.impulse[1] = clamp(this.impulse[1] + iy, -1.5, 1.5);
    this.spin = clamp(this.spin + spin, -7, 7);
    this.stir = clamp(this.stir + stir, 0, 1.5);
    this.stirred = true;
  }

  /**
   * Reads how the hand moved the main card since the last frame and stirs the liquid to match.
   * Only the hand's part of the pose counts: the motion alone leaves the glitter to its loop.
   */
  private feel(view: GlobeView, d: CardDraw, hand: NonNullable<CardDraw['hand']>) {
    const t = performance.now() / 1000;
    const { x, y, rx, ry, rz } = hand;
    const p = this.prev;
    if (!p || t - p.t > 0.25) {
      this.prev = { t, x, y, rx, ry, rz, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 };
      return;
    }
    const dt = t - p.t;
    if (dt < 1 / 240) return;
    const vx = (x - p.x) / dt;
    const vy = (y - p.y) / dt;
    const wx = (rx - p.rx) / dt;
    const wy = (ry - p.ry) / dt;
    const wz = (rz - p.rz) / dt;
    // Changes in the card's velocity: the liquid inside keeps going the old way.
    const ax = vx - p.vx;
    const ay = vy - p.vy;
    const bx = wx - p.wx;
    const by = wy - p.wy;
    const bz = wz - p.wz;
    const jolt = Math.hypot(ax, ay) * 0.35 + Math.hypot(bx, by) * 0.05 + Math.abs(bz) * 0.08;
    if (jolt > 0.02) {
      this.kick(clamp(-ax * 0.8 + by * 0.08, -0.6, 0.6), clamp(-ay * 0.8 - bx * 0.08, -0.6, 0.6), clamp(-bz * 1.2, -2, 2), Math.min(jolt, 0.3));
    }
    Object.assign(p, { t, x, y, rx, ry, rz, vx, vy, wx, wy, wz });

    // A pointer sweeping across the art drags the liquid with it.
    if (!(view.canvas instanceof HTMLCanvasElement) || performance.now() - input.at > 100) return;
    const rect = view.canvas.getBoundingClientRect();
    const cw = d.w * d.scale;
    const ch = d.h * d.scale;
    const u = (input.x - rect.left - (d.cx - cw / 2)) / cw;
    const v = (input.y - rect.top - (d.cy - ch / 2)) / ch;
    const art = this.art.uv;
    const ax2 = (u - art[0]) / art[2];
    const ay2 = (v - art[1]) / art[3];
    if (ax2 < -0.1 || ax2 > 1.1 || ay2 < -0.1 || ay2 > 1.1) return;
    const k = 1 / (cw * art[2]);
    const pvx = clamp(input.vx * k, -4, 4);
    const pvy = clamp(input.vy * k, -4, 4);
    if (!pvx && !pvy) return;
    this.poke = [ax2, ay2, pvx, pvy];
    this.stir = Math.min(1.5, this.stir + Math.hypot(pvx, pvy) * dt * 0.25);
    this.stirred = true;
  }
}
