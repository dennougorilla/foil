// Snow Globe: the art window is a pane of clear liquid with thousands of glitter and gold-leaf
// flakes in it. The flakes live on the GPU: a transform-feedback pass moves them through a
// simple fluid (a swirl, a slosh, some turbulence, a slow convection), and a point pass draws
// them on the card as tumbling flakes that catch the light. The liquid and glass themselves are
// drawn by the card shader (SNOWGLOBE_GLSL below, in the Supporter pack's program).
//
// Shaking comes from the card itself (tossing, flicking the tilt, a click's wobble), a pointer
// sweeping across the art, and on phones the motion sensor. Exports and reduced motion never
// take input: the flakes only move while the shader clock moves.
import { artOf } from '../card/face';
import { cardK } from '../card/shape';
import type { CardDraw } from './renderers';

/** Card shader index of the finish. Kept clear of the regular and sponsor ranges. */
export const SNOWGLOBE_SHADER = 60;

/** The liquid and the glass, spliced into the card shader. */
export const SNOWGLOBE_GLSL = /* glsl */ `
// Snow Globe: the art seen through a curved pane of clear liquid. The glitter in it is drawn as
// GPU particles on top of the card (below). g is the card uv (not the pattern).
vec3 snowglobe(vec3 c, vec2 g, vec2 t, float L, float lod, float art) {
  vec4 W = uArt; // art window: left, top, right, bottom
  vec2 a = (g - W.xy) / (W.zw - W.xy);
  // The window in units of its short side.
  vec2 win = (W.zw - W.xy) * uCardK;
  win /= min(win.x, win.y);
  vec2 q = (a - 0.5) * 2.0 * win;
  float r2 = dot(q, q) / 2.8;
  // The liquid lens magnifies a touch toward the middle and never quite stops moving.
  vec2 wob = vec2(vnoise(g * 5.0 + vec2(uTime * 0.2, 0.0)), vnoise(g * 5.0 + vec2(5.2, -uTime * 0.17))) - 0.5;
  vec2 s = g - (g - (W.xy + W.zw) * 0.5) * 0.07 * (1.0 - min(r2, 1.0)) + wob * 0.006 + t * 0.005;
  vec3 col = mix(c, face(tunePattern(s), lod).rgb, art);
  // Clear water with a faint cool cast, deeper toward the walls.
  float edge = min(min(a.x, 1.0 - a.x) * win.x, min(a.y, 1.0 - a.y) * win.y);
  col = mix(col, col * vec3(0.9, 0.97, 1.05) + vec3(0.0, 0.012, 0.03), 0.7);
  col *= 1.0 - 0.3 * smoothstep(0.14, 0.0, edge);
  // Light through the moving water, rippling over the lower half.
  float caus = 1.0 - abs(vnoise(g * vec2(9.0, 7.0) + vec2(uTime * 0.25, uTime * 0.1)) * 2.0 - 1.0);
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

const SIM_VS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec4 aState;          // position (art uv, y down), velocity (art widths/s)
uniform float uDt;
uniform float uTime;
uniform vec2 uKick;      // the glass was jolted: flakes lag behind it (art widths/s)
uniform float uSpin;     // swirl of the liquid
uniform float uStir;     // turbulence, 0 calm .. ~1.5 shaken hard
uniform vec2 uGrav;      // card-local down
uniform vec4 uPoke;      // a pointer sweeping through: position (art uv), velocity
uniform float uA;        // height of the art window in widths; the sim runs in these square units
out vec4 vState;
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
// The liquid's stream function. It fades to zero at the glass, so the flow runs along the walls
// and never into them: one big swirl, turbulence while shaken, and a lazy convection cell that
// keeps the light glitter turning over while nobody touches it.
float stream(vec2 P) {
  float wall = sin(3.14159 * clamp(P.x, 0.0, 1.0)) * sin(3.14159 * clamp(P.y / A, 0.0, 1.0));
  vec2 p = P * 1.3;
  float t = uTime * 0.25;
  float turb = noise(p * 2.4 + vec2(0.0, t)) + 0.5 * noise(p * 5.1 + vec2(t * 0.7, 3.1));
  // Turbulence reaches close to the glass so nothing gets stranded against it.
  float near = pow(wall, 0.35);
  return uSpin * 0.1 * wall * wall + near * (turb * (0.006 + 0.1 * uStir) + 0.011);
}
vec2 flow(vec2 P) {
  const float e = 0.01;
  float dy = stream(P + vec2(0.0, e)) - stream(P - vec2(0.0, e));
  float dx = stream(P + vec2(e, 0.0)) - stream(P - vec2(e, 0.0));
  return vec2(dy, -dx) / (2.0 * e);
}
void main() {
  int id = gl_VertexID;
  vec2 P = vec2(aState.x, aState.y * A);
  vec2 v = aState.zw;
  // Fine glitter barely sinks and keeps drifting; leaf flakes settle within a few seconds.
  float leaf = step(0.82, rnd(id, 2));
  float sink = mix(mix(0.006, 0.03, rnd(id, 3)), mix(0.05, 0.09, rnd(id, 4)), leaf);
  float follow = mix(mix(6.0, 10.0, rnd(id, 5)), 2.5, leaf);

  vec2 U = flow(P);
  v += uKick * mix(0.6, 1.0, max(leaf, rnd(id, 15)));
  vec2 pp = vec2(uPoke.x, uPoke.y * A);
  vec2 dp = P - pp;
  U += uPoke.zw * exp(-dot(dp, dp) / 0.012);

  v += (U + uGrav * sink - v) * min(follow * uDt, 1.0);
  P += v * uDt;

  // Glass walls; the floor is a loose bed a few flakes deep.
  float floorY = A - 0.006 - 0.035 * rnd(id, 6);
  if (P.y > floorY) {
    P.y = floorY;
    // Stirred, the bed is lifted off the floor a flake at a time.
    v.y = min(v.y, -uStir * mix(0.0, 0.9, rnd(id, 16)));
    v.x *= 0.9;
  }
  if (P.y < 0.008) { P.y = 0.008; v.y = abs(v.y) * 0.3; }
  if (P.x < 0.008) { P.x = 0.008; v.x = abs(v.x) * 0.3; }
  if (P.x > 0.992) { P.x = 0.992; v.x = -abs(v.x) * 0.3; }
  vState = vec4(P.x, P.y / A, v);
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
in vec4 aState;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform vec3 uRot;
uniform float uScale;
uniform float uDpr;
uniform float uTime;
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
${HASH}
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  int id = gl_VertexID;
  vec2 cuv = ART_UV.xy + aState.xy * ART_UV.zw;
  bool shown = rnd(id, 1) < uShow && textureLod(uMask, cuv, 0.0).r > 0.5;
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

  float leaf = step(0.82, rnd(id, 2));
  float size = mix(mix(0.0028, 0.0055, rnd(id, 7)), mix(0.008, 0.014, rnd(id, 8)), leaf) * min(uSize.x, uSize.y) * (7.0 / 5.0) * uScale / w; // sized as on the trading card's height
  // The sprite leaves room around the flake for its glint to flare.
  gl_PointSize = max(size * 3.0 * uDpr, 2.0);

  // Each flake tumbles, faster while the liquid carries it.
  float speed = length(aState.zw);
  float a = rnd(id, 9) * 6.2832 + uTime * mix(0.3, 1.4, rnd(id, 10)) + speed * 2.0;
  float b = rnd(id, 11) * 6.2832 + uTime * mix(0.2, 1.1, rnd(id, 12)) + speed * 3.0;
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
  vCol = base * mix(0.1 + 0.3 * max(dot(fn, L), 0.0), 0.3 + 0.5 * max(dot(fn, L), 0.0), leaf);
  vCover = mix(0.55, 0.95, leaf);
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
  private grav: [number, number] = [0, 1];
  private poke: [number, number, number, number] = [0, 0, 0, 0];
  // The main card's last pose, to feel how it is being moved.
  private prev: { t: number; x: number; y: number; rx: number; ry: number; rz: number; vx: number; vy: number; wx: number; wy: number; wz: number } | null = null;

  constructor(
    private gl: WebGL2RenderingContext,
    /** Exports: no input, the flakes just drift. */
    private settled: boolean,
  ) {
    this.sim = compile(gl, SIM_VS, SIM_FS, ['vState']);
    this.draw_ = compile(gl, DRAW_VS, DRAW_FS);
    this.su = uniforms(gl, this.sim, ['uDt', 'uTime', 'uKick', 'uSpin', 'uStir', 'uGrav', 'uPoke', 'uA']);
    this.du = uniforms(gl, this.draw_, [
      'uRes', 'uCenter', 'uSize', 'uRot', 'uScale', 'uDpr', 'uTime', 'uShow', 'uTilt', 'uLight', 'uMask', 'uAlpha', 'uArtUv', 'uCardK',
    ]);
    // Start mid-drift: most flakes hang in the liquid, a bed of them lies on the floor.
    const data = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      data[i * 4] = 0.02 + Math.random() * 0.96;
      data[i * 4 + 1] = Math.random() < 0.3 ? 0.94 + Math.random() * 0.05 : 0.02 + Math.random() * 0.94;
    }
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

  /** Draws the flakes over a card that was just drawn; the mask must still be bound to unit 1. */
  draw(view: GlobeView, d: CardDraw, time: number): void {
    const { gl } = this;
    const main = d.plate !== false && !this.settled;
    if (main) this.feel(view, d);
    if (time !== this.time) {
      const dt = Number.isNaN(this.time) ? 0 : clamp(time - this.time, 0, MAX_DT);
      this.time = time;
      if (dt > 0) this.step(dt);
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
    gl.uniform1f(u.uTime, time);
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

  private step(dt: number) {
    const { gl } = this;
    // The liquid calms down slowly; the flakes take even longer to settle.
    this.spin *= Math.exp(-dt / 2.4);
    this.stir *= Math.exp(-dt / 1.8);
    const s = input.shake;
    if (!this.settled && (s[0] || s[1])) {
      // Phone shaken: the liquid lags behind the glass.
      const m = Math.hypot(s[0], s[1]);
      if (m > 1.5) {
        this.kick(-s[0] * 0.05, -s[1] * 0.05, (Math.random() - 0.5) * m * 0.15, m * 0.04);
      }
      s[0] = s[1] = 0;
    }
    const src = this.cur;
    const dst = 1 - src;
    gl.useProgram(this.sim);
    const u = this.su;
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform2f(u.uKick, this.impulse[0], this.impulse[1]);
    this.impulse = [0, 0];
    gl.uniform1f(u.uSpin, this.spin);
    gl.uniform1f(u.uStir, this.stir);
    gl.uniform2f(u.uGrav, this.grav[0], this.grav[1]);
    gl.uniform4f(u.uPoke, ...this.poke);
    gl.uniform1f(u.uA, this.art.A);
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
  }

  /** Reads how the main card moved since the last frame and stirs the liquid to match. */
  private feel(view: GlobeView, d: CardDraw) {
    const t = performance.now() / 1000;
    const x = d.cx / d.h;
    const y = d.cy / d.h;
    const p = this.prev;
    this.grav = [Math.sin(d.rz), Math.cos(d.rz)];
    if (!p || t - p.t > 0.25) {
      // Just picked: give it a shake so it lands swirling.
      if (!p || t - p.t > 0.6) this.kick(0, -0.5, (Math.random() < 0.5 ? -1 : 1) * 4, 1.1);
      this.prev = { t, x, y, rx: d.rx, ry: d.ry, rz: d.rz, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 };
      return;
    }
    const dt = t - p.t;
    if (dt < 1 / 240) return;
    const vx = (x - p.x) / dt;
    const vy = (y - p.y) / dt;
    const wx = (d.rx - p.rx) / dt;
    const wy = (d.ry - p.ry) / dt;
    const wz = (d.rz - p.rz) / dt;
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
    Object.assign(p, { t, x, y, rx: d.rx, ry: d.ry, rz: d.rz, vx, vy, wx, wy, wz });

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
    this.poke = [ax2, ay2, pvx, pvy];
    this.stir = Math.min(1.5, this.stir + Math.hypot(pvx, pvy) * dt * 0.25);
  }
}
