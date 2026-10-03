// Relief finish: the picture struck in metal.
//
// The relief is built in the card shader from the face itself (no extra textures): the face's
// mip levels give its tones at three scales, which become the height of the metal. Where the
// tone jumps sharply (an outline, a hard light/dark border) it rises in flat terraces with crisp
// steps, so it reads as a struck die rather than an emboss filter; broader forms (a cheek, a
// petal) are modelled as smooth, never terraced, swells; dark line work sinks into fine grooves.
// It is one material: light parts are bare metal, darker parts keep the picture's colour as
// enamel in the hollows, and the ground beside raised work is antiqued dark. Every face shades by
// its angle to the light (satin), the flat field also mirrors a small studio (softbox, fill, strip
// light) that slides across as the card tilts, struck edges glint, and the steps cast short
// shadows. The frame gets a stamped dot texture and the name a foil press in the same metal.

import type { Uniforms } from './gl/gl';

export type ReliefMetal = 'gold' | 'silver';
export const RELIEF_METALS: ReliefMetal[] = ['gold', 'silver'];

// One metal at a time, read by every renderer (stage and exports alike), like the lettering.
let active: ReliefMetal = 'gold';
export const setReliefMetal = (m: ReliefMetal) => (active = m);

/** Phones and low-core machines skip the cast shadows and the finest grooves. */
const LITE = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;

/** `live`: false for exports, which always draw at full quality. */
export function bindRelief(gl: WebGL2RenderingContext, u: Uniforms, live: boolean): void {
  gl.uniform2f(u.uRelief, active === 'silver' ? 1 : 0, live && LITE ? 1 : 0);
}

/** Card-shader chunk. Expects COMMON, the card uniforms, the tune chunk and the lettering map above it. */
export const RELIEF_GLSL = /* glsl */ `
uniform vec2 uRelief;  // x: 1 = silver (else gold); y: 1 = lighter shading

// Height in card widths of each layer: line grooves, terrace steps, smooth modelling of forms.
const float R_LINE = 0.0045;
const float R_STEP = 0.009;
const float R_SWELL = 0.011;
const float R_STEPS = 4.0;  // terraces over the full tonal range

float reliefLum(vec2 p, float k) {
  vec4 f = textureLod(uFace, p, k);
  return luma(f.rgb / max(f.a, 1e-4));
}

// Tone at mip level k with its slope per uv. Central differences one texel of that level apart
// keep the slope continuous across texel borders, so the metal shows no square facets.
vec3 reliefTone(vec2 p, float k, vec2 texel) {
  vec2 d = texel * exp2(k);
  float l = reliefLum(p - vec2(d.x, 0.0), k), r = reliefLum(p + vec2(d.x, 0.0), k);
  float u = reliefLum(p - vec2(0.0, d.y), k), b = reliefLum(p + vec2(0.0, d.y), k);
  return vec3((l + r + u + b) * 0.25, (r - l) / (2.0 * d.x), (b - u) / (2.0 * d.y));
}

// Staircase over tone s: flat treads, each riser a smoothstep w steps wide. x: height, y: dT/ds.
vec2 reliefSteps(float s, float w) {
  float q = s * R_STEPS, k = floor(q);
  float x = clamp((q - k - 0.5 + w * 0.5) / w, 0.0, 1.0);
  return vec2((k + x * x * (3.0 - 2.0 * x)) / R_STEPS, 6.0 * x * (1.0 - x) / w);
}

// Height only, for the shadow test (one tap per layer).
float reliefHeightAt(vec2 p, vec3 k) {
  float form = reliefLum(p, k.y);
  float line = reliefLum(p, k.x) - form;
  line = sign(line) * max(abs(line) - 0.05, 0.0);
  return R_STEP * form + R_SWELL * reliefLum(p, k.z) + R_LINE * min(line, line * 0.35);
}

// Highlights roll off instead of clipping, so a bright sweep never burns into a flat patch.
vec3 reliefShoulder(vec3 x) {
  return mix(x, 0.82 + 0.18 * (1.0 - exp(-(x - 0.82) / 0.18)), step(0.82, x));
}

vec3 relief(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  bool silver = uRelief.x > 0.5;
  bool lite = uRelief.y > 0.5;
  // The relief follows the picture, not the pattern: work in face coordinates.
  vec2 p = tuneFaceUv(uv);
  vec2 texel = 1.0 / vec2(textureSize(uFace, 0));
  vec2 fw = max(fwidth(vUv), texel * 0.25);
  // Face texels per screen pixel, as a mip level; pixelated art uses its block size.
  float px = max(log2(max(fw.x / texel.x, fw.y / texel.y)), lod);
  // Pattern size makes the relief broader or finer; the layers never go finer than the screen.
  float zoom = log2(uTScale);
  vec3 k = max(vec3(max(px, 0.6), max(px, 0.8), max(px + 1.8, 3.0)) + zoom, 0.0);

  // ---- Height and slope (per uv) ----
  vec3 form = reliefTone(p, k.y, texel);
  vec3 swell = reliefTone(p, k.z, texel);
  // Risers stay at least ~2 px wide on screen so they never shimmer.
  float perPx = abs(form.y) * fw.x + abs(form.z) * fw.y;
  vec2 st = reliefSteps(form.x, clamp(R_STEPS * perPx * 2.0, 0.3, 1.0));
  // Steps only where the tone jumps sharply; elsewhere the field only leans gently, so soft
  // shading (a cheek, a sky) and grain never ripple the mirror.
  float edge = smoothstep(18.0, 42.0, length(form.yz * vec2(1.0, 1.0 / 1.4)));
  vec3 H = R_STEP * vec3(st.x, st.y * edge * form.yz) + R_SWELL * swell;
  float groove = 0.0;
  if (!lite) {
    vec3 line = reliefTone(p, k.x, texel);
    vec3 d = line - form;
    // Only real line work counts: faint grain (paper, noise) leaves the flats flat.
    float a = abs(d.x);
    d *= max(a - 0.05, 0.0) / max(a, 1e-4);
    // Dark line work sinks into grooves; light detail stands only a little proud.
    float s = d.x < 0.0 ? 1.0 : 0.35;
    // Fades out as the card gets too small to show it.
    s *= 1.0 - smoothstep(1.2, 2.2, px);
    H += R_LINE * s * d;
    groove = clamp(-d.x * 4.0, 0.0, 1.0) * s;
  }
  vec2 slope = vec2(H.y, H.z / 1.4);  // per card width on both axes
  vec3 N = normalize(vec3(-slope, 1.0));

  // ---- Frame: a fine stamped dot texture (follows the pattern size and angle) ----
  float frame = (1.0 - m.r) * (1.0 - m.b);
  // The nameplate is a smooth band so the name reads; the dots stamp the rest of the frame.
  float band = uPlate > 0.5 ? smoothstep(0.878, 0.886, p.y) : 0.0;
  {
    vec2 q = uv * vec2(1.0, 1.4) * 70.0;
    q.x += 0.5 * mod(floor(q.y), 2.0);  // offset rows: a staggered grid
    vec2 f = fract(q) - 0.5;
    float r = length(f);
    // Each dot is a low dome; it fades to flat once the dots get close to a pixel apart.
    float see = 1.0 - smoothstep(0.25, 0.5, fw.x * 70.0);
    float dome = 1.0 - smoothstep(0.22, 0.36, r);
    vec2 dn = f / 0.36 * dome * 2.2 * see;
    N = normalize(mix(N, normalize(vec3(dn, 1.0)), frame * (1.0 - band)));
  }

  // ---- Light ----
  vec2 at = p * vec2(1.0, 1.4);
  // A point light at the hotspot, nudged up and left so the relief always reads (as the lettering).
  vec2 lp = (uLight - p) * vec2(1.0, 1.4);
  vec3 Ld = normalize(vec3(lp * 1.3 + vec2(-0.24, -0.32), 0.42));
  // The eye sits a few card widths out, so reflections slide across the card as it tilts.
  vec3 V = normalize(vec3(vec2(0.5, 0.7) - at - t * 1.25, 2.6));
  vec3 Hv = normalize(Ld + V);
  float lam = clamp(dot(N, Ld) * 1.15, 0.0, 1.0);
  vec3 R = reflect(-V, N);

  // Cast shadow: is the relief higher a little towards the light than the light's slope allows?
  float shade = 1.0;
  if (!lite) {
    vec2 dir = normalize(Ld.xy + 1e-5);
    float tanE = Ld.z / max(length(Ld.xy), 1e-3);
    float h0 = reliefHeightAt(p, k);
    float occ = 0.0;
    for (int i = 1; i <= 2; i++) {
      float dist = 0.006 * float(i);
      float hi = reliefHeightAt(p + dir * vec2(1.0, 1.0 / 1.4) * dist, k);
      occ = max(occ, (hi - h0 - dist * tanE) / 0.0025);
    }
    shade = 1.0 - 0.55 * clamp(occ, 0.0, 1.0);
  }

  // ---- Studio ----
  // The reflections land in a plane: a room lit from above, a softbox up and left, a weaker fill opposite
  // and a strip light. All sit within reach of the tilt, so they sweep across the card instead
  // of flooding it. The strip's falloff tolerates a few degrees of wobble, so it never shatters.
  vec2 r2 = R.xy / max(R.z, 0.2);
  float room = 0.1 + 0.65 * smoothstep(0.45, -0.45, r2.y);
  float box = 1.0 - smoothstep(0.03, 0.22, length((r2 - vec2(-0.16, -0.2)) * vec2(1.0, 0.8)));
  float fill = 1.0 - smoothstep(0.12, 0.3, length(r2 - vec2(0.34, 0.3)));
  float strip = 1.0 - smoothstep(0.02, 0.11, abs(dot(r2, vec2(0.8, -0.6)) + 0.26));
  float mirror = room + 1.15 * box + 0.32 * fill + 0.6 * strip;
  // Satin: every surface also answers the light by its own angle, so planes and swells brighten
  // and darken as the light moves (the relief reads from its faces, not only its outlines). The
  // modelled slopes are fully satin, like the frosted relief of a proof coin; the flat field keeps
  // part of the mirror, so the studio still sweeps across it.
  float frost = smoothstep(0.04, 0.2, length(slope));
  float satin = 0.2 + 0.65 * pow(clamp(dot(N, Ld) * 0.5 + 0.5, 0.0, 1.0), 2.5)
              + 0.35 * pow(max(dot(N, Hv), 0.0), 12.0) * frost * uTGlare;
  float env = mix(satin, mirror, 0.45 * (1.0 - frost));
  // The light glints only off steep struck edges, never as a spot on the flats; the Glare controls
  // set how strong and how tight.
  float sharp = mix(60.0, 220.0, clamp(uTSharp / 2.0, 0.0, 1.0));
  float spec = pow(max(dot(R, Ld), 0.0), sharp * 0.25) * smoothstep(0.3, 0.7, length(slope)) * 0.7 * uTGlare;

  // ---- One material: struck metal, with the picture's colour kept as enamel in the hollows ----
  vec3 tone = silver ? vec3(0.9, 0.93, 0.97) : vec3(1.0, 0.74, 0.32);
  vec3 deep = silver ? vec3(0.03, 0.035, 0.05) : vec3(0.1, 0.05, 0.015);
  // Light parts are bare metal; darker parts hold more of the ink, like enamel in a recess.
  float bare = smoothstep(0.04, 0.8, L);
  vec3 chroma = c / max(max(c.r, max(c.g, c.b)), 0.05);
  vec3 metal = tone * mix(vec3(1.0), chroma, silver ? 0.04 : 0.08) * (env + spec) * mix(0.12, 1.0, bare);
  vec3 enamel = mix(vec3(L), c, silver ? 0.25 : 0.4) * mix(tone, vec3(1.0), 0.5) * (0.22 + 0.5 * lam) * (1.0 - 0.75 * bare);
  // Enamel is glassy: it keeps a faint, untinted copy of the studio on top.
  vec3 gloss = vec3(env * 0.07 + spec * 0.2) * (1.0 - bare);
  vec3 col = ((metal + enamel) * shade + gloss) * uTLight;
  // Antiqued: grooves and the ground beside raised work are blackened, as on an old medal.
  float patina = smoothstep(0.03, 0.2, swell.x - form.x);
  col = mix(col, deep, clamp(groove * 0.5 + patina * 0.45, 0.0, 0.8));
  // The nameplate band is a darker satin plate, so the bright foil name stands off it.
  col *= 1.0 - 0.3 * band * frame;
  col = reliefShoulder(col);

  // ---- Name: pressed foil in the same metal ----
  if (uPlate > 0.5 && p.y > 0.86) {
    vec2 tx = 1.0 / vec2(textureSize(uTextMap, 0));
    vec2 e = max(tx, fw);
    float cover = textureLod(uTextMap, p, 0.0).r;
    // The press leaves a dark dent round every letter, so the foil reads on pale and dark frames alike.
    vec2 rs = max(tx * 2.5, fw * 1.4);
    float ring = max(max(textureLod(uTextMap, p + vec2(rs.x, 0.0), 0.0).r, textureLod(uTextMap, p - vec2(rs.x, 0.0), 0.0).r),
                     max(textureLod(uTextMap, p + vec2(0.0, rs.y), 0.0).r, textureLod(uTextMap, p - vec2(0.0, rs.y), 0.0).r));
    col *= 1.0 - 0.75 * ring * (1.0 - cover);
    // Bevelled strokes from the lettering's softened height, lit like the rest of the metal.
    vec2 g = vec2(textureLod(uTextMap, p + vec2(e.x, 0.0), 0.0).g - textureLod(uTextMap, p - vec2(e.x, 0.0), 0.0).g,
                  textureLod(uTextMap, p + vec2(0.0, e.y), 0.0).g - textureLod(uTextMap, p - vec2(0.0, e.y), 0.0).g);
    vec3 Nn = normalize(vec3(-g * 1.5, 1.0));
    float ln = clamp(dot(Nn, Ld), 0.0, 1.0);
    float sheen = pow(0.5 + 0.5 * sin(dot(p, vec2(9.0, 13.0)) + dot(t, vec2(3.2, 2.4))), 3.0);
    vec3 leaf = mix(tone * 0.9, mix(tone, vec3(1.0), 0.6), clamp(0.3 + 0.7 * sheen + 0.6 * (ln - Ld.z), 0.0, 1.0));
    leaf += tone * pow(max(dot(Nn, Hv), 0.0), sharp) * 0.6 * uTGlare;
    col = mix(col, reliefShoulder(leaf), cover);
  }

  // The card shader then mixes every finish in at 70% on the frame and adds a soft glare spot.
  // The metal covers the frame fully and already mirrors that light, so undo both here.
  float frameMix = mix(0.7, 1.0, m.r);
  float glare = tuneGlare(length((p - uLight) * vec2(1.0, 1.4)), 1.35, 3.0, 0.32);
  return c + (col - c - glare * uTLight) / frameMix;
}
`;
