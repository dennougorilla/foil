// Breakout: the subject, cut out by depth (src/depth), bursts out through the frame. The card
// itself is drawn as usual with the subject painted out of the window, its shadow and a cracked
// frame; then a larger quad, hinged at the window's foot and lifted off the card (uPop), draws
// the subject enlarged upwards from that foot, so its top crosses the frame and the card's own
// edge, with glints and shards where it breaks through. Spliced into CARD_FS after the Shadowbox code, whose sheets (only the
// front one is used here), plate, window and untune it shares.
import { ART, FACE_H } from '../card/face';

const n = (v: number) => v.toFixed(5);

/**
 * For CARD_VS: the lifted quad is hinged at the window's foot like a pop-up page, so it rises
 * off the card towards the top and the subject's foot stays on the picture. 1 at the window's top.
 */
export const BREAKOUT_HINGE = /* glsl */ `
float boHinge(float v) { return (${n((ART.y + ART.h) / FACE_H)} - v) / ${n(ART.h / FACE_H)}; }
`;

export const BREAKOUT_GLSL = /* glsl */ `
uniform float uPop;   // 1 = the pass that draws the subject out in front of the card
uniform vec2 uPopOut; // x: how much the subject is enlarged, y: how far its top floats (card heights)

// The foot of the art window: the subject grows from it, so it rises out of the top.
const vec2 BO_FOOT = vec2(0.5, SB_ART.w);

// Where the floating subject at card point q finds its print. It grows more upwards than
// sideways, and not at all at the foot, so where it meets the picture it lines up with it.
vec2 boSource(vec2 q) {
  float up = smoothstep(0.0, 0.3, (BO_FOOT.y - q.y) / (SB_ART.w - SB_ART.y));
  return BO_FOOT + (q - BO_FOOT) / (1.0 + uPopOut.x * up * vec2(0.55, 1.0));
}

// The front sheet's cut at print point su.
float boRaw(vec2 su, float lod) {
  vec2 a = (su - SB_ART.xy) / (SB_ART.zw - SB_ART.xy);
  if (a.x < 0.0 || a.y < 0.0 || a.x > 1.0 || a.y > 1.0) return 0.0;
  return textureLod(uLayers, a, lod).r;
}
// It fades out towards the window's sides and foot, so where the picture cuts the subject off it
// grows out of the picture instead of ending in a straight edge.
float boFade(vec2 su) {
  vec2 a = (su - SB_ART.xy) / (SB_ART.zw - SB_ART.xy);
  return smoothstep(0.0, 0.07, a.x) * smoothstep(0.0, 0.07, 1.0 - a.x) * smoothstep(0.0, 0.025, 1.0 - a.y);
}
float boCut(vec2 su, float lod) { return boRaw(su, lod) * boFade(su); }

// Signed distance to the art window's edge in square card units, positive inside.
float boWindow(vec2 q) {
  vec2 d = min(q - SB_ART.xy, SB_ART.zw - q) * SB_K;
  return min(d.x, d.y);
}

vec3 breakout(vec3 c, vec2 puv, vec2 t, float lod) {
  vec2 uv = tuneUnpattern(puv);
  vec3 m = texture(uMask, uv).rgb;
  // What the card shader will blend this by, so the result can be handed over unblended.
  float amt = uIntensity * mix(0.7, 1.0, m.r) * (1.0 - m.b);
  if (amt < 1e-3) return c;
  float out1 = clamp(uPopOut.x / 0.06, 0.0, 1.0);
  vec2 tc = t * min(1.0, 1.6 / max(length(t), 1e-4));
  vec3 col = c;

  // The window: the subject has left it, so its place shows the picture painted out behind it.
  float gone = smoothstep(0.02, 0.3, boCut(uv, 1.5)) * out1 * step(0.5, m.r);
  vec2 au = (uv - SB_ART.xy) / (SB_ART.zw - SB_ART.xy);
  col = mix(col, textureLod(uPlateBack, au, lod).rgb, gone);
  // ...and the scene behind it dims under a slow burst of rainbow rays.
  vec2 d = (uv - vec2(0.5, mix(SB_ART.y, SB_ART.w, 0.4))) * SB_K;
  float ang = atan(d.y, d.x);
  float rays = pow(0.5 + 0.5 * sin(ang * 14.0 + uTime * 0.5 + (tc.x - tc.y) * 1.5), 5.0);
  vec3 tint = hsv2rgb(vec3(fract(ang / 6.2831853 + tc.x * 0.25 + tc.y * 0.15 + uTime * 0.04), 0.65, 1.0));
  float inWin = m.r * out1;
  col = mix(col, col * 0.8 + tint * rays * 0.22 * smoothstep(0.05, 0.5, length(d)), inWin);

  // The frame: a holographic sheen, shattered and glowing where the subject smashes through.
  float frame = 1.0 - m.r;
  float band = pow(0.5 + 0.5 * sin((uv.x - uv.y * 0.8) * 9.0 + (tc.x + tc.y) * 6.0), 3.0);
  vec3 film = hsv2rgb(vec3(fract((uv.x * 0.7 + uv.y) * 1.3 + tc.x * 0.8 - tc.y * 0.6), 0.7, 1.0));
  col = mix(col, screen(col, film * (0.12 + 0.5 * band)), frame);
  float near = smoothstep(0.01, 0.15, boCut(boSource(uv), 5.0)) * frame * out1;
  vec4 v = voronoi(uv * vec2(15.0, 21.0));
  float crack = 1.0 - smoothstep(0.02, 0.08, v.y - v.x);
  float h = hash12(v.zw);
  // Each loose piece of frame catches the light at its own angle.
  float catchL = pow(0.5 + 0.5 * sin(h * 30.0 + (tc.x - tc.y) * 5.0), 6.0);
  col = mix(col, col * (0.7 + 0.5 * h) + vec3(1.0, 0.95, 0.85) * catchL * 0.5, near);
  col += vec3(1.0, 0.82, 0.45) * crack * near * (1.1 + 0.4 * sin(uTime * 4.0 + h * 6.28));

  // The floating subject's shadow falls away from the light, further and softer the higher it
  // floats (nothing at its foot, where it is hinged).
  float rise = uPopOut.y * clamp((BO_FOOT.y - uv.y) / (SB_ART.w - SB_ART.y), 0.0, 1.0);
  vec2 off = (uv - uLight) * rise * 0.4 + vec2(0.1, 0.14) * rise;
  float sh = boCut(boSource(uv - off), 2.5 + rise * 12.0);
  // ...but not on the subject's own foot, which stays in the picture.
  sh *= mix(1.0, boFade(uv), boRaw(uv, 1.0) * m.r);
  col *= 1.0 - 0.55 * smoothstep(0.05, 0.6, sh);

  return c + sbUntune(col - c) / amt;
}

// One flying piece in a grid of cells over the card: rainbow shards and white glints that only
// show where the subject crosses the window's edge.
vec4 boDebris(vec2 q, vec2 tc, float sc, float seed) {
  vec2 g = q * vec2(sc, sc * 1.4);
  vec2 id = floor(g);
  float h = hash12(id + seed);
  if (h < 0.3) return vec4(0.0);
  vec2 o = (id + 0.5) / vec2(sc, sc * 1.4);
  float cov = boCut(boSource(o), 4.5);
  float zone = clamp(cov * (1.0 - cov) * 6.0, 0.0, 1.0) * smoothstep(0.08, -0.01, boWindow(o))
    * smoothstep(BO_FOOT.y - 0.04, BO_FOOT.y - 0.1, o.y); // never at the foot, which stays put
  if (zone < 0.02) return vec4(0.0);
  vec2 rnd = hash22(id + seed * 1.7);
  // Each piece flies out and fades, over and over, at its own pace.
  float life = fract(uTime * (0.3 + 0.35 * h) + h * 13.0);
  vec2 dir = normalize(rnd - 0.5 + vec2(0.0, -0.35));
  vec2 f = fract(g) - 0.5 - (rnd - 0.5) * 0.2 - dir * life * 0.3;
  float fade = zone * smoothstep(0.0, 0.08, life) * (1.0 - life);
  float a = h * 40.0 + uTime * (2.0 + 3.0 * h);
  if (h > 0.84) {
    // A four-point glint.
    float s = 0.5 * (0.6 + 0.4 * sin(uTime * 7.0 + h * 50.0));
    float star = max(smoothstep(0.035, 0.0, abs(f.x)) * smoothstep(s, 0.0, abs(f.y)),
                     smoothstep(0.035, 0.0, abs(f.y)) * smoothstep(s, 0.0, abs(f.x)));
    star += smoothstep(0.12, 0.0, length(f)) * 0.6;
    return vec4(vec3(1.0, 0.97, 0.88) * star * fade * 1.4, 0.0);
  }
  // A spinning triangular shard that flashes as its face turns to the light.
  f = mat2(cos(a), -sin(a), sin(a), cos(a)) * f / (0.28 * (1.0 - 0.4 * life));
  const float k = 1.7320508;
  f.x = abs(f.x) - 1.0;
  f.y = f.y + 1.0 / k;
  if (f.x + k * f.y > 0.0) f = vec2(f.x - k * f.y, -k * f.x - f.y) / 2.0;
  f.x -= clamp(f.x, -2.0, 0.0);
  float tri = smoothstep(0.08, -0.08, -length(f) * sign(f.y));
  float flash = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(a * 1.3 + tc.x * 3.0), 3.0);
  vec3 tint = hsv2rgb(vec3(fract(h * 5.0 + tc.x * 0.3 + tc.y * 0.2), 0.55, 1.0));
  float al = tri * fade;
  return vec4(tint * flash * al, al);
}

// The pass in front of the card: the subject, outlined in light, and the debris of the frame.
vec4 breakoutPop(vec2 q, vec2 t) {
  if (q.y > 1.02) discard;
  vec2 su = boSource(q);
  float fade = boFade(su);
  float body = smoothstep(0.35, 0.65, boRaw(su, 0.0));
  float a = body * fade;
  // Round the silhouette runs a die-cut border, as on a sticker peeled off the card.
  float border = smoothstep(0.1, 0.18, boRaw(su, 2.2)) * clamp(uPopOut.x / 0.06, 0.0, 1.0);
  if (uShadow > 0.5) return vec4(0.0, 0.0, 0.0, max(body, border) * fade * 0.4);
  vec2 tc = t * min(1.0, 1.6 / max(length(t), 1e-4));
  vec3 img = textureLod(uFace, su, 0.0).rgb;
  // A bright edge on the side facing the light, and a sweep of shine.
  vec2 texel = 2.5 / vec2(textureSize(uLayers, 0)) * (SB_ART.zw - SB_ART.xy);
  vec2 toL = normalize((uLight - q) * SB_K + 1e-5) / SB_K;
  float lit = a * (1.0 - smoothstep(0.35, 0.65, boRaw(su + toL * texel, 0.0)));
  vec3 bow = hsv2rgb(vec3(fract(q.y * 1.6 - q.x * 0.6 + tc.x * 0.5 + uTime * 0.25), 0.7, 1.0));
  float sweep = smoothstep(0.82, 1.0, 0.5 + 0.5 * sin((q.x + q.y) * 7.0 - (tc.x + tc.y) * 4.0));
  vec3 col = img + vec3(1.0, 0.98, 0.9) * lit * 0.6 + sweep * 0.16;
  // The border is holographic foil: pale, with a rainbow that runs as the card tilts.
  float ring = border * (1.0 - body) * fade;
  vec3 foilB = mix(vec3(0.97), bow, 0.7) * (0.9 + 0.4 * sweep);
  vec4 res = vec4(col * a + foilB * ring, a + ring);
  // A coloured glow spills out beyond the border.
  float halo = boRaw(su, 4.2) * (1.0 - max(body, border)) * fade;
  res.rgb += bow * halo * 0.7 * clamp(uPopOut.x / 0.06, 0.0, 1.0);
  for (int i = 0; i < 2; i++) {
    vec4 d = boDebris(q, tc, i == 0 ? 12.0 : 21.0, float(i) * 31.0);
    res = vec4(d.rgb + res.rgb * (1.0 - d.a), d.a + res.a * (1.0 - d.a));
  }
  return res;
}
`;
