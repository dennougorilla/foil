// Stained Glass: the picture set in leaded glass and lit from behind. Spliced into CARD_FS after
// COMMON and TUNE_GLSL, so hash/vnoise/face and the tune uniforms are in scope.
//
// Lead came cuts the art into irregular panes (cells around jittered seeds, with the exact
// distance to their borders so every line has the same width), runs along the picture's own
// big outlines, and cuts the frame into a border of strips mitred at the corners. Each art pane
// is one sheet of glass coloured from the picture under its seed (split where an outline
// crosses it); the picture's small darks stay on it as painted detail, as glass painters do.
// Light comes through from behind: a glow that slides against the tilt, bent a little
// differently by each pane, and broken up by the glass's rippled, uneven thickness, which is
// seen through a different part of each sheet as the card tilts.
// Nothing here reads the clock, so it holds still under reduced motion and loops in exports.
import { ART, FACE_H, FACE_W } from '../card/face';

const f = (v: number) => v.toFixed(2);

export const STAINED_GLASS_GLSL = /* glsl */ `
// Panes across the card's width; the grid runs in square units (y is stretched by 1.4).
const vec2 SG_GRID = vec2(8.5, 8.5 * 1.4);
const float SG_LEAD = 0.12; // half the lead's width, in pane units
const vec2 SG_FACE = vec2(${f(FACE_W)}, ${f(FACE_H)});
const vec4 SG_ART = vec4(${f(ART.x)}, ${f(ART.y)}, ${f(ART.x + ART.w)}, ${f(ART.y + ART.h)});

vec2 sgSeed(vec2 cell) { return 0.15 + 0.7 * hash22(cell * 1.37 + 11.0); }

// Distance to the pane's border (in pane units); \`seed\` and \`cell\` come back for the pane.
float sgPanes(vec2 p, out vec2 seed, out vec2 cell) {
  vec2 ip = floor(p), fp = fract(p);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(i, j);
    vec2 r = g + sgSeed(ip + g) - fp;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(i, j);
    vec2 r = g + sgSeed(ip + g) - fp;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  cell = ip + mg;
  seed = cell + sgSeed(cell);
  return md;
}

// The border: one strip per stretch of each side, mitred from the window's corners to the
// card's. fp is in face pixels; returns the distance to the nearest lead, also in face pixels.
float sgBorder(vec2 fp, out vec2 cell) {
  // How far out of the window, as a share of each side's width.
  vec4 out4 = vec4(SG_ART.x - fp.x, fp.x - SG_ART.z, SG_ART.y - fp.y, fp.y - SG_ART.w);
  vec4 band = vec4(SG_ART.x, SG_FACE.x - SG_ART.z, SG_ART.y, SG_FACE.y - SG_ART.w);
  vec4 n = out4 / band;
  // The side this point belongs to, and the runner-up: the mitre lies where the two are equal.
  int side = 0;
  for (int i = 1; i < 4; i++) if (n[i] > n[side]) side = i;
  int other = side < 2 ? (n.z > n.w ? 2 : 3) : (n.x > n.y ? 0 : 1);
  float mitre = (n[side] - n[other]) / length(vec2(1.0 / band[side], 1.0 / band[other]));
  // Dividers across the sides (five strips) and the top (three); the nameplate stays whole.
  float along = side < 2 ? (fp.y - SG_ART.y) / (SG_ART.w - SG_ART.y) * 5.0
              : side == 2 ? (fp.x - SG_ART.x) / (SG_ART.z - SG_ART.x) * 3.0 : 0.5;
  float span = side < 2 ? (SG_ART.w - SG_ART.y) / 5.0 : (SG_ART.z - SG_ART.x) / 3.0;
  float k = floor(clamp(along, 0.0, side < 2 ? 4.999 : 2.999));
  float divider = side == 3 ? 1e3 : abs(fract(along + 0.5) - 0.5) * span;
  if (along < 0.5 || along > (side < 2 ? 4.5 : 2.5)) divider = 1e3; // no divider at the mitre
  // The lead that runs around the window itself.
  float win = max(max(out4.x, out4.y), max(out4.z, out4.w));
  cell = vec2(float(side) * 7.0 + 40.0, k);
  return min(min(mitre, divider), win);
}

// How sharply the picture's colour changes at uv, measured \`span\` face pixels either side at mip \`lod\`.
float sgChange(vec2 uv, float span, float lod) {
  vec2 dx = vec2(span / SG_FACE.x, 0.0), dy = vec2(0.0, span / SG_FACE.y);
  vec3 gx = face(uv + dx, lod).rgb - face(uv - dx, lod).rgb;
  vec3 gy = face(uv + dy, lod).rgb - face(uv - dy, lod).rgb;
  return length(vec2(length(gx), length(gy)));
}

/** \`art\` is 1 in the art window; the frame becomes a border of pale glass in its own colour. */
vec3 stainedGlass(vec3 c, vec2 uv, vec2 t, float L, float art) {
  vec2 ruv = tuneFaceUv(uv);
  vec2 p = uv * SG_GRID;
  vec2 seed, cell;
  float edge;
  vec3 glass;
  // Lead along the picture's own outlines, 0..1 (the art only).
  float outline = 0.0;
  if (art > 0.5) {
    edge = sgPanes(p, seed, cell);
    vec4 own = face(uv, 4.5);
    vec3 near = own.rgb / max(own.a, 1e-4);
    // The sheet's colour: the picture around the seed (a seed across the window's edge would
    // pick up the frame, so such a pane takes the colour around itself instead).
    vec2 seedUv = seed / SG_GRID;
    vec4 s = face(seedUv, 4.5);
    float seedArt = textureLod(uMask, tuneFaceUv(seedUv), 0.0).r;
    vec3 sheet = mix(s.rgb / max(s.a, 1e-4), near, 1.0 - seedArt);
    // Glass is cut along the drawing: where the colour changes sharply, lead runs along the
    // change, and the part of a pane across it is its own sheet in the colour on that side.
    // Only shapes that still stand out when blurred to about a pane's corner get lead; small
    // marks (stars, dither, texture) stay on the glass as paint.
    outline = smoothstep(0.28, 0.36, sgChange(uv, 5.5, 2.4)) * smoothstep(0.36, 0.5, sgChange(uv, 18.0, 4.4));
    vec4 mid = face(uv, 3.0);
    vec3 local = mid.rgb / max(mid.a, 1e-4);
    float split = smoothstep(0.18, 0.32, length(local - sheet));
    sheet = mix(sheet, local, split);
    cell += step(0.5, split) * vec2(0.37, 0.71);
    // Glass is deeper than paint: richer hue, never muddy grey.
    vec3 hsv = rgb2hsv(sheet);
    hsv.y = clamp(hsv.y * 1.45 + 0.1, 0.0, 1.0);
    hsv.z = mix(hsv.z, 1.0, 0.32);
    glass = hsv2rgb(hsv);
    // A little of the picture shows through the sheet, so a face still reads as a face.
    vec3 hc = rgb2hsv(c);
    hc.y = clamp(hc.y * 1.3, 0.0, 1.0);
    glass = mix(glass, hsv2rgb(hc), 0.3);
    // Grisaille: where the picture is darker than its surroundings, the glass carries painted line.
    glass *= 1.0 - 0.82 * smoothstep(0.03, 0.22, luma(near) - L);
  } else {
    edge = sgBorder(ruv * SG_FACE, cell) / (SG_FACE.x / SG_GRID.x);
    // Pale glass in the frame's own colour, a little deeper than the paper; the name and pips
    // stay on it as painted lettering.
    vec3 hsv = rgb2hsv(c);
    hsv.y = clamp(hsv.y * 1.6 + 0.06, 0.0, 1.0);
    glass = hsv2rgb(hsv);
  }
  float h = hash12(cell + 3.3);
  vec2 wedge = hash22(cell + 9.1) * 2.0 - 1.0;

  // Rippled, uneven sheets. Each pane sits at its own depth with its own streak direction, and
  // tilting looks through a different part of it, so the ripples shift pane by pane.
  float depth = 0.5 + h;
  float ang = h * 6.2831;
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 q = rot * (p + t * 0.7 * depth + h * 17.0) * vec2(1.3, 2.6);
  float h0 = 0.6 * vnoise(q) + 0.4 * vnoise(q * 2.3 + 5.0);
  float hx = 0.6 * vnoise(q + vec2(0.08, 0.0)) + 0.4 * vnoise((q + vec2(0.08, 0.0)) * 2.3 + 5.0);
  float hy = 0.6 * vnoise(q + vec2(0.0, 0.08)) + 0.4 * vnoise((q + vec2(0.0, 0.08)) * 2.3 + 5.0);
  vec2 ripple = vec2(hx - h0, hy - h0) / 0.08;
  // The frame's pale glass is calmer, and calmest behind the name, so the lettering reads.
  float plate = smoothstep(SG_ART.w, SG_ART.w + 20.0, ruv.y * SG_FACE.y);
  float rough = art > 0.5 ? 1.0 : 0.55 - 0.3 * plate;
  ripple *= rough;
  float thick = mix(0.5, smoothstep(0.2, 0.8, h0), rough);
  // Thicker glass passes less light and deepens the colour; no two sheets came out of the
  // pot quite alike, so each is a little denser or lighter than its neighbours.
  glass = mix(glass, glass * glass, 0.6 * thick);
  glass *= 0.86 + 0.28 * h;

  // The light behind the window: a broad glow that slides against the tilt. Each pane is a
  // shallow wedge and each ripple a small lens, so they bend that glow by their own amounts.
  vec2 behind = vec2(0.5) + (uLight - 0.5) * 0.5 - t * 0.45;
  vec2 seen = uv + wedge * 0.08 + ripple * 0.045;
  vec2 d = (seen - behind) * vec2(1.0, 1.4);
  float glow = exp(-dot(d, d) * 3.0);
  float light = 0.48 + glow * (0.55 + 0.9 * (1.0 - thick)) + 0.3 * (1.0 - thick);
  // Pale glass scatters more of the light, so the border glows rather than greys.
  light = mix(0.72 + 0.45 * glow + 0.15 * (1.0 - thick), light, art);
  vec3 col = glass * light * uTLight;
  // Where the light is strongest it floods the sheet and starts to wash towards white.
  col += glass * glow * glow * 0.6 + uTLight * pow(glow, 6.0) * 0.12 * (1.0 - thick);
  // The room's light skims the rippled face of the glass, glinting as the card tilts.
  vec3 nrm = normalize(vec3(-ripple * 0.35 - wedge * 0.12, 1.0));
  vec3 hv = normalize(vec3((uLight - 0.5) * 1.6 + t * 0.9, 1.0) + vec3(0.0, 0.0, 1.0));
  col += uTLight * pow(max(dot(nrm, hv), 0.0), 60.0) * 0.32;
  // Seeds: tiny bubbles caught in the glass, glinting when the light is behind them.
  vec2 bp = p * 9.0;
  vec2 bc = floor(bp);
  float bub = step(0.965, hash12(bc + cell * 7.0));
  float bd = length(fract(bp) - 0.5 - (hash22(bc) - 0.5) * 0.5);
  col += uTLight * bub * smoothstep(0.16, 0.04, bd) * (0.12 + 0.8 * glow);

  // Lead: opaque came with a rounded top that catches the room light along its ridge. The
  // glass beside it sits in a little shade of putty.
  float aa = fwidth(edge) * 0.75 + 1e-4;
  float lead = max(1.0 - smoothstep(SG_LEAD - aa, SG_LEAD + aa, edge), outline);
  float ridge = sqrt(max(1.0 - edge / SG_LEAD, 0.0)) * (1.0 - outline);
  float sheen = 0.5 + 0.5 * sin(dot(ruv, vec2(7.0, 5.0)) + dot(t, vec2(4.0, -3.0)));
  vec3 came = vec3(0.035, 0.038, 0.042) + vec3(0.13, 0.135, 0.145) * pow(ridge, 4.0) * (0.25 + 0.75 * sheen);
  col *= mix(0.6, 1.0, smoothstep(SG_LEAD, SG_LEAD + 0.08, edge)) * (1.0 - 0.4 * smoothstep(0.1, 0.32, outline));
  col = mix(col, came, lead);
  // Bright light rolls off instead of clipping to flat white.
  col = mix(col, 0.8 + 0.25 * (1.0 - exp((0.8 - col) / 0.25)), step(0.8, col));
  return col;
}
`;
