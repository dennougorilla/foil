// Engraving: the picture cut into a polished copper plate as a line engraving, like the portrait on
// an old banknote or stamp. Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/face/luma
// and the tune helpers are in scope. Every name here starts with `en`/`EN_`.
//
// What makes the real thing read as one (and what this copies):
// - The burin follows the form. Each set of lines is the level lines of one smooth field: a base
//   slant plus the picture's mid-scale shapes (the picture blurred over a few tens of lines, minus
//   its broad average), so the lines bow over a round sun or an eye and run along a mountain's
//   slope. Level lines of a smooth field never break, so a line never turns into dashes.
// - The sky and the ground are cut at different base angles (near level above, a steep slant
//   below), the boundary following the dark of the land; each set tapers out into the other.
// - Tone is the line's WIDTH, swelling and tapering smoothly along it: nothing in the lights, a
//   hairline, then up to just over half a spacing in the shadows (never a solid bar). A thinner
//   cross-hatch at another angle comes in only where the picture is darker than 0.6, for depth.
// - The plate is a polished mirror: dark brown copper where it mirrors the room, and a tight
//   pale-gold band where it mirrors a strip light. The band sweeps across as the card tilts. Each
//   groove's wall is tilted, so it mirrors the strip somewhere else: the walls light up as thin
//   bright lines only where the cut runs the right way and faces the light.
// - Lines stay resolvable: on a small card (a GIF, a low-density screen) every other line is
//   dropped and the rest are drawn twice as wide, so the plate keeps its strokes.
// - The frame is a guilloche: two families of interlaced waves between two rules round the art,
//   a rosette at each corner, and a finely engraved woven ground in the name panel.
// Nothing reads the clock: it moves only with the tilt, so it holds still when motion is reduced
// and every export loop closes by itself.

export const ENGRAVING_GLSL = /* glsl */ `
// Lines per short side of the card on a big card (half that on a small one).
const float EN_LINES = 115.0;
// The thinnest a line gets (of a spacing) before it tapers out in the light, the widest, and the
// widest a cross-hatch line gets.
const float EN_HAIR = 0.07;
const float EN_FULL = 0.55;
const float EN_CROSS = 0.26;
// How much the picture's mid-scale shapes and its broad light bend the lines (card units per unit).
const float EN_FORM = 0.075;
const float EN_BROAD = 0.025;
const float EN_DETAIL = 0.02;
// The plate mirroring the dark room, the copper glow round the strip light, its pale-gold core,
// and the ink left in the grooves.
const vec3 EN_DEEP = vec3(0.40, 0.21, 0.11);
const vec3 EN_COPPER = vec3(0.86, 0.52, 0.30);
const vec3 EN_PEAK = vec3(1.0, 0.95, 0.83);
const vec3 EN_INK = vec3(0.028, 0.016, 0.012);
// A groove's wall slope (a burin cuts a V about this steep) and how far a tilted wall moves the
// strip light's reflection (card units per unit of slope).
const float EN_WALL = 0.5;
const float EN_REACH = 0.8;

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

// One set of grooves at phase f (one per unit) and width w (0..1 of a spacing). Returns how much of
// the pixel is cut (0..1). rim is the thin strip of wall just inside the groove's edge (0 when the
// lines are finer than the pixels, which then show only their tone) and side which wall it is (+1/-1).
float enCut(float f, float w, out float rim, out float side) {
  float aa = max(fwidth(f), 1e-4);
  float x = fract(f) - 0.5;
  float hw = 0.5 * w;
  float inside = (hw - abs(x)) / aa;
  float cut = clamp(inside + 0.5, 0.0, 1.0) * min(w / aa, 1.0);
  float fine = 1.0 - smoothstep(0.3, 0.55, aa);
  side = x >= 0.0 ? 1.0 : -1.0;
  rim = clamp(1.0 - abs(inside - 0.55) / 0.85, 0.0, 1.0) * smoothstep(0.5, 1.5, w / aa) * fine;
  return mix(w, cut, fine);
}

// A hairline (in card units) at signed distance d from its centre, d's slope taken on screen.
float enRule(float d, float w) {
  float px = max(length(vec2(dFdx(d), dFdy(d))), 1e-5);
  return clamp((0.5 * w - abs(d)) / px + 0.5, 0.0, 1.0) * min(w / px, 1.0);
}

// A stroke's width at darkness k (0..1): nothing in the brightest light, a hairline, then a smooth
// S-curve swell to EN_FULL. k comes from a blurred picture, so the width tapers along a line.
float enWidth(float k) {
  return mix(EN_HAIR * smoothstep(0.0, 0.06, k), EN_FULL, smoothstep(0.08, 1.0, k));
}

// One set of strokes at phase F (card units across the lines), n lines per unit and width w;
// coarse (0..1) fades to every other line, drawn twice as wide.
float enSet(float F, float n, float w, float coarse, out float rim, out float side) {
  float r1, s1, r2, s2;
  float c1 = enCut(F * n, w, r1, s1);
  float c2 = enCut(F * n * 0.5 + 0.25, w, r2, s2);
  side = coarse < 0.5 ? s1 : s2;
  rim = mix(r1, r2, coarse);
  return mix(c1, c2, coarse);
}

// Across a set's lines, on the plate (unit), from its phase's own slope on screen.
vec2 enAcross(float F, mat2 Ji, vec2 dir) {
  return normalize(Ji * vec2(dFdx(F), dFdy(F)) + dir * 1e-3);
}

// Where the plate mirrors the strip light: s = 0 on the band's centre line. The band lies across
// EN_A; a tilt slides it over the card. nxy tilts the surface (a groove's wall), which moves it.
const vec2 EN_A = vec2(0.62, 0.785);
float enBand(vec2 P, vec2 t, vec2 nxy) {
  return dot(P, EN_A) + EN_REACH * dot(nxy, EN_A) + 0.2 - 0.6 * dot(t, vec2(0.8, 0.6));
}

/** uv is pattern uv (the lines follow the tune's size and angle); m is the face mask. */
vec3 engraving(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  vec2 q = (uv - 0.5) * uCardK;
  float art = m.r;
  vec2 fuv = tuneFaceUv(uv);
  vec2 P = (fuv - 0.5) * uCardK;
  vec2 a0 = (uArt.xy - 0.5) * uCardK, a1 = (uArt.zw - 0.5) * uCardK;
  vec2 ac = 0.5 * (a0 + a1), ah = 0.5 * (a1 - a0);

  // How big the lines come out on screen: below about 4 px a spacing, drop to half as many.
  float pxq = max(length(fwidth(q)) * 0.7071, 1e-6);
  float coarse = smoothstep(4.4, 3.4, 1.0 / (EN_LINES * pxq));
  float sp = mix(1.0, 2.0, coarse) / EN_LINES;

  // The form the lines follow: the picture's mid-scale shapes (blurred over about five lines, less
  // its broad average over twenty) and a touch of its broad light, looked up a little inside the
  // art window and faded out towards its edge, so the lines run straight into the frame.
  vec2 inB = vec2(0.02) / uCardK;
  vec2 ub = clamp(fuv, min(uArt.xy + inB, 0.5), max(uArt.zw - inB, 0.5));
  float mid = enSmooth(ub, enLod(0.05, 0.0));
  float broad = enSmooth(ub, enLod(0.15, 0.0));
  vec2 ea = min(fuv - uArt.xy, uArt.zw - fuv) * uCardK;
  float win = smoothstep(0.0, 0.16, min(ea.x, ea.y));
  float fm = mid - broad;
  // Small round things (an eye, a star) get a little bow of their own.
  float fd = enSmooth(ub, enLod(0.018, 0.0)) - mid;
  float form = (EN_FORM * fm / (1.0 + 1.5 * abs(fm)) + EN_DETAIL * fd / (1.0 + 3.0 * abs(fd)) + EN_BROAD * (broad - 0.5)) * win;

  // The tone the width follows: the picture blurred over two or three lines (a hard pixel edge
  // becomes a swell, not a contour), its local contrast raised against the broad shapes so a flat
  // band keeps its rim, and lifted a little when the whole picture is dark.
  float soft = enSmooth(fuv, enLod(1.1 * sp, lod));
  float wide = enSmooth(fuv, enLod(0.05, 0.0));
  float mean = enSmooth(vec2(0.5), 30.0);
  float lift = 0.6 * (0.48 - mean);
  float tone = mix(soft + 0.9 * (soft - wide), L, 0.08) + lift;
  float dark = clamp((1.0 - tone) / 0.95, 0.0, 1.0);

  // Sky and ground: below the upper part of the art, and wherever the land is dark.
  float hz = (P.y - ac.y - 0.15 * ah.y) + 0.25 * (0.45 - broad);
  float wSky = smoothstep(0.035, -0.02, hz), wGround = smoothstep(-0.035, 0.02, hz);

  mat2 J = mat2(dFdx(q), dFdy(q));
  mat2 Ji = inverse(transpose(J));
  // The sky's lines: nearly level, rising a little to the right.
  vec2 dS = normalize(vec2(-0.09, 1.0));
  float FS = dot(q, dS) + form;
  float rimS, sideS;
  float cutS = enSet(FS, EN_LINES, enWidth(dark) * wSky, coarse, rimS, sideS);
  // The ground's: a slant the other way, bent the same.
  vec2 dG = normalize(vec2(0.3, 1.0));
  float FG = dot(q, dG) + 0.85 * form;
  float rimG, sideG;
  float cutG = enSet(FG, EN_LINES, enWidth(dark) * wGround, coarse, rimG, sideG);
  // The cross-hatch, thinner and at about 60 degrees to both, only in the darks.
  vec2 dC = normalize(vec2(-0.9, 0.55));
  float FC = dot(q, dC) + 0.6 * form;
  float rimC, sideC;
  float cutC = enSet(FC, EN_LINES, EN_CROSS * pow(smoothstep(0.6, 1.0, dark), 1.5), coarse, rimC, sideC);
  float cutArt = 1.0 - (1.0 - cutS) * (1.0 - cutG) * (1.0 - cutC);

  // The frame, in face units of the card: rules, interlaced waves and corner rosettes round the art.
  vec2 x = P - ac;
  vec2 dv = abs(x) - ah;
  float dIn = length(max(dv, 0.0)) + min(max(dv.x, dv.y), 0.0);
  vec2 b = clamp(x, -ah, ah);
  float per = 4.0 * (ah.x + ah.y);
  float around = dv.x > dv.y
    ? (x.x > 0.0 ? 2.0 * ah.x + ah.y + b.y : 4.0 * ah.x + 3.0 * ah.y - b.y)
    : (x.y < 0.0 ? b.x + ah.x : 3.0 * ah.x + 2.0 * ah.y - b.x);
  float fw = max(min(a0.x + 0.5 * uCardK.x, 0.08), 0.02);
  float waves = 2.0 * floor(per / (fw * 2.4) + 0.5);
  float ph = around / per * waves * 6.28318;
  float hl = 0.0017;
  float bandMid = fw * 0.45, bandH = fw * 0.29;
  float ring = max(enRule(dIn - fw * 0.12, hl * 1.3), enRule(dIn - fw * 0.78, hl * 1.3));
  float guil = 0.0;
  for (int k = 0; k < 5; k++) {
    // Five waves a fifth of a turn apart cross into a rope; three slower, wider ones lace through it.
    guil = max(guil, enRule(dIn - bandMid - bandH * 0.8 * sin(ph + float(k) * 1.25664), hl));
    if (k < 3) guil = max(guil, enRule(dIn - bandMid - bandH * 0.95 * cos(0.5 * ph + float(k) * 2.0944), hl * 0.8));
  }
  // A rosette in each corner of the frame, the waves stopping at its rim.
  vec2 cc = ac + sign(x) * (ah + bandMid);
  vec2 pr = P - cc;
  float rr = length(pr), th = atan(pr.y, pr.x);
  float R = fw * 0.36;
  float ros = enRule(rr - R, hl * 1.2);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    ros = max(ros, enRule(rr - R * (0.6 + 0.32 * cos(7.0 * th + fk * 0.8976)), hl * 0.8));
    ros = max(ros, enRule(rr - R * (0.3 + 0.22 * cos(5.0 * th + fk * 1.2566)), hl * 0.7));
  }
  ros *= step(rr, R * 1.15);
  float inRos = smoothstep(R * 1.2, R * 1.05, rr);
  float inBand = step(fw * 0.12, dIn) * step(dIn, fw * 0.78);
  float frameLines = max(ring, max(guil * inBand * (1.0 - inRos), ros));
  // The name panel: a cartouche of two rules and, inside it, a fine woven ground of two crossing waves.
  vec2 kh = 0.5 * uCardK;
  float lo = a1.y + fw * 0.88, hi = kh.y - fw * 0.45;
  float upLo = -kh.y + fw * 0.45, upHi = a0.y - fw * 0.88;
  float box = 1e3;
  if (hi - lo > fw * 0.6) box = min(box, length(max(abs(P - vec2(ac.x, 0.5 * (lo + hi))) - vec2(ah.x, 0.5 * (hi - lo)) + 0.012, 0.0)) - 0.012);
  if (upHi - upLo > fw * 0.6) box = min(box, length(max(abs(P - vec2(ac.x, 0.5 * (upLo + upHi))) - vec2(ah.x, 0.5 * (upHi - upLo)) + 0.012, 0.0)) - 0.012);
  float cartouche = max(enRule(box, hl * 1.3), enRule(box + 0.006, hl));
  float r0, s0;
  float weave1 = enCut((P.y + 0.0022 * sin(P.x * 110.0)) * 230.0, 0.16, r0, s0);
  float weave2 = enCut((P.y - 0.0022 * sin(P.x * 110.0 + 1.9)) * 230.0, 0.16, r0, s0);
  float weave = max(weave1, weave2) * smoothstep(-0.004, -0.008, box) * 0.85;
  float frameCut = max(max(frameLines, cartouche), weave);
  // Dark lettering on the frame is cut solid, so the name stays crisp.
  float frameDark = 1.0 - smoothstep(0.08, 0.95, L);
  float solid = smoothstep(0.7, 0.85, frameDark);

  // The polished plate: the dark room it mirrors, the copper glow round the strip light, and the
  // light's tight pale-gold core; a fainter second strip beside it, like a window's other pane.
  float s = enBand(P, t, vec2(0.0));
  float peak = exp(-s * s / 0.0005) + 0.45 * exp(-(s - 0.12) * (s - 0.12) / 0.0003);
  float glow = exp(-s * s / 0.012);
  float room = exp(-s * s / 0.2);
  vec3 plate = mix(EN_DEEP, EN_COPPER, 0.45 * room + 0.55 * glow);
  plate = mix(plate, EN_PEAK, min(peak, 1.0));
  // A faint wash of the picture's own colour, like a hand-tinted print.
  vec3 wash = face(uv, enLod(2.0 * sp, lod)).rgb;
  vec3 hue = wash / max(max(wash.r, max(wash.g, wash.b)), 0.05);
  plate *= mix(vec3(1.0), hue, 0.12 * art);

  // The grooves: near-black ink, a hint of the picture's colour in the art.
  vec3 ink = mix(EN_INK, wash * 0.1, 0.15 * art);
  float cut = mix(max(frameCut, solid), cutArt, art);
  vec3 col = mix(plate, ink, cut);

  // The walls: the wall a pixel shows tilts across its groove, so it mirrors the strip light where
  // the flat plate does not. It lights as a thin bright line only where the cut runs along the band
  // and that wall faces the light.
  vec2 uS = enAcross(FS, Ji, dS), uG = enAcross(FG, Ji, dG);
  float sw = enBand(P, t, -sideS * uS * EN_WALL);
  float gw = enBand(P, t, -sideG * uG * EN_WALL);
  float litS = exp(-sw * sw / 0.003) * rimS * cutS;
  float litG = exp(-gw * gw / 0.003) * rimG * cutG;
  float lit = max(litS, litG) * (1.0 - cutC) * art;
  col = mix(col, EN_PEAK, 0.95 * min(lit, 1.0));
  return col;
}
`;
