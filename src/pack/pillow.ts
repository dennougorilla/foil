// The pack as a filled foil pillow. The wrapper is first printed with its finish (the card shader,
// into an offscreen texture), then drawn on a grid mesh that bulges toward the viewer: when it
// tilts the bulge shows in perspective, the sides fall into shade and a sharp highlight runs along
// the bulge and the foil's wrinkles. Light is worked out on the wrapper's own pixel grid, so it
// moves in blocks like the art. The crimp seals stay flat and catch light along their ridges.

import { startProgram, type PendingProgram } from '../gl/gl';
import type { CardRenderer, RGB } from '../gl/renderers';
import { GRID_H, GRID_W } from './packArt';

const VS = /* glsl */ `#version 300 es
in vec2 aGrid;              // 0..1 across the piece of the pack being drawn
uniform vec2 uRes;          // canvas size, css px
uniform vec2 uCenter;       // centre of the whole pack, css px
uniform vec2 uSize;         // size of the whole pack, css px
uniform vec3 uRot;
uniform float uScale;
uniform vec2 uShift;        // screen offset (the shadow)
uniform vec2 uV;            // the rows of the pack this piece covers (0 = top, 1 = bottom)
uniform float uBulge;       // how far the middle stands out, css px
uniform float uFlat;        // 1: drawn flat (the shadow)
uniform float uSeal;        // the seals' height, as a fraction of the pack
out vec2 vUv;
out vec3 vN;
out float vRim;

float height(vec2 uv) {
  vec2 q = uv * 2.0 - 1.0;
  // Full in the middle, falling off steeply at the sides; flat across the crimp seals.
  float body = smoothstep(uSeal, uSeal + 0.07, uv.y) * smoothstep(uSeal, uSeal + 0.07, 1.0 - uv.y);
  return (1.0 - pow(abs(q.x), 3.0)) * (1.0 - pow(abs(q.y), 6.0)) * body;
}

vec3 rot(vec3 p) {
  float cz = cos(uRot.z), sz = sin(uRot.z);
  p.xy = mat2(cz, sz, -sz, cz) * p.xy;
  float cx = cos(uRot.x), sx = sin(uRot.x);
  p.yz = mat2(cx, sx, -sx, cx) * p.yz;
  float cy = cos(uRot.y), sy = sin(uRot.y);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  return p;
}

void main() {
  vec2 uv = vec2(aGrid.x, mix(uV.x, uV.y, aGrid.y));
  float h = height(uv) * (1.0 - uFlat);
  vec3 p = vec3((uv - 0.5) * uSize * uScale, h * uBulge * uScale);
  // The surface's slope, for its normal.
  float e = 0.01;
  float hx = (height(uv + vec2(e, 0.0)) - height(uv - vec2(e, 0.0))) * uBulge / (2.0 * e * uSize.x);
  float hy = (height(uv + vec2(0.0, e)) - height(uv - vec2(0.0, e))) * uBulge / (2.0 * e * uSize.y);
  vN = rot(normalize(vec3(-hx, -hy, 1.0)));
  vRim = clamp(length(vec2(hx, hy)) * 1.6, 0.0, 1.0);
  p = rot(p);
  float D = max(uSize.y, 120.0) * 3.2;
  float w = (D - p.z) / D;
  vec2 s = uCenter + uShift + p.xy / w;
  gl_Position = vec4(vec2(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0) * w, 0.0, w);
  vUv = uv;
}
`;

const FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vN;
in float vRim;
uniform sampler2D uTex;     // the printed wrapper (premultiplied, rows bottom-up)
uniform vec2 uGrid;         // the wrapper's pixel grid
uniform vec2 uLightDir;     // where the light comes from, -1..1
uniform vec3 uSpec;         // highlight color
uniform float uAlpha;
uniform float uShadow;      // 1: draw as the hard drop shadow
uniform float uSeal;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// Crumpled foil: ridged noise, stronger toward the seals and the sides where the bag is pinched.
float crumple(vec2 g) {
  float r = 1.0 - abs(vnoise(g * vec2(0.055, 0.028)) * 2.0 - 1.0);
  r = r * r * r * 0.8 + (1.0 - abs(vnoise(g * 0.12 + 7.0) * 2.0 - 1.0)) * 0.2;
  vec2 uv = g / uGrid;
  float pinch = smoothstep(0.25, 0.0, min(uv.y - uSeal, 1.0 - uSeal - uv.y)) + smoothstep(0.2, 0.0, min(uv.x, 1.0 - uv.x)) * 0.6;
  return r * (0.35 + pinch);
}

void main() {
  vec4 base = texture(uTex, vec2(vUv.x, 1.0 - vUv.y));
  if (base.a < 0.01) discard;
  if (uShadow > 0.5) { o = vec4(0.0, 0.0, 0.0, base.a * 0.6 * uAlpha); return; }
  // Everything below is worked out per wrapper pixel.
  vec2 g = floor(vUv * uGrid) + 0.5;
  bool seal = vUv.y < uSeal || vUv.y > 1.0 - uSeal;
  vec3 n = normalize(vN);
  if (seal) {
    // Ridges pressed across the seal: alternate slopes up and down.
    float r = sin(g.y * 2.2);
    n = normalize(n + vec3(0.0, r * 0.55, 0.0));
  } else {
    float c = crumple(g);
    float cx = crumple(g + vec2(1.0, 0.0)) - c;
    float cy = crumple(g + vec2(0.0, 1.0)) - c;
    n = normalize(n + vec3(-cx, -cy, 0.0) * 1.5);
  }
  vec3 L = normalize(vec3(uLightDir, 0.85));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = 0.62 + 0.5 * max(dot(n, L), 0.0) - vRim * 0.28;
  // In steps, like a palette.
  diff = floor(diff * 6.0 + 0.5) / 6.0;
  float sh = max(dot(n, H), 0.0);
  float spec = step(0.993, sh) * 0.8 + pow(sh, 36.0) * 0.45;
  spec = floor(spec * 4.0 + 0.5) / 4.0;
  if (seal) spec *= 1.4;
  vec3 col = base.rgb * diff + uSpec * spec * base.a;
  o = vec4(col, base.a) * uAlpha;
}
`;

/** Rows and columns of the mesh: enough for a smooth bulge. */
const COLS = 24;
const ROWS = 36;
/** The offscreen print, at the wrapper's own pixel size times two (its pixels stay crisp). */
const PRINT_W = GRID_W * 4;
const PRINT_H = GRID_H * 4;

export interface PillowDraw {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  alpha: number;
  /** Rows of the pack drawn: [0, 1] for all of it; the body after the tear starts below the strip. */
  rows?: [number, number];
  /** Where the light comes from, -1..1 (x right, y down). */
  light: [number, number];
  spec: RGB;
  /** The hard drop shadow's offset, css px; none when absent. */
  shadow?: [number, number];
}

/** One wrapper's printed texture. */
export interface Print {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
}

export class Pillow {
  private pending: PendingProgram;
  private vao: WebGLVertexArrayObject;
  private count: number;

  constructor(private r: CardRenderer) {
    const { gl } = r;
    this.pending = startProgram(gl, VS, FS, 'aGrid');
    const verts: number[] = [];
    for (let j = 0; j < ROWS; j++)
      for (let i = 0; i < COLS; i++) {
        const [u0, u1, v0, v1] = [i / COLS, (i + 1) / COLS, j / ROWS, (j + 1) / ROWS];
        verts.push(u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1);
      }
    this.count = verts.length / 2;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** A texture the wrapper is printed into. */
  createPrint(): Print {
    const { gl } = this.r;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, PRINT_W, PRINT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  /**
   * Prints a wrapper with its finish into `print`. `edition` is the wrapper finish's shader
   * index; `tilt` moves its sheen. Returns false while that finish is still compiling.
   */
  print(p: Print, face: string, edition: number, tilt: [number, number], light: [number, number], time: number): boolean {
    const { r } = this;
    const { gl } = r;
    if (!r.ready(edition)) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, p.fb);
    gl.viewport(0, 0, PRINT_W, PRINT_H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const [w, h] = [r.cssW, r.cssH];
    r.cssW = PRINT_W;
    r.cssH = PRINT_H;
    r.drawCard(
      { cx: PRINT_W / 2, cy: PRINT_H / 2, w: PRINT_W, h: PRINT_H, rx: 0, ry: 0, rz: 0, scale: 1, edition, intensity: 0.7, pixel: 0, tilt, light, alpha: 1, flash: 0, shadow: null, plate: false, face },
      time,
    );
    r.cssW = w;
    r.cssH = h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, r.canvas.width, r.canvas.height);
    return true;
  }

  draw(p: Print, d: PillowDraw): void {
    const { gl } = this.r;
    const prog = this.pending.get();
    const u = prog.u;
    gl.useProgram(prog.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, p.tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uRes, this.r.cssW, this.r.cssH);
    gl.uniform2f(u.uCenter, d.cx, d.cy);
    gl.uniform2f(u.uSize, d.w, d.h);
    gl.uniform3f(u.uRot, d.rx, d.ry, d.rz);
    gl.uniform1f(u.uScale, d.scale);
    const rows = d.rows ?? [0, 1];
    gl.uniform2f(u.uV, rows[0], rows[1]);
    gl.uniform1f(u.uBulge, d.w * 0.16);
    gl.uniform1f(u.uSeal, 15 / GRID_H);
    gl.uniform2f(u.uGrid, GRID_W, GRID_H);
    gl.uniform2f(u.uLightDir, d.light[0], d.light[1]);
    gl.uniform3f(u.uSpec, d.spec[0], d.spec[1], d.spec[2]);
    gl.uniform1f(u.uAlpha, d.alpha);
    if (d.shadow) {
      gl.uniform1f(u.uShadow, 1);
      gl.uniform1f(u.uFlat, 1);
      gl.uniform2f(u.uShift, d.shadow[0], d.shadow[1]);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
    }
    gl.uniform1f(u.uShadow, 0);
    gl.uniform1f(u.uFlat, 0);
    gl.uniform2f(u.uShift, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}
