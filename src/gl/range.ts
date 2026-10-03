// Where the finish lands on the card: a region/brush texture plus a brightness key, applied in the card shader.
import { createTexture, type Program } from './gl';

/** Spliced into the card fragment shader after the shared helpers. */
export const RANGE_GLSL = /* glsl */ `
uniform sampler2D uRange;  // r: region preset, g: painted in, b: painted out
uniform vec4 uRangeKey;    // brightness low, high, softness, invert (0 or 1)
uniform float uRangeView;  // 0..1: shade what is left out and trace the edge
uniform float uRangeAnts;  // animation phase for the proof overlay (0 when motion is reduced)
float foilRange(vec2 uv, float L) {
  // Thumbnail cards paint their nameplate plain, so read the range there from the plain frame too.
  if (uPlate < 0.5 && uv.y > 0.885) uv = vec2(0.04, 0.5);
  vec3 r = texture(uRange, uv).rgb;
  float s = uRangeKey.z;
  float k = (uRangeKey.x <= 0.001 ? 1.0 : smoothstep(uRangeKey.x - s, uRangeKey.x + s, L))
          * (uRangeKey.y >= 0.999 ? 1.0 : 1.0 - smoothstep(uRangeKey.y - s, uRangeKey.y + s, L));
  float sel = r.r * k;
  sel = mix(sel, 1.0 - sel, uRangeKey.w);
  sel = max(sel, r.g);
  return min(sel, 1.0 - r.b);
}
vec3 showRange(vec3 col, vec2 uv, float sel) {
  if (uRangeView <= 0.0) return col;
  // A foil-stamping proof: left-out areas print as matte paper (pixel dither), the foil gets a
  // travelling sheen, and the edge is a gold die line with a glint running along it.
  vec2 cell = floor(uv * vec2(110.0, 154.0));
  float checker = mod(cell.x + cell.y, 2.0);
  vec3 paper = mix(vec3(luma(col)), vec3(0.95, 0.93, 0.87), 0.45) * mix(0.62, 0.52, checker);
  vec3 o = mix(col, paper, (1.0 - sel) * 0.92);
  float diag = uv.x * 0.714 + uv.y;
  float sweep = smoothstep(0.82, 1.0, 0.5 + 0.5 * sin(diag * 7.0 - uRangeAnts * 1.3));
  o += hsv2rgb(vec3(fract(diag * 0.8 + uRangeAnts * 0.05), 0.55, 1.0)) * sweep * 0.22 * sel;
  float w = max(fwidth(sel), 1e-4);
  float edge = 1.0 - smoothstep(0.8, 1.9, abs(sel - 0.5) / w);
  float dash = step(0.35, fract(diag * 34.0));
  float glint = smoothstep(0.9, 1.0, 0.5 + 0.5 * sin(diag * 5.0 - uRangeAnts * 2.2));
  vec3 die = mix(vec3(0.95, 0.76, 0.31), vec3(1.0), glint);
  o = mix(o, mix(vec3(0.07, 0.1, 0.11), die, dash), edge);
  return mix(col, o, uRangeView);
}
`;

export const RANGE_W = 450;
export const RANGE_H = 630;

export interface RangeSnapshot {
  /** RGBA, RANGE_W × RANGE_H: r region, g painted in, b painted out. */
  data: Uint8Array;
  lo: number;
  hi: number;
  invert: boolean;
}

/** Owns the range texture of one card renderer and feeds its uniforms. */
export class RangeLayer {
  private tex: WebGLTexture;
  private key: [number, number, number, number] = [0, 1, 0.06, 0];
  /** Marching ants crawl only when motion is allowed. */
  motion = true;

  constructor(private gl: WebGL2RenderingContext) {
    this.tex = createTexture(gl, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
  }

  set(s: RangeSnapshot): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RANGE_W, RANGE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, s.data);
    this.key = [s.lo, s.hi, 0.06, s.invert ? 1 : 0];
  }

  bind(p: Program, unit: number, view: number, time: number): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(p.u.uRange, unit);
    gl.uniform4fv(p.u.uRangeKey, this.key);
    gl.uniform1f(p.u.uRangeView, view);
    gl.uniform1f(p.u.uRangeAnts, this.motion ? time * 1.6 : 0);
  }
}
