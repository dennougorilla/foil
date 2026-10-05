// Liquid Metal: the card as a pool of mercury. A mirror that reflects the room around it, the
// picture printed into the metal, small slow waves left alone and ripples where it is touched.
// Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/luma/face and the tune are in scope.
//
// The surface's slope is the sum of a few travelling waves (closed form, rounded to whole cycles
// of an exported loop like Shallows) and the ripple field the touch leaves (src/touch/heat.ts,
// kind 'liquid'), uploaded as a small float texture. The slope tilts the normal; the view ray
// reflected by it looks up the room, so the reflection slides as the card tilts and every ripple
// bends it. The same slope shifts the picture a little, so it wavers under the surface.
import { createTexture, type Program } from './gl';
import type { HeatSource } from '../touch/heat';

export const LIQUID_METAL_GLSL = /* glsl */ `
uniform sampler2D uLmField; // ripple height over the card, square cells, rows top to bottom like uv

// A cubic B-spline through four bilinear taps, so the ripples come out round, not gridded.
float lmField(vec2 uv) {
  vec2 res = vec2(textureSize(uLmField, 0));
  vec2 st = uv * res - 0.5;
  vec2 i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / res;
  vec2 h1 = (i + 1.5 + w3 / g1) / res;
  return g0.y * (g0.x * texture(uLmField, h0).r + g1.x * texture(uLmField, vec2(h1.x, h0.y)).r)
       + g1.y * (g0.x * texture(uLmField, vec2(h0.x, h1.y)).r + g1.x * texture(uLmField, h1).r);
}

// The ripples' slope at uv (face uv), per cell of the field.
vec2 lmRipple(vec2 uv) {
  vec2 e = 1.0 / vec2(textureSize(uLmField, 0));
  return vec2(lmField(uv + vec2(e.x, 0.0)) - lmField(uv - vec2(e.x, 0.0)),
              lmField(uv + vec2(0.0, e.y)) - lmField(uv - vec2(0.0, e.y))) * 0.5;
}

// Small slow waves crossing the pool when nothing touches it: their slope at p (short sides).
vec2 lmIdle(vec2 p) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float a = fi * 2.39996 + 0.9;
    vec2 d = vec2(cos(a), sin(a));
    float k = 9.0 * pow(1.33, fi);
    float w = 0.7 + 0.25 * fi;
    // An exported loop rounds each wave to whole cycles, so the last frame flows into the first.
    if (uLoop > 0.0) w = max(1.0, floor(w * uLoop / 6.2831853 + 0.5)) * 6.2831853 / uLoop;
    s += d * cos(dot(d, p) * k - uTime * w + fi * 1.9) * (0.0065 / pow(1.15, fi));
  }
  return s;
}

// The room the mercury reflects, by direction (stereographic, y down like uv), lit like a photo
// studio so the metal reads at a glance: a big softbox towards the light, a row of thin light
// tubes on the other side (thin lines show every ripple), a pale wall over a darker floor.
vec3 lmRoom(vec3 r) {
  vec2 q = r.xy / (1.0 + max(r.z, -0.8));
  vec2 lw = (uLight - 0.5) * vec2(0.5, 0.35);
  float aa = max(fwidth(q.y), 0.003);
  float hz = 0.2 + 0.08 * q.x * q.x;
  // The wall: brightest just above the horizon, greyer up towards the ceiling.
  vec3 col = mix(vec3(0.95, 0.97, 1.0), vec3(0.3, 0.33, 0.4), smoothstep(hz, hz - 0.75, q.y));
  // The floor under the horizon, darker further down; a soft line where they meet.
  vec3 floorC = mix(vec3(0.36, 0.35, 0.34), vec3(0.16, 0.16, 0.17), smoothstep(hz, hz + 0.45, q.y));
  col = mix(col, floorC, smoothstep(hz - aa, hz + aa, q.y));
  col *= 1.0 - 0.25 * smoothstep(0.02 + aa, 0.0, abs(q.y - hz));
  // The softbox: a broad panel of light with soft, even edges.
  vec2 b = (q - vec2(-0.2, -0.16) - lw) / vec2(0.14, 0.18);
  float box = 1.0 - smoothstep(0.75, 1.0, length(max(abs(b) - 0.55, 0.0)) / 0.45);
  col = mix(col, vec3(1.4, 1.38, 1.33), box);
  // The tubes: thin upright lines, each with a faint glow.
  for (int i = 0; i < 3; i++) {
    float x = 0.14 + 0.06 * float(i) - lw.x * 0.5;
    float d = abs(q.x - x);
    float span = smoothstep(0.3, 0.22, abs(q.y + 0.1 - lw.y * 0.5 + 0.04 * float(i)));
    float taa = max(fwidth(q.x), 0.0015);
    col += (vec3(0.95, 1.0, 1.08) * smoothstep(0.0035 + taa, 0.0035 - taa * 0.5, d) + vec3(0.18, 0.2, 0.23) * exp(-d * d / 0.0008)) * span;
  }
  return col;
}

/** \`art\` is 1 in the art window: the picture wavers there; the frame is mercury with its print still. */
vec3 liquidMetal(vec3 c, vec2 uv, vec2 t, float L, float lod, float art) {
  vec2 cuv = tuneFaceUv(uv);
  vec2 p = (uv - 0.5) * uCardK;
  vec2 res = vec2(textureSize(uLmField, 0));
  // The ripples' slope per short side of the card.
  vec2 ripple = lmRipple(cuv) * (res.x / uCardK.x);
  vec2 slope = lmIdle(p) + ripple * 0.022;
  // Steep ripples tip the normal less and less, so a ring bends the room instead of flipping it.
  vec3 n = normalize(vec3(-slope / (1.0 + 3.0 * length(slope)), 1.0));
  // The eye close in front of the card, so the reflection changes across it as a real mirror's
  // does (the sky above, the horizon low down), and swings round as the card tilts.
  vec3 v = normalize(vec3(t * 0.45 - p * 0.55, 1.0));
  vec3 r = reflect(-v, n);
  vec3 room = lmRoom(r);
  // The picture under the surface, bent by its slope.
  vec2 bend = slope / uCardK * 0.03 * mix(0.3, 1.0, art);
  vec4 a4 = textureLod(uFace, cuv + bend, lod);
  vec3 a = a4.a > 0.5 ? a4.rgb / a4.a : c;
  float La = luma(a);
  // The print is a lacquer on the mercury: it keeps its own hue, dark ink lets less of the mirror
  // through, and a little of the ink's own colour shows where the mirror is dark.
  vec3 hue = a / max(max(a.r, max(a.g, a.b)), 0.03);
  vec3 lacquer = mix(vec3(1.0), hue, 0.7) * mix(0.22, 1.0, smoothstep(0.0, 0.85, La));
  vec3 silver = room * vec3(0.88, 0.91, 0.95);
  vec3 col = silver * lacquer + a * 0.16 * (1.0 - 0.4 * smoothstep(0.3, 1.0, luma(silver)));
  // The lacquer is thin: the bare mirror always shows a little through it.
  col = mix(col, silver, 0.34);
  // The waves catch the light from the upper left: the side of a ring facing it shines as a thin
  // bright line, the side away from it dims a little. The small waves show as a slow sheen.
  float lit = dot(slope * 3.0 + ripple * 0.05, vec2(-0.55, -0.83));
  col *= 1.0 - 0.25 * smoothstep(0.0, 0.25, -lit);
  col += uTLight * vec3(0.92, 0.95, 1.0) * (smoothstep(0.03, 0.22, lit) * 0.22 + smoothstep(0.12, 0.3, lit) * 0.22);
  // Grazing angles reflect more, as on any liquid.
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  col = mix(col, silver, fres * 0.6);
  // The light itself, a sharp glint wherever a wave turns it to the eye.
  vec3 ld = normalize(vec3((uLight - 0.5) * uCardK * 1.5 - p * 0.3, 1.0));
  float glint = pow(max(dot(r, ld), 0.0), 300.0) * smoothstep(0.05, 0.3, length(slope));
  col += uTLight * glint * 1.2;
  // Bright parts roll off into the light instead of clipping into flat white.
  col = mix(col, 0.85 + 0.2 * (1.0 - exp((0.85 - col) / 0.2)), step(0.85, col));
  return col;
}
`;

/** Feeds the ripple field to the card shader, re-uploading it only when it has changed. */
export class LiquidMetalLayer {
  /** Bound for every card without ripples: a level surface. */
  private none: WebGLTexture;
  private textures = new WeakMap<HeatSource, { tex: WebGLTexture; version: number }>();

  constructor(private gl: WebGL2RenderingContext) {
    this.none = createTexture(gl, false);
  }

  bind(p: Program, unit: number, src: HeatSource | undefined): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (!src) gl.bindTexture(gl.TEXTURE_2D, this.none);
    else {
      let t = this.textures.get(src);
      if (!t) {
        t = { tex: createTexture(gl, false), version: -1 };
        this.textures.set(src, t);
      }
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      if (t.version !== src.version) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, src.w, src.h, 0, gl.RED, gl.FLOAT, src.data);
        t.version = src.version;
      }
    }
    gl.uniform1i(p.u.uLmField, unit);
  }
}
