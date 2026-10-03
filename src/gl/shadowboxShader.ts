// Shadowbox: the picture is cut into paper sheets by an estimated depth and stood up inside a
// lit box behind the art window, like a layered paper print. Spliced into CARD_FS after the
// shared helpers, the tune and the range code; reads uFace, uMask, uLight and uIntensity.
import { ART, FACE_H, FACE_W } from '../card/face';

const n = (v: number) => v.toFixed(5);

export const SHADOWBOX_GLSL = /* glsl */ `
// Art window in uv (x0, y0, x1, y1), from the face layout.
const vec4 SB_ART = vec4(${n(ART.x / FACE_W)}, ${n(ART.y / FACE_H)}, ${n((ART.x + ART.w) / FACE_W)}, ${n((ART.y + ART.h) / FACE_H)});
// uv to square card units, so depth and light behave the same along both axes.
const vec2 SB_K = vec2(1.0, 1.4);
const float SB_LOD = 4.6;
const vec2 SB_TEXEL = vec2(${n(1 / FACE_W)}, ${n(1 / FACE_H)});

// The top corners on their own: the sky, or the wall behind a portrait.
vec3 sbTop = vec3(0.0);

// Colour of the picture's surroundings: its top and sides, heavily blurred. The bottom is
// left out because that is where ground and bodies usually stand.
vec3 sbBackground() {
  vec3 s[7];
  vec3 mean = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    vec2 o = i == 0 ? vec2(0.08, 0.06) : i == 1 ? vec2(0.5, 0.05) : i == 2 ? vec2(0.92, 0.06)
           : i == 3 ? vec2(0.06, 0.3) : i == 4 ? vec2(0.94, 0.3) : i == 5 ? vec2(0.06, 0.58) : vec2(0.94, 0.58);
    s[i] = textureLod(uFace, mix(SB_ART.xy, SB_ART.zw, o), 5.0).rgb;
    mean += s[i] / 7.0;
  }
  // Samples that land on the subject disagree with the rest; let the majority decide.
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 7; i++) {
    float w = 1.0 / (0.02 + dot(s[i] - mean, s[i] - mean));
    sum += s[i] * w;
    wsum += w;
  }
  sbTop = (s[0] + s[2]) * 0.5;
  return sum / wsum;
}

// Nearness of one blurred colour: what stands out from the surroundings comes forward, more
// so in the middle and low in the frame. The middle and the ground only lift what already
// stands out, so a plain sky or wall is never cut.
float sbDist(vec3 a, vec3 b, float lightK) {
  vec3 d = a - b;
  float l = luma(d);
  return length(d - l) + abs(l) * lightK;
}

float sbStand(vec3 a, vec3 bg, vec2 uv) {
  vec2 r = (uv - (SB_ART.xy + SB_ART.zw) * 0.5) / (SB_ART.zw - SB_ART.xy);
  // In a bright scene a difference in brightness alone is mostly light (a sun, haze, glare),
  // which belongs to the far sky; colour is what tells things apart there.
  float lightK = mix(1.1, 0.5, smoothstep(0.45, 0.75, luma(bg)));
  float stand = smoothstep(0.04, 0.5, min(sbDist(a, bg, lightK), sbDist(a, sbTop, lightK) * 1.15));
  // A white glare in a bright sky (the sun itself) is light, not a thing to cut out.
  float l = luma(a);
  stand *= 1.0 - smoothstep(0.8, 0.94, l) * smoothstep(0.45, 0.7, luma(bg)) * (1.0 - smoothstep(0.06, 0.18, length(a - l)));
  float centre = 1.0 - smoothstep(0.1, 0.65, length(r * vec2(1.0, 0.8)));
  float ground = smoothstep(-0.2, 0.5, r.y);
  // Sheets are trimmed back from the side and top walls, as in a real shadowbox.
  float side = min(uv.x - SB_ART.x, SB_ART.z - uv.x) * SB_K.x;
  float top = (uv.y - SB_ART.y) * SB_K.y;
  // Low in the frame they span the whole width, like the flats of a stage.
  float trim = smoothstep(0.035, 0.085, min(side + smoothstep(0.05, 0.3, r.y) * 0.1, top));
  return clamp(stand * (0.64 + 0.28 * centre + 0.22 * ground), 0.0, 1.0) * trim;
}

// Blur level for a point: near the window's dark rim the blur would pull the rim in, so it
// sharpens towards the edge.
float sbLod(vec2 uv, float lod) {
  vec2 d = min(uv - SB_ART.xy, SB_ART.zw - uv) * SB_K;
  return mix(3.0, lod, smoothstep(0.0, 0.05, min(d.x, d.y)));
}

vec3 sbTap(vec2 uv, float lod) {
  return textureLod(uFace, clamp(uv, SB_ART.xy + 0.008, SB_ART.zw - 0.008), lod).rgb;
}

// Estimated nearness, 0 = far wall, 1 = closest to the glass, with its gradient (per uv).
// Four taps on a rotated grid smooth out the coarse mip, so the cuts run in clean curves and
// the gradient comes for free.
vec3 sbHeightG(vec2 uv, vec3 bg) {
  float lod = sbLod(uv, SB_LOD);
  vec2 o = 0.5 * exp2(lod) * SB_TEXEL;
  float a = sbStand(sbTap(uv + o, lod), bg, uv);
  float b = sbStand(sbTap(uv + vec2(o.x, -o.y), lod), bg, uv);
  float c = sbStand(sbTap(uv + vec2(-o.x, o.y), lod), bg, uv);
  float d = sbStand(sbTap(uv - o, lod), bg, uv);
  return vec3((a + b + c + d) * 0.25, vec2(a + b - c - d, a - b + c - d) / (4.0 * o));
}

// A soft look for shadows: two taps across the texel grid, so the coarse mip never shows steps.
float sbHeight(vec2 uv, vec3 bg, float lod) {
  lod = sbLod(uv, lod);
  vec2 o = 0.5 * exp2(lod) * SB_TEXEL;
  return 0.5 * (sbStand(sbTap(uv + o, lod), bg, uv) + sbStand(sbTap(uv - o, lod), bg, uv));
}

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

// Depth of sheet k (0 = front) and the height it is cut at. The first cut is generous, so a
// figure comes out in one piece; the second lifts what stands out most.
float sbZ(int k, int sheets, float depth) { return depth * mix(0.1, 1.0, float(k) / float(sheets - 1)); }
float sbCut(int k, int sheets) { return sheets == 3 ? (k == 0 ? 0.66 : 0.25) : 0.4; }

vec3 shadowbox(vec3 c, vec2 puv, vec2 t, float lod) {
  // The box is built on the card itself, not on the tuned pattern grid.
  vec2 uv = tuneUnpattern(puv);
  // Screen-space size first, while every pixel of the quad is still running.
  float px = max(fwidth(uv.x), 1e-5);

  vec3 m = texture(uMask, uv).rgb;
  // What the card shader will blend this by, so the picture can be handed over unblended.
  float amt = uIntensity * mix(0.7, 1.0, m.r) * (1.0 - m.b);
  if (amt < 1e-3 || m.r < 0.5) return c;

  vec3 bg = sbBackground();
  // Fewer sheets on small cards (the hand, phones): the look holds, the cost drops.
  int sheets = px < 1.0 / 300.0 ? 3 : 2;
  float depth = 0.11 * uIntensity * pow(uTScale, 0.7);

  // Box units: centred on the window, square.
  vec2 mid = (SB_ART.xy + SB_ART.zw) * 0.5;
  vec2 q = (uv - mid) * SB_K;
  vec2 hi = (SB_ART.zw - mid) * SB_K, lo = -hi;
  // A virtual eye a little closer than the real camera, so the box reads deep even face on,
  // swinging round with the tilt.
  const float ez = 1.4;
  vec2 tc = t * min(1.0, 1.6 / max(length(t), 1e-4));
  vec2 eye = vec2(-tc.x, tc.y) * 0.46 * ez;
  vec2 v = (q - eye) / ez;
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
  vec3 stock = mix(mix(bg, vec3(luma(bg)), 0.3), vec3(0.66, 0.6, 0.53), 0.35);
  float soft = px * SB_K.x * 1.2;

  vec3 acc = vec3(0.0);
  float cover = 0.0;
  float far = 0.0;
  for (int k = 0; k < 3; k++) {
    if (k >= sheets || cover > 0.995) break;
    float z = sbZ(k, sheets, depth);
    float thr = sbCut(k, sheets);
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
      vec3 wall = stock * (0.18 + 0.6 * lit * sun) * (1.0 - 0.6 * zf) * mix(0.6, 1.0, corner);
      wall *= 0.94 + 0.06 * vnoise(vec2(dot(pw, wallN.yx) * 300.0, zw * 40.0));
      wall = mix(wall, vec3(0.98, 0.96, 0.9), lip * 0.7);
      float w = (1.0 - inside) * (1.0 - cover);
      acc += wall * w;
      far += zf * w;
      cover += w;
    }
    // Each sheet's print is enlarged to make up for its depth, as in layered paper prints,
    // so face on every sheet lines up and only a tilt pulls them apart.
    float grow = 1.0 + z / ez;
    vec2 su = p / grow / SB_K + mid;
    // The back sheet is whole; the others are cut where the picture comes forward far enough.
    // A blurrier second look closes small holes (eyes, mouths, folds), so a subject is cut
    // out whole rather than riddled.
    bool back = k == sheets - 1;
    vec3 hg = back ? vec3(0.0) : sbHeightG(su, bg);
    float wide = sbHeight(su, bg, SB_LOD + 1.7);
    float w = (back ? 1.0 : smoothstep(thr - 0.012, thr + 0.012, max(hg.x, wide * 1.12 - 0.05))) * inside * (1.0 - cover);
    if (w <= 0.0) continue;
    float zf = z / max(depth, 1e-4);
    // Focus sits on the front sheet; the back of the box goes soft, like a close-up photograph.
    vec3 img = textureLod(uFace, su, lod + 1.5 * zf * min(uIntensity, 1.0)).rgb;
    vec2 away = (p - lp) / (lz + z);
    // Cast shadows: the window's rim and the sheet in front, softer the further they fall.
    float shadow = 1.0 - sbInside(p - away * z, lo, hi, 0.004 + z * 0.15);
    float near = 0.0;
    if (k > 0) {
      float tj = sbCut(k - 1, sheets);
      float dz = z - sbZ(k - 1, sheets, depth);
      float hs = sbHeight(su - away * dz * 2.4 / SB_K, bg, SB_LOD + 0.2);
      shadow = max(shadow, smoothstep(tj - 0.12, tj + 0.03, hs));
      // Contact shade: every sheet sits a little in the shadow of whatever stands in front of it.
      near = smoothstep(tj - 0.25, tj, sbHeight(su, bg, SB_LOD + 0.9));
      // Small openings inside a subject (eyes, a mouth) stay light: face on they vanish, and
      // only a tilt shows they go deeper.
      float hole = smoothstep(tj - 0.06, tj + 0.08, wide);
      shadow *= 1.0 - 0.8 * hole;
      near *= 1.0 - 0.8 * hole;
    }
    // The cut edge shows the white core of the paper, bright where it faces the light. Clean
    // silhouettes get a crisp edge; cuts across soft gradients stay quiet.
    float edge = 0.0, facing = 0.0;
    if (!back) {
      // Slope in card widths, and the height change per screen pixel, so the edge is the
      // same pixel or two wide everywhere.
      vec2 g = hg.yz * vec2(1.0, 1.0 / SB_K.y);
      float slope = length(g);
      // Distance to the cut in pixels; holes the second look closed have no edge of their own.
      float dpx = (hg.x - thr) / max(slope * px, 1e-4);
      vec2 out2 = -normalize(g + 1e-6);
      // The paper's thickness shows on edges that face the eye, wider the more the card tilts.
      float thick = 1.6 + 3.2 * max(dot(out2, eyeDir), 0.0) * min(length(tc), 1.0);
      edge = (1.0 - smoothstep(thick * 0.4, thick, dpx)) * smoothstep(-1.2, -0.2, dpx) * smoothstep(6.0, 14.0, slope);
      facing = dot(out2, normalize(-away));
    }
    // The box gathers shade towards its walls, deeper sheets more so.
    vec2 dw = min(p - lo, hi - p);
    float vignette = smoothstep(0.0, 0.12, min(dw.x, dw.y) + 0.03 * (1.0 - zf));
    vec3 sheet = img * mix(vec3(1.0), vec3(0.56, 0.58, 0.68), shadow) * (1.0 - 0.08 * near) * (1.0 - 0.06 * zf) * mix(0.62, 1.0, vignette);
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
  vec3 haze = vec3(0.1, 0.16, 0.32) * far * 0.12;
  // The glass in front: one broad, faint reflection that slides against the tilt.
  float g = dot(q, vec2(0.62, -0.78)) + tc.x * 0.22 - tc.y * 0.16;
  float glass = smoothstep(-0.05, 0.12, g) * (1.0 - smoothstep(0.12, 0.42, g));
  return c + sbUntune(acc - c) / amt + haze + uTLight * glass * 0.07;
}
`;
