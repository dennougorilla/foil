// Engraving: the picture cut into a copper plate as a line engraving, like the portrait on an old
// banknote or stamp. Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/face/luma
// and the tune helpers are in scope. Every name here starts with `en`/`EN_`.
//
// What makes the real thing read as one (and what this copies):
// - One set of long, calm, evenly spaced lines carries the whole picture. Tone is their WIDTH: a
//   hairline in the lights that swells, on an S-curve, to most of a spacing in the shadows, so a
//   mid-tone is a visibly fatter line, not a denser one. In the brightest places the hairline
//   breaks into short flicks that end in pointed slivers, so even a highlight is engraved metal.
// - The tone is read from the picture blurred over a few lines, with its local contrast raised:
//   a pixel picture's hard edge becomes a swell along a few lines instead of a contour, and a flat
//   band keeps a rim.
// - The lines follow only the large form: they are level lines of a gentle slant bent a little by
//   the picture's broad shapes, read through a smooth (cubic) filter, so they never kink and the
//   spacing never pinches by more than a sixth.
// - A second set crosses the first at 40 degrees, only in the deepest shadows.
// - Lines stay resolvable: on a small card (a GIF, a low-density screen) every other line is
//   dropped and the rest are drawn twice as wide, so the plate keeps its strokes instead of
//   greying into a tone.
// - The frame is a calm guilloche: two interlaced waves between two rules round the art, and a
//   plain polished cartouche where the name sits.
// - The plate is bright polished copper; the grooves hold near-black ink. As the card tilts, a
//   narrow specular flash crosses the plate and the walls of the cuts it passes light up on the
//   same side together, so the light runs along the strokes as a coherent sheen.
// Nothing reads the clock: it moves only with the tilt and the light, so it holds still when
// motion is reduced and every export loop closes by itself.

export const ENGRAVING_GLSL = /* glsl */ `
// Lines per short side of the card on a big card (half that on a small one).
const float EN_LINES = 140.0;
// How far (card units) the picture's broad shapes bend the lines, per unit of brightness.
const float EN_BEND = 0.05;
// The thinnest a line gets (of a spacing), and the widest.
const float EN_HAIR = 0.07;
const float EN_FULL = 0.7;
// Polished copper's own colour (its reflectance), the ink left in the grooves, the brightest the
// plate ever gets (pale gold) and the slope of a groove's walls (a burin cuts a V about this steep).
const vec3 EN_COPPER = vec3(0.96, 0.62, 0.42);
const vec3 EN_INK = vec3(0.03, 0.016, 0.012);
const vec3 EN_PALE = vec3(1.0, 0.86, 0.68);
const float EN_WALL = 0.5;

// The mip level that blurs the face over s card units (never sharper than the pixel picture's).
float enLod(float s, float lod) { return max(log2(s * uFaceTexels / uCardK.x), lod); }

// The face's brightness at face uv through a cubic B-spline on one mip level: smooth in value and
// slope, so level lines drawn through it bend without the kinks a bilinear lookup leaves at every texel.
float enCubic(vec2 fuv, int li) {
  vec2 sz = vec2(textureSize(uFace, li));
  vec2 p = fuv * sz - 0.5;
  vec2 i = floor(p), f = p - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / sz, h1 = (i + 1.5 + w3 / g1) / sz;
  float l = float(li);
  vec4 s = g0.y * (g0.x * textureLod(uFace, h0, l) + g1.x * textureLod(uFace, vec2(h1.x, h0.y), l))
    + g1.y * (g0.x * textureLod(uFace, vec2(h0.x, h1.y), l) + g1.x * textureLod(uFace, h1, l));
  return luma(s.rgb / max(s.a, 1e-3));
}
// The same at a fractional level (between the two nearest), clamped to the levels the face has.
float enSmooth(vec2 fuv, float l) {
  vec2 sz0 = vec2(textureSize(uFace, 0));
  float top = floor(log2(max(sz0.x, sz0.y)));
  l = clamp(l, 0.0, top);
  float l0 = floor(l);
  float a = enCubic(fuv, int(l0));
  return l0 >= top ? a : mix(a, enCubic(fuv, int(l0) + 1), l - l0);
}

// One set of grooves at phase f (one per unit) and width w (0..1 of a spacing). Returns how much
// of the pixel is cut (0..1); side comes back signed across the groove (which wall) and lip is
// how much of the groove's wall this pixel shows: lines finer than the pixels show only their
// tone and no wall.
float enCut(float f, float w, out float side, out float lip) {
  float aa = max(fwidth(f), 1e-4);
  float x = fract(f) - 0.5;
  float hw = 0.5 * w;
  side = x;
  float cut = clamp((hw - abs(x)) / aa + 0.5, 0.0, 1.0) * min(w / aa, 1.0);
  float fine = 1.0 - smoothstep(0.3, 0.55, aa);
  lip = smoothstep(0.25, 0.7, abs(x) / max(hw, 1e-3)) * smoothstep(1.5, 3.5, w / aa) * fine;
  return mix(w, cut, fine);
}

// A hairline (in card units) at signed distance d from its centre, d's slope taken on screen.
float enRule(float d, float w) {
  float px = max(length(vec2(dFdx(d), dFdy(d))), 1e-5);
  return clamp((0.5 * w - abs(d)) / px + 0.5, 0.0, 1.0) * min(w / px, 1.0);
}

// A stroke's width at darkness k (0..1): a hairline that breaks into tapered flicks in the
// brightest places (s runs 0..1 along a flick), swelling on an S-curve to EN_FULL.
float enWidth(float k, float s) {
  float flick = pow(clamp(sin(3.14159 * min(s * 1.12, 1.0)), 0.0, 1.0), 0.6);
  float hair = EN_HAIR * mix(flick, 1.0, smoothstep(0.02, 0.12, k));
  float sw = smoothstep(0.0, 1.0, k);
  return mix(hair, EN_FULL, sw);
}

// One set of strokes at phase F (card units across the lines) and along (card units along them),
// n lines per unit; coarse (0..1) fades to every other line, drawn twice as wide.
float enSet(float F, float along, float n, float k, float coarse, out float side, out float lip) {
  float f1 = F * n, f2 = F * n * 0.5 + 0.25;
  float s1 = fract(along * n / 11.0 + hash12(vec2(floor(f1), 3.1)));
  float s2 = fract(along * n / 22.0 + hash12(vec2(floor(f2), 7.3)));
  float sd1, lp1, sd2, lp2;
  float c1 = enCut(f1, enWidth(k, s1), sd1, lp1);
  float c2 = enCut(f2, enWidth(k, s2), sd2, lp2);
  side = coarse < 0.5 ? sd1 : sd2;
  lip = mix(lp1, lp2, coarse);
  return mix(c1, c2, coarse);
}

// How much light the wall of a groove running across \`across\` catches at \`side\`: it tilts that
// way at the burin's slope, so with the light coming from l (on the plate) one wall of every cut
// faces it and the other turns away, all the grooves alike: the cuts read as cut, never as scratches.
float enWall(vec2 across, float side, vec2 l) {
  vec3 n = normalize(vec3(-across * sign(side) * EN_WALL, 1.0));
  return max(dot(n.xy, l), 0.0) / EN_WALL;
}

/** uv is pattern uv (the lines follow the tune's size and angle); m is the face mask. */
vec3 engraving(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  vec2 q = (uv - 0.5) * uCardK;
  float art = m.r;
  vec2 fuv = tuneFaceUv(uv);

  // How big the lines come out on screen: below about 4 px a spacing, drop to half as many.
  float pxq = max(length(fwidth(q)) * 0.7071, 1e-6);
  float coarse = smoothstep(4.4, 3.4, 1.0 / (EN_LINES * pxq));
  float sp = mix(1.0, 2.0, coarse) / EN_LINES;

  // The broad shapes that bend the lines: the picture blurred over about fifteen lines through the
  // cubic filter, looked up a little inside the art window and faded out towards its edge, so the
  // frame never pulls on the lines and they run straight into the edge.
  vec2 inB = vec2(0.02) / uCardK;
  vec2 ub = clamp(fuv, min(uArt.xy + inB, 0.5), max(uArt.zw - inB, 0.5));
  float big = enSmooth(ub, enLod(0.1, 0.0));
  vec2 ea = min(fuv - uArt.xy, uArt.zw - fuv) * uCardK;
  float win = smoothstep(0.0, 0.12, min(ea.x, ea.y));
  float bend = (big - 0.5) * EN_BEND * win;

  // The tone the width follows: the picture blurred over two or three lines (a hard pixel edge
  // becomes a swell, not a contour), its local contrast raised against the broad shapes so a flat
  // band keeps its rim, and lifted a little when the whole picture is dark.
  float soft = enSmooth(fuv, enLod(1.1 * sp, lod));
  float wide = enSmooth(fuv, enLod(0.05, 0.0));
  float mean = enSmooth(vec2(0.5), 30.0);
  float lift = 0.6 * (0.48 - mean);
  float tone = mix(soft + 0.9 * (soft - wide), L, 0.08) + lift;
  float dark = clamp((0.95 - tone) / 0.95, 0.0, 1.0);
  // A thin dark band inside a bright shape (ripples across a sun) stays a few fat lines, never a
  // solid bar: the darkness is capped by how dark the surroundings are.
  dark = min(dark, 0.5 + (1.0 - wide - lift));

  // The art's lines: a gentle slant bent round the picture's shapes.
  vec2 dirA = normalize(vec2(0.32, 1.0));
  vec2 perpA = vec2(-dirA.y, dirA.x);
  float FA = dot(q, dirA) + bend;
  float sideA, lipA;
  float cutA = enSet(FA, dot(q, perpA), EN_LINES, dark, coarse, sideA, lipA);
  // Across the line on the plate (for the lit wall), from the phase's own slope.
  mat2 J = mat2(dFdx(q), dFdy(q));
  vec2 gA = vec2(dFdx(FA), dFdy(FA));
  vec2 acrossA = normalize(inverse(transpose(J)) * gA + dirA * 1e-3);
  // The cross set, at 40 degrees to the first, thinner, only in the deepest shadows.
  vec2 dirB = vec2(-0.375, 0.927);
  float sideB, lipB;
  float kB = smoothstep(0.8, 1.0, dark);
  float cutB = enSet(dot(q, dirB) + bend, dot(q, vec2(-dirB.y, dirB.x)), EN_LINES, kB * 0.4, coarse, sideB, lipB) * smoothstep(0.0, 0.25, kB);
  float cutArt = max(cutA, cutB);

  // The frame, in face units of the card: rules and two interlaced waves round the art window.
  vec2 P = (fuv - 0.5) * uCardK;
  vec2 a0 = (uArt.xy - 0.5) * uCardK, a1 = (uArt.zw - 0.5) * uCardK;
  vec2 ac = 0.5 * (a0 + a1), ah = 0.5 * (a1 - a0);
  vec2 x = P - ac;
  vec2 dv = abs(x) - ah;
  float dIn = length(max(dv, 0.0)) + min(max(dv.x, dv.y), 0.0);
  // How far round the art window (continuous across the corners), for the waves' phase.
  vec2 b = clamp(x, -ah, ah);
  float per = 4.0 * (ah.x + ah.y);
  float around = dv.x > dv.y
    ? (x.x > 0.0 ? 2.0 * ah.x + ah.y + b.y : 4.0 * ah.x + 3.0 * ah.y - b.y)
    : (x.y < 0.0 ? b.x + ah.x : 3.0 * ah.x + 2.0 * ah.y - b.x);
  float fw = max(min(a0.x + 0.5 * uCardK.x, 0.08), 0.02);
  float waves = floor(per / (fw * 1.1) + 0.5);
  float ph = around / per * waves * 6.28318;
  float hl = 0.0026;
  float ring = max(enRule(dIn - fw * 0.12, hl), enRule(dIn - fw * 0.78, hl));
  float swing = fw * 0.22;
  ring = max(ring, enRule(dIn - fw * 0.45 - swing * sin(ph), hl * 0.9));
  ring = max(ring, enRule(dIn - fw * 0.45 + swing * sin(ph), hl * 0.9));
  // Inside the rules, a faint ruling along the frame; the name sits in a plain cartouche.
  float ruled = step(fw * 0.12, dIn) * step(dIn, fw * 0.78);
  float fineSide, fineLip;
  float fine = enCut(dIn / (fw * 0.072), 0.14, fineSide, fineLip) * ruled * 0.55;
  vec2 kh = 0.5 * uCardK;
  float lo = a1.y + fw * 0.88, hi = kh.y - fw * 0.45;
  float upLo = -kh.y + fw * 0.45, upHi = a0.y - fw * 0.88;
  float box = 1e3;
  if (hi - lo > fw * 0.6) box = min(box, length(max(abs(P - vec2(ac.x, 0.5 * (lo + hi))) - vec2(ah.x, 0.5 * (hi - lo)) + 0.012, 0.0)) - 0.012);
  if (upHi - upLo > fw * 0.6) box = min(box, length(max(abs(P - vec2(ac.x, 0.5 * (upLo + upHi))) - vec2(ah.x, 0.5 * (upHi - upLo)) + 0.012, 0.0)) - 0.012);
  float cartouche = max(enRule(box, hl), enRule(box + 0.006, hl * 0.8));
  float frameCut = max(max(ring, fine * step(0.0, box)), cartouche);
  // Dark lettering on the frame is cut solid, so the name stays crisp.
  float frameDark = 1.0 - smoothstep(0.08, 0.95, L);
  float solid = smoothstep(0.7, 0.85, frameDark);

  // The light, on the plate: where it is (dl, from here to it) and where the eye sees it mirrored.
  vec2 dl = (uLight - fuv) * uCardK;
  vec2 mir = dl + t * 0.12;

  // Bright polished copper: a slow falloff across the plate that slides with the tilt, and a narrow
  // pale-gold flash where it mirrors the light, never white.
  float r = dot(q, vec2(0.8, 0.6)) + t.x * 0.5 - t.y * 0.3;
  float body = 0.74 + 0.32 * smoothstep(-0.45, 0.35, r) * smoothstep(1.4, 0.7, r) - 0.04 * q.y;
  float flashP = exp(-dot(mir, mir) / 0.03);
  vec3 plate = min(mix(EN_COPPER * body, EN_PALE, 0.7 * flashP), EN_PALE);
  // A faint wash of the picture's own colour, like a hand-tinted print.
  vec3 wash = face(uv, enLod(2.0 * sp, lod)).rgb;
  vec3 hue = wash / max(max(wash.r, max(wash.g, wash.b)), 0.05);
  plate *= mix(vec3(1.0), hue, 0.14 * art);

  // The grooves: near-black ink, a hint of the picture's colour in the art.
  vec3 ink = mix(EN_INK, wash * 0.1, 0.15 * art);
  float cut = mix(max(frameCut, solid), cutArt, art);
  vec3 col = mix(plate, ink, cut);

  // The wall of each stroke that faces the light catches it, brightest round the flash.
  vec2 lw = normalize(mir + vec2(1e-4, 0.0)) * smoothstep(0.02, 0.25, length(mir));
  float lit = enWall(acrossA, sideA, lw);
  float lipArt = art * lipA * cutA * (1.0 - cutB);
  vec3 wall = min(EN_COPPER * (0.75 + 0.45 * exp(-dot(mir, mir) / 0.08)) + EN_PALE * 0.25 * flashP, EN_PALE);
  col = mix(col, wall, 0.85 * lipArt * smoothstep(0.2, 0.9, lit));
  return col;
}
`;
