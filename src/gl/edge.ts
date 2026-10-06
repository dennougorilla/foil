// The card's thickness (card/thickness.ts): the side of the slab round the face, and for an acrylic
// block its clear caps and its faint shadow. Drawn by CardRenderer around the card's own passes, with
// the same projection as CARD_VS, so the side meets the face exactly.
import { startProgram, type PendingProgram } from './gl';
import { COMMON } from './common';

/** Segments in each rounded corner of the side. */
const CORNER = 6;

const EDGE_VS = /* glsl */ `#version 300 es
in vec4 aE;            // side: corner sign x, y, angle round the corner, -1 back / 1 front; cap: x, y in -0.5..0.5
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uSize;    // the card's size in css px (for the camera distance, as CARD_VS)
uniform vec3 uRot;
uniform vec2 uShift;
uniform vec2 uHalf;    // the slab's half size, px
uniform float uRadius; // its corner, px
uniform float uDepth;  // its depth, px
uniform float uCap;    // 0 = the side; 1 = the cap facing the viewer, -1 = the far one
out vec3 vL;           // x, y in px from the middle; z from -1 (back) to 1 (front)
out vec3 vN;           // the normal, turned
out vec3 vV;           // to the eye, turned
vec3 turn(vec3 p) {
  float cz = cos(uRot.z), sz = sin(uRot.z);
  p.xy = mat2(cz, sz, -sz, cz) * p.xy;
  float cx = cos(uRot.x), sx = sin(uRot.x);
  p.yz = mat2(cx, sx, -sx, cx) * p.yz;
  float cy = cos(uRot.y), sy = sin(uRot.y);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  return p;
}
void main() {
  vec3 p, n;
  if (uCap == 0.0) {
    vec2 dir = vec2(cos(aE.z), sin(aE.z));
    p = vec3(aE.xy * (uHalf - uRadius) + uRadius * dir, aE.w * uDepth * 0.5);
    n = vec3(dir, 0.0);
    vL = vec3(p.xy, aE.w);
  } else {
    float side = (turn(vec3(0.0, 0.0, 1.0)).z >= 0.0 ? 1.0 : -1.0) * uCap;
    p = vec3(aE.xy * 2.0 * uHalf, side * uDepth * 0.5);
    n = vec3(0.0, 0.0, side);
    vL = vec3(p.xy, side);
  }
  vec3 q = turn(p);
  vN = turn(n);
  float D = max(max(uSize.x, uSize.y), 120.0) * 3.2;
  vV = vec3(0.0, 0.0, D) - q;
  float w = (D - q.z) / D;
  vec2 s = uCenter + uShift + q.xy / w;
  vec2 ndc = vec2(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0);
  gl_Position = vec4(ndc * w, 0.0, w);
}
`;

const EDGE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vL;
in vec3 vN;
in vec3 vV;
uniform sampler2D uFace;
uniform sampler2D uBack;
uniform vec2 uCardHalf;  // the card's half size, px (its face spans it)
uniform vec2 uHalf;
uniform float uRadius;
uniform float uCap;
uniform float uWhich;    // the side: 1 = the part facing the viewer, -1 = the part facing away
uniform float uShadow;   // 1 = the block's shadow
uniform float uAlpha;
uniform float uMaterial; // 0 paper, 1 acrylic
uniform float uPlies;
uniform vec2 uLight;     // the highlight's place in card uv
uniform vec2 uTilt;
out vec4 o;
${COMMON}
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec3 unpremul(vec4 c) { return c.rgb / max(c.a, 1e-4); }
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  if (uCap == 0.0 && dot(N, vV) * uWhich < 0.0) discard;
  if (uCap != 0.0 && box(vL.xy, uHalf, uRadius) > 0.0) discard;
  if (uShadow > 0.5) { o = vec4(0.0, 0.0, 0.0, 0.16 * uAlpha); return; }
  // The light comes from in front, leaning toward the highlight (y down, as the card's uv).
  vec3 Ld = normalize(vec3((uLight - 0.5) * 2.0, 1.0));
  float lam = max(dot(N, Ld), 0.0);
  float z = vL.z;
  // The face just inside this point of the side.
  vec2 uv = clamp(vL.xy * 0.985 / (2.0 * uCardHalf) + 0.5, 0.002, 0.998);
  if (uMaterial < 0.5) {
    // Paper: the print of the face and of the back wraps the edge; between them the core, a dark
    // line down its middle (a trading card's), the plies split by fine glue lines.
    float t = z * 0.5 + 0.5;
    float band = mix(0.2, 0.07, clamp((uPlies - 2.0) / 10.0, 0.0, 1.0));
    vec3 paper = vec3(0.93, 0.91, 0.86);
    vec3 col;
    if (t > 1.0 - band) {
      vec4 f = texture(uFace, uv);
      col = f.a > 0.5 ? unpremul(f) : paper;
    } else if (t < band) {
      vec4 b = texture(uBack, vec2(1.0 - uv.x, uv.y));
      col = b.a > 0.5 ? unpremul(b) : paper;
    } else {
      float k = (t - band) / (1.0 - 2.0 * band);
      float ply = floor(k * uPlies);
      col = paper * (0.95 + 0.05 * hash12(vec2(ply, 3.0)));
      // Paper grain along the edge.
      col *= 0.96 + 0.04 * hash12(vec2(floor((vL.x + vL.y) * 0.5), ply));
      float f = fract(k * uPlies);
      if (ply > 0.5) col *= 1.0 - 0.16 * step(f, 0.12);
      col = mix(col, vec3(0.13, 0.15, 0.22), step(abs(k - 0.5), 0.15 / uPlies));
    }
    col *= 0.8 + 0.3 * lam;
    // A fine bright lip where the side turns into the face or the back.
    col += 0.1 * smoothstep(0.88, 1.0, abs(z)) * lam;
    col = floor(col * 18.0 + 0.5) / 18.0;
    o = vec4(clamp(col, 0.0, 1.0), 1.0) * uAlpha;
    return;
  }
  // Acrylic: clear, a cool tint deepening where the side is seen edge-on.
  vec3 tint = vec3(0.7, 0.93, 0.96);
  float fres = pow(1.0 - abs(dot(N, V)), 2.0);
  if (uCap != 0.0) {
    // The block's front and back: nearly clear, a bright rim round its outline, and a gloss that
    // slides across the front as the card tilts.
    float d = -box(vL.xy, uHalf, uRadius);
    float rim = 1.0 - smoothstep(0.0, 2.5, d);
    vec2 q = vL.xy / uHalf;
    float g = q.x * 0.6 + q.y * 0.8 + uTilt.x * 0.9 + uTilt.y * 0.6;
    float streak = smoothstep(0.16, 0.0, abs(g - 0.4)) * 0.16 + smoothstep(0.04, 0.0, abs(g + 0.05)) * 0.1;
    // Off the card, the margin is a touch more tinted, so the block reads round it.
    float margin = step(0.0, box(vL.xy, uCardHalf, uRadius * 0.6));
    float near = uCap > 0.0 ? 1.0 : 0.4;
    float a = (0.05 + 0.07 * margin + rim * 0.55) * near;
    o = vec4(tint * a + vec3(1.0) * (streak + rim * 0.35 + fres * 0.1) * near, a) * uAlpha;
    return;
  }
  // The side: the card inside shows through it, stretched by the refraction; the rims flare.
  vec3 inside = unpremul(texture(uFace, clamp((uv - 0.5) * 0.9 + 0.5 + N.xy * 0.03, 0.0, 1.0)));
  float rim = smoothstep(0.78, 0.96, abs(z));
  float spec = pow(max(dot(reflect(-Ld, N), V), 0.0), 20.0);
  float a = 0.3 + 0.3 * fres + 0.45 * rim;
  vec3 col = (tint * (0.45 + 0.4 * lam) + inside * 0.35) * a + vec3(1.0) * (rim * 0.6 + spec * 0.5);
  if (uWhich < 0.0) { col *= 0.5; a *= 0.5; }
  o = vec4(col, a) * uAlpha;
}
`;

/** The side's triangles (each vertex: corner sign x, y, angle, front or back), then the cap's two. */
function geometry(): Float32Array {
  const ring: [number, number, number][] = [];
  const signs = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  signs.forEach(([sx, sy], k) => {
    for (let i = 0; i <= CORNER; i++) ring.push([sx, sy, ((k + i / CORNER) * Math.PI) / 2]);
  });
  const out: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (const [p, z] of [[a, 1], [b, 1], [b, -1], [a, 1], [b, -1], [a, -1]] as const) out.push(p[0], p[1], p[2], z);
  }
  for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]]) out.push(x, y, 0, 0);
  return new Float32Array(out);
}

export interface EdgeView {
  cx: number;
  cy: number;
  /** The card's size before scale (the camera distance), and its rotation. */
  w: number;
  h: number;
  rx: number;
  ry: number;
  rz: number;
  /** The card's half size as drawn, the slab's half size, its corner and depth, all in px. */
  card: [number, number];
  half: [number, number];
  radius: number;
  depth: number;
  acrylic: boolean;
  plies: number;
  light: [number, number];
  tilt: [number, number];
  alpha: number;
}

export class EdgeRenderer {
  private program: PendingProgram;
  private vao: WebGLVertexArrayObject;
  private sides: number;

  constructor(private gl: WebGL2RenderingContext) {
    this.program = startProgram(gl, EDGE_VS, EDGE_FS, 'aE');
    const data = geometry();
    this.sides = data.length / 4 - 6;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  ready(): boolean {
    return this.program.done();
  }

  /** Takes the GL over for the slab of `v`, the face at texture unit 0 and the back at 2. */
  use(v: EdgeView, res: [number, number]): void {
    const { gl } = this;
    const p = this.program.get();
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(p.u.uFace, 0);
    gl.uniform1i(p.u.uBack, 2);
    gl.uniform2f(p.u.uRes, res[0], res[1]);
    gl.uniform2f(p.u.uCenter, v.cx, v.cy);
    gl.uniform2f(p.u.uSize, v.w, v.h);
    gl.uniform3f(p.u.uRot, v.rx, v.ry, v.rz);
    gl.uniform2f(p.u.uHalf, v.half[0], v.half[1]);
    gl.uniform2f(p.u.uCardHalf, v.card[0], v.card[1]);
    gl.uniform1f(p.u.uRadius, v.radius);
    gl.uniform1f(p.u.uDepth, v.depth);
    gl.uniform1f(p.u.uMaterial, v.acrylic ? 1 : 0);
    gl.uniform1f(p.u.uPlies, v.plies);
    gl.uniform2f(p.u.uLight, v.light[0], v.light[1]);
    gl.uniform2f(p.u.uTilt, v.tilt[0], v.tilt[1]);
    gl.uniform1f(p.u.uAlpha, v.alpha);
    gl.uniform2f(p.u.uShift, 0, 0);
    gl.uniform1f(p.u.uShadow, 0);
  }

  /** The side: the part facing the viewer (1) or the part facing away (-1, seen through acrylic). */
  side(which: 1 | -1): void {
    const p = this.program.get();
    this.gl.uniform1f(p.u.uCap, 0);
    this.gl.uniform1f(p.u.uWhich, which);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.sides);
  }

  /** An acrylic block's cap: the one facing the viewer (1) or the far one (-1). */
  cap(which: 1 | -1): void {
    const p = this.program.get();
    this.gl.uniform1f(p.u.uCap, which);
    this.gl.drawArrays(this.gl.TRIANGLES, this.sides, 6);
  }

  /** An acrylic block's faint shadow, shifted by `shift`. */
  shadow(shift: [number, number]): void {
    const { gl } = this;
    const p = this.program.get();
    gl.uniform1f(p.u.uShadow, 1);
    gl.uniform2f(p.u.uShift, shift[0], shift[1]);
    this.cap(1);
    gl.uniform1f(p.u.uShadow, 0);
    gl.uniform2f(p.u.uShift, 0, 0);
  }
}
