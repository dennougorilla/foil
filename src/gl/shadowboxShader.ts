// Shadowbox: the picture stands in a lit box behind the art window as paper sheets, cut by depth
// (src/depth). Spliced into CARD_FS after the shared helpers, the tune and the range code; reads
// uFace, uMask, uLight and uIntensity besides its own sheets.
import { ART, FACE_H, FACE_W } from '../card/face';

const n = (v: number) => v.toFixed(5);

export const SHADOWBOX_GLSL = /* glsl */ `
uniform sampler2D uLayers; // over the art window: r, g, b = the cut sheets from the front, a = depth (1 = near)
uniform float uLayerCuts;  // cut sheets in front of the back one, 0..3
uniform float uLayerRise;  // 0..1: how far the sheets stand forward from the back wall
uniform sampler2D uPlateBack; // the art with the cut-out subjects painted out

// Art window in uv (x0, y0, x1, y1), from the face layout.
const vec4 SB_ART = vec4(${n(ART.x / FACE_W)}, ${n(ART.y / FACE_H)}, ${n((ART.x + ART.w) / FACE_W)}, ${n((ART.y + ART.h) / FACE_H)});
// uv to square card units, so depth and light behave the same along both axes.
const vec2 SB_K = vec2(1.0, 1.4);
// A virtual eye a little closer than the real camera, so the box reads deep even face on.
const float SB_EYE = 1.4;

vec4 sbLayers(vec2 su, float lod) { return textureLod(uLayers, (su - SB_ART.xy) / (SB_ART.zw - SB_ART.xy), lod); }
float sbPick(vec4 l, int k) { return k == 0 ? l.r : k == 1 ? l.g : l.b; }

// Undo the tune's hue and saturation on the picture itself, so they only colour the finish's light.
vec3 sbUntune(vec3 d) {
  float s = max(uTSat, 0.02);
  d = (d - (1.0 - s) * luma(d)) / s;
  if (uTHue != 0.0) {
    const vec3 k = vec3(0.57735);
    float a = -uTHue * 6.2831853, ca = cos(a);
    d = d * ca + cross(k, d) * sin(a) + k * dot(k, d) * (1.0 - ca);
  }
  return d;
}

// Soft 1 inside the art window (square units), 0 outside.
float sbInside(vec2 p, vec2 lo, vec2 hi, float soft) {
  vec2 d = min(p - lo, hi - p);
  return smoothstep(-soft, soft, min(d.x, d.y));
}

// Depth of sheet k (0 = front): spread through the box when standing, all on the back wall when lying.
float sbZ(int k, int sheets, float depth) {
  float stand = sheets > 1 ? depth * mix(0.08, 1.0, float(k) / float(sheets - 1)) : depth;
  return mix(depth, stand, uLayerRise);
}

// Where a point of sheet k (at box position p) finds its print: each print is enlarged for its
// depth, as in layered paper prints, so face on every sheet lines up.
vec2 sbPrint(vec2 p, float z, vec2 mid) { return p / (1.0 + z / SB_EYE) / SB_K + mid; }

vec3 shadowbox(vec3 c, vec2 puv, vec2 t, float lod) {
  // The box is built on the card itself, not on the tuned pattern grid.
  vec2 uv = tuneUnpattern(puv);
  // Screen-space size first, while every pixel of the quad is still running.
  float px = max(fwidth(uv.x), 1e-5);

  vec3 m = texture(uMask, uv).rgb;
  // What the card shader will blend this by, so the picture can be handed over unblended.
  float amt = uIntensity * mix(0.7, 1.0, m.r) * (1.0 - m.b);
  if (amt < 1e-3 || m.r < 0.5) return c;

  int sheets = int(uLayerCuts + 0.5) + 1;
  float depth = 0.11 * uIntensity * pow(uTScale, 0.7);

  // Box units: centred on the window, square.
  vec2 mid = (SB_ART.xy + SB_ART.zw) * 0.5;
  vec2 q = (uv - mid) * SB_K;
  vec2 hi = (SB_ART.zw - mid) * SB_K, lo = -hi;
  // The eye swings round with the tilt.
  vec2 tc = t * min(1.0, 1.6 / max(length(t), 1e-4));
  vec2 eye = vec2(-tc.x, tc.y) * 0.46 * SB_EYE;
  vec2 v = (q - eye) / SB_EYE;
  vec2 eyeDir = eye / max(length(eye), 1e-4);
  // Depth at which the ray leaves through a side wall.
  vec2 zs = vec2(v.x > 0.0 ? (hi.x - q.x) / v.x : v.x < 0.0 ? (lo.x - q.x) / v.x : 1e3,
                 v.y > 0.0 ? (hi.y - q.y) / v.y : v.y < 0.0 ? (lo.y - q.y) / v.y : 1e3);
  float zWall = min(zs.x, zs.y);
  vec2 wallN = zs.x < zs.y ? vec2(-sign(v.x), 0.0) : vec2(0.0, -sign(v.y));
  // The light hangs above the glass where the tune puts it; shadows fall away from it.
  vec2 lp = (uLight - mid) * SB_K;
  const float lz = 0.7;
  // The box is lined in a warm stock tinted by the picture's surroundings, so its walls read
  // as the scene going on and never vanish on a dark picture.
  vec3 bg = (textureLod(uFace, mix(SB_ART.xy, SB_ART.zw, vec2(0.1, 0.08)), 6.0).rgb
           + textureLod(uFace, mix(SB_ART.xy, SB_ART.zw, vec2(0.9, 0.08)), 6.0).rgb
           + textureLod(uFace, mix(SB_ART.xy, SB_ART.zw, vec2(0.08, 0.5)), 6.0).rgb
           + textureLod(uFace, mix(SB_ART.xy, SB_ART.zw, vec2(0.92, 0.5)), 6.0).rgb) * 0.25;
  vec3 stock = mix(mix(bg, vec3(luma(bg)), 0.3), vec3(0.66, 0.6, 0.53), 0.35);
  float soft = px * SB_K.x * 1.2;
  vec2 texel = (SB_ART.zw - SB_ART.xy) / vec2(textureSize(uLayers, 0));

  vec3 acc = vec3(0.0);
  float cover = 0.0;
  float far = 0.0;
  for (int k = 0; k < 4; k++) {
    if (k >= sheets || cover > 0.995) break;
    float z = sbZ(k, sheets, depth);
    vec2 p = q + v * z;
    // Past the window's edge the ray has met a side wall first.
    float inside = sbInside(p, lo, hi, soft);
    if (inside < 1.0) {
      float zw = clamp(zWall, 0.0, depth);
      vec2 pw = q + v * zw;
      float zf = zw / max(depth, 1e-4);
      float lit = max(dot(vec3(wallN, 0.0), normalize(vec3(lp - pw, lz + zw))), 0.0);
      // The rim of the window shades the wall below it.
      float sun = sbInside(pw + (lp - pw) * (zw / (lz + zw)) + wallN * 0.002, lo, hi, 0.003 + zw * 0.08);
      // Deep corners gather shade; the lip where the wall meets the window catches the light.
      vec2 dw = min(pw - lo, hi - pw);
      float corner = smoothstep(0.0, 0.05, max(dw.x, dw.y));
      float lip = (1.0 - smoothstep(0.0, 0.004 + px * 2.0, zw)) * (0.35 + 0.65 * lit);
      vec3 wall = stock * (0.22 + 0.7 * lit * sun) * (1.0 - 0.55 * zf) * mix(0.6, 1.0, corner);
      wall *= 0.94 + 0.06 * vnoise(vec2(dot(pw, wallN.yx) * 300.0, zw * 40.0));
      wall = mix(wall, vec3(0.98, 0.96, 0.9), lip * 0.7);
      float w = (1.0 - inside) * (1.0 - cover);
      acc += wall * w;
      far += zf * w;
      cover += w;
    }
    vec2 su = sbPrint(p, z, mid);
    bool back = k == sheets - 1;
    if (back) {
      // The back sheet is not quite flat: where the picture's own depth comes nearer (ground
      // running towards you, a slope), it bulges gently towards the glass. Two parallax steps.
      // With nothing cut out, the relief is all the depth there is, so it may go deeper.
      float span = depth * (k > 0 ? 0.42 : 0.6) * uLayerRise;
      if (k > 0) span = min(span, (z - sbZ(k - 1, sheets, depth)) * 0.8);
      for (int it = 0; it < 2; it++) {
        float zr = z - textureLod(uPlateBack, (su - SB_ART.xy) / (SB_ART.zw - SB_ART.xy), 1.0).a * span;
        p = clamp(q + v * zr, lo, hi);
        su = sbPrint(p, zr, mid);
      }
    }
    vec4 here = sbLayers(su, 0.0);
    float mk = back ? 1.0 : sbPick(here, k);
    // A middle sheet is cut away under the sheet in front of it: front pieces float on hidden
    // spacers, so their outlines never echo on the sheet behind.
    float under = k > 0 ? smoothstep(0.4, 0.6, sbPick(here, k - 1)) : 0.0;
    float w = (back ? 1.0 : smoothstep(0.4, 0.6, mk) * (1.0 - under)) * inside * (1.0 - cover);
    if (w <= 0.0) continue;
    float zf = z / max(depth, 1e-4);
    // Focus sits on the front sheet; the back of the box goes soft, like a close-up photograph.
    float blur = 1.5 * zf * min(uIntensity, 1.0) * uLayerRise;
    vec3 img = textureLod(uFace, su, lod + blur).rgb;
    // On the back sheet the print is painted out behind the cut pieces, so a tilt uncovers
    // background, not a second copy of the subject.
    if (back && k > 0) {
      vec3 plate = textureLod(uPlateBack, (su - SB_ART.xy) / (SB_ART.zw - SB_ART.xy), blur).rgb;
      img = mix(img, plate, smoothstep(0.3, 0.7, sbPick(here, k - 1)));
    }
    vec2 away = (p - lp) / (lz + z);
    // Cast shadows: the window's rim, and each sheet in front, sharp near and softer the further
    // they fall, all away from the one light.
    float shadow = 1.0 - sbInside(p - away * z, lo, hi, 0.004 + z * 0.15);
    for (int j = 0; j < 3; j++) {
      if (j >= k) break;
      float zj = sbZ(j, sheets, depth);
      float dz = z - zj;
      vec2 ps = sbPrint(p - away * dz * 2.2, zj, mid);
      float hs = sbPick(sbLayers(ps, 0.6 + dz * 35.0), j);
      shadow = max(shadow, smoothstep(0.2, 0.7, hs) * (1.0 - 0.25 * float(k - 1 - j)));
    }
    // The cut edge shows the paper's thickness on the side facing the eye, wider as the card
    // tilts, lit where it faces the light.
    float edge = 0.0, facing = 0.0;
    if (!back) {
      float mx = sbPick(sbLayers(su + vec2(texel.x, 0.0), 0.0), k);
      float my = sbPick(sbLayers(su + vec2(0.0, texel.y), 0.0), k);
      vec2 g = vec2((mx - mk) / texel.x, (my - mk) / texel.y / SB_K.y);
      float slope = max(length(g) * px, 1e-4);
      float dpx = (mk - 0.5) / slope;
      vec2 out2 = -normalize(g + 1e-6);
      float thick = 1.6 + 3.2 * max(dot(out2, eyeDir), 0.0) * min(length(tc), 1.0);
      edge = (1.0 - smoothstep(thick * 0.4, thick, dpx)) * smoothstep(-1.2, -0.2, dpx) * uLayerRise;
      facing = dot(out2, normalize(-away));
    }
    // The box gathers shade towards its walls, deeper sheets more so.
    vec2 dw = min(p - lo, hi - p);
    float vignette = smoothstep(0.0, 0.12, min(dw.x, dw.y) + 0.03 * (1.0 - zf));
    vec3 sheet = img * mix(vec3(1.0), vec3(0.52, 0.52, 0.56), shadow * uLayerRise) * (1.0 - 0.08 * zf) * mix(0.62, 1.0, vignette);
    // The light falls into the box as a soft pool, over a faint paper grain.
    sheet *= mix(0.84, 1.1, exp(-dot(p - lp, p - lp) * 2.2)) * (0.95 + 0.07 * vnoise(su * vec2(420.0, 590.0) + float(k) * 17.0) + 0.03 * vnoise(su * vec2(60.0, 1100.0) + float(k) * 5.0));
    // Paper edge: a lighter strip of the print where it faces the light, a darker one where it
    // turns away, so dark areas never get a stray white stroke.
    vec3 core = facing > 0.0 ? mix(img, vec3(0.97, 0.94, 0.88), 0.25 + 0.35 * luma(img)) * (0.85 + 0.4 * facing) : img * (0.7 + 0.3 * facing);
    sheet = mix(sheet, core, edge * (k == 0 ? 0.85 : 0.6));
    acc += sheet * w;
    far += zf * w;
    cover += w;
  }
  // Depth haze: the far sheets sink into a cool dusk. Tunable with hue and saturation.
  vec3 haze = vec3(0.1, 0.16, 0.32) * far * 0.12 * uLayerRise;
  // The glass in front: one broad, faint reflection that slides against the tilt.
  float g = dot(q, vec2(0.62, -0.78)) + tc.x * 0.22 - tc.y * 0.16;
  float glass = smoothstep(-0.05, 0.12, g) * (1.0 - smoothstep(0.12, 0.42, g));
  return c + sbUntune(acc - c) / amt + haze + uTLight * glass * 0.07;
}
`;
