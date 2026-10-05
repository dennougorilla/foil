// Engraving: the picture cut into a polished copper plate as a line engraving, like the portrait on
// an old banknote or stamp. Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/face/luma
// and the tune helpers are in scope. Every name here starts with `en`/`EN_`.
//
// What makes the real thing read as one (and what this copies):
// - The burin follows the form. The lines are the level lines of one smooth field: a base slant
//   plus the picture itself, blurred over several lines. Where the picture has a shape, the field's
//   slope is the picture's, so the lines run along its iso-contours: concentric arcs round a sun,
//   contour arcs round a head; in a flat sky they lie at the base slant. Level lines of a smooth
//   field never break, so a line never turns into dashes.
// - The spacing stays even however steep the field is: the lines are drawn at the power of two
//   nearest the wanted spacing, and where they spread a new line slips in between, swelling from
//   nothing (the way an engraver adds a line), so there is no second set of lines to beat against.
// - The sky and the ground are cut at different base angles (near level above, a slant below).
// - Tone is the line's WIDTH, swelling and tapering smoothly along it: nothing in the lights, a
//   hairline, then up to just over half a spacing (never a solid bar). In the darkest parts (tone
//   below 0.35) a second set crosses the first at a shallow angle (about 30 degrees), swelling in
//   from nothing and out again, and only where it truly crosses.
// - The plate is a polished mirror: a dark, cool copper reflecting a dim room, and a very narrow
//   white-hot band where it reflects a strip light. The band never lands on the ink. It sweeps as
//   the card tilts but always stays on the card. Each groove's wall is tilted, so it mirrors the
//   strip somewhere else: the walls light as thin bright lines only where the cut lines up.
// - The frame is a guilloche: three phase-offset families of nested hairline sine waves lace a
//   band between rules, an epicycloid rosette at each corner, and the name panel has a wave-line
//   tint with the name and the rarity cut into it (a dark groove and a bright lit wall).
// Nothing reads the clock: it moves only with the tilt, so it holds still when motion is reduced
// and every export loop closes by itself.

export const ENGRAVING_GLSL = /* glsl */ `
// Lines per short side of the card, and the closest they may come on screen (px), so a small
// card gets fewer, still-resolvable lines.
const float EN_LINES = 66.0;
const float EN_MINPX = 5.0;
// The thinnest a line gets (of a spacing) before it tapers out in the light, the widest, and the
// widest a cross-hatch line gets; the tone below which the cross-hatch comes in.
const float EN_HAIR = 0.06;
const float EN_FULL = 0.55;
const float EN_CROSS = 0.16;
const float EN_XTONE = 0.3;
// The cross-hatch's angle to the main lines (radians: 30 degrees).
const float EN_XANG = 0.5236;
// How far the picture bends the lines (card units per unit of brightness): its broad shapes
// (blurred over EN_BROAD_S) and its mid-scale ones (over EN_MID_S).
const float EN_BEND = 0.24;
const float EN_BEND_MID = 0.03;
const float EN_BROAD_S = 0.08;
const float EN_MID_S = 0.035;
// The base slants of the sky and the ground (across the lines).
const vec2 EN_SKY = vec2(-0.08, 1.0);
const vec2 EN_GROUND = vec2(0.36, 1.0);
// Copper's own colour (as a mirror), the room it mirrors (dim and cool), the strip light's core,
// and the ink in the grooves.
const vec3 EN_CU = vec3(0.97, 0.64, 0.46);
const vec3 EN_ROOM = vec3(0.9, 0.95, 1.0);
const vec3 EN_PEAK = vec3(1.0, 0.985, 0.95);
const vec3 EN_INK = vec3(0.02, 0.014, 0.012);
// The band: its core's half-width and the quick copper falloff round it (card units).
const float EN_CORE = 0.011;
const float EN_HALO = 0.032;
// A groove's wall slope (a burin cuts a V about this steep) and how far a tilted wall moves the
// strip light's reflection (card units per unit of slope).
const float EN_WALL = 0.5;
const float EN_REACH = 0.8;
// The band lies across this direction.
const vec2 EN_A = vec2(0.62, 0.785);

// The mip level that blurs the face over s card units (never sharper than the pixel picture's).
float enLod(float s, float lod) { return max(log2(s * uFaceTexels / uCardK.x), lod); }

// The face's colour at face uv through a cubic B-spline on one mip level: smooth in value and
// slope, so level lines drawn through it bend without the kinks a bilinear lookup leaves at every texel.
vec3 enCubic(vec2 fuv, int li) {
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
  return s.rgb / max(s.a, 1e-3);
}
// The same at a fractional level (between the two nearest), clamped to the levels the face has.
vec3 enSmooth(vec2 fuv, float l) {
  vec2 sz0 = vec2(textureSize(uFace, 0));
  float top = floor(log2(max(sz0.x, sz0.y)));
  l = clamp(l, 0.0, top);
  float l0 = floor(l);
  vec3 a = enCubic(fuv, int(l0));
  return l0 >= top ? a : mix(a, enCubic(fuv, int(l0) + 1), l - l0);
}
// The brightness an engraver reads: luma, lifted a little by the strongest channel, so a red bird
// on green leaves (the same luma) still parts from them.
float enTone(vec3 c) { return mix(luma(c), max(c.r, max(c.g, c.b)), 0.35); }

// The two smooth fields whose level lines are the grooves (x: the main lines, y: the cross-hatch),
// at P (face card units). lo/hi keep the lookups inside the art window.
vec2 enField(vec2 P, vec2 ac, vec2 ah, vec2 lo, vec2 hi) {
  vec2 fuv = clamp(P / uCardK + 0.5, lo, hi);
  float bb = enTone(enSmooth(fuv, enLod(EN_BROAD_S, 0.0)));
  float bm = enTone(enSmooth(fuv, enLod(EN_MID_S, 0.0)));
  vec2 x = P - ac;
  // The ground: below the upper part of the art, and wherever the land is dark.
  float hz = (x.y - 0.1 * ah.y) + 0.3 * (0.45 - bb);
  vec2 d = normalize(mix(normalize(EN_SKY), normalize(EN_GROUND), smoothstep(-0.12, 0.12, hz)));
  vec2 dc = vec2(d.x * cos(EN_XANG) - d.y * sin(EN_XANG), d.x * sin(EN_XANG) + d.y * cos(EN_XANG));
  float bend = (EN_BEND * (bb - 0.5) + EN_BEND_MID * (bm - bb));
  return vec2(dot(x, d) + bend, dot(x, dc) + 0.55 * bend);
}

// Coverage of grooves along a smooth field F whose slope is g (per card unit) and screen footprint
// aaF (fwidth of F), at about T lines per card unit, w (0..1 of a spacing) wide. The lines are drawn
// at the power of two nearest below T / g; as they spread the lines halfway between swell in from
// nothing, so the spacing stays even with no second set to beat against. rim is the thin strip of
// wall just inside the groove's edge, side which wall it is (+1/-1 across F).
float enLines(float F, float g, float aaF, float T, float w, out float rim, out float side) {
  float x = clamp(log2(T / max(g, 1e-3)), 0.0, 13.0);
  float j = floor(x);
  float k = smoothstep(0.0, 1.0, x - j);
  float n = exp2(j + 1.0);
  float u = F * n;
  float aa = max(aaF * n, 1e-4);
  // Even lines (always there) and odd ones (slipping in), both in units of the finer set.
  float xe = fract(0.5 * u + 0.5) - 0.5, xo = fract(0.5 * u) - 0.5;
  float we = w * (2.0 - k), wo = w * k;
  float ie = (0.5 * we - 2.0 * abs(xe)) / aa, io = (0.5 * wo - 2.0 * abs(xo)) / aa;
  float ce = clamp(ie + 0.5, 0.0, 1.0) * min(we / aa, 1.0);
  float co = clamp(io + 0.5, 0.0, 1.0) * min(wo / aa, 1.0);
  bool even = ce >= co;
  float inside = even ? ie : io;
  side = (even ? xe : xo) >= 0.0 ? 1.0 : -1.0;
  rim = clamp(1.0 - abs(inside - 0.6) / 0.7, 0.0, 1.0) * smoothstep(1.0, 2.5, (even ? we : wo) / aa);
  return max(ce, co);
}

// A stroke's width at darkness k (0..1): nothing in the brightest light, a hairline, then a smooth
// S-curve swell to EN_FULL. k comes from a blurred picture, so the width tapers along a line.
float enWidth(float k) {
  return mix(EN_HAIR * smoothstep(0.02, 0.1, k), EN_FULL, smoothstep(0.1, 1.0, k));
}

// A hairline wpx screen pixels wide at distance d (card units) from its centre; px is a pixel in card units.
float enHair(float d, float wpx, float px) {
  return clamp(0.5 * wpx - abs(d) / px + 0.5, 0.0, 1.0) * min(wpx, 1.0);
}
// The distance to y = a * sin(p) (p advancing k per card unit along x), from the offset dy.
float enSine(float dy, float a, float p, float k) {
  return (dy - a * sin(p)) / sqrt(1.0 + a * a * k * k * cos(p) * cos(p));
}
// The distance to the polar curve r = R * (b + c * cos(n * th + ph)).
float enPolar(float r, float th, float R, float b, float c, float n, float ph) {
  float f = R * (b + c * cos(n * th + ph));
  float df = -R * c * n * sin(n * th + ph);
  return (r - f) / sqrt(1.0 + df * df / max(r * r, 1e-6));
}

// Where the plate mirrors the strip light: s = 0 on the band's centre. The band lies across EN_A; a
// tilt slides it over the card (never quite off it). nxy tilts the surface (a groove's wall), which moves it.
float enBand(vec2 P, vec2 t, vec2 nxy) {
  float o = -0.16 + 0.8 * dot(t, vec2(0.8, 0.6));
  o = 0.58 * tanh(o / 0.58);
  return dot(P, EN_A) + EN_REACH * dot(nxy, EN_A) - o;
}

/** uv is pattern uv (the lines follow the tune's size); m is the face mask. */
vec3 engraving(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  vec2 q = (uv - 0.5) * uCardK;
  float art = m.r;
  vec2 fuv = tuneFaceUv(uv);
  vec2 P = (fuv - 0.5) * uCardK;
  vec2 a0 = (uArt.xy - 0.5) * uCardK, a1 = (uArt.zw - 0.5) * uCardK;
  vec2 ac = 0.5 * (a0 + a1), ah = 0.5 * (a1 - a0);
  // A screen pixel in card units, and the tune's zoom (pattern units per card unit).
  float px = max(length(fwidth(P)) * 0.7071, 1e-6);
  float zoom = sqrt(abs(determinant(mat2(dFdx(q), dFdy(q)))) / max(abs(determinant(mat2(dFdx(P), dFdy(P)))), 1e-12));
  float T = min(EN_LINES * zoom, 1.0 / (EN_MINPX * px));

  // The fields and their slopes (by small steps, so the slope is smooth from pixel to pixel).
  vec2 inB = vec2(0.04) / uCardK;
  vec2 lo = min(uArt.xy + inB, 0.5), hi = max(uArt.zw - inB, 0.5);
  float h = 0.004;
  vec2 f0 = enField(P, ac, ah, lo, hi);
  vec2 fx = (enField(P + vec2(h, 0.0), ac, ah, lo, hi) - f0) / h;
  vec2 fy = (enField(P + vec2(0.0, h), ac, ah, lo, hi) - f0) / h;
  vec2 gF = vec2(fx.x, fy.x), gH = vec2(fx.y, fy.y);
  float sF = max(length(gF), 1e-4), sH = max(length(gH), 1e-4);
  vec2 nF = gF / sF, nH = gH / sH;

  // The tone the width follows: the picture blurred over about a line (a hard pixel edge becomes a
  // swell, not a contour), its local contrast raised against the broad shapes, lifted a little when
  // the whole picture is dark.
  float soft = enTone(enSmooth(fuv, enLod(0.9 / T, lod)));
  float wide = enTone(enSmooth(fuv, enLod(0.06, 0.0)));
  float mean = enTone(enSmooth(vec2(0.5), 30.0));
  float tone = mix(soft + 1.0 * (soft - wide), L, 0.06) + 0.6 * (0.48 - mean);
  float dark = clamp((1.0 - tone) / 0.95, 0.0, 1.0);

  float rimF, sideF, rimH, sideH;
  float cutF = enLines(f0.x, sF, fwidth(f0.x), T, enWidth(dark), rimF, sideF);
  // The cross-hatch: only in the darkest parts, and only where it truly crosses the main lines.
  float cross = smoothstep(EN_XTONE, 0.0, tone) * smoothstep(0.985, 0.93, abs(dot(nF, nH)));
  float cutH = enLines(f0.y, sH, fwidth(f0.y), T, EN_CROSS * cross * cross * cross, rimH, sideH);
  float cutArt = 1.0 - (1.0 - cutF) * (1.0 - cutH);

  // The frame, in face card units: rules, a laced guilloche and corner rosettes round the art.
  vec2 x = P - ac;
  vec2 dv = abs(x) - ah;
  float dIn = length(max(dv, 0.0)) + min(max(dv.x, dv.y), 0.0);
  vec2 b = clamp(x, -ah, ah);
  float per = 4.0 * (ah.x + ah.y);
  float around = dv.x > dv.y
    ? (x.x > 0.0 ? 2.0 * ah.x + ah.y + b.y : 4.0 * ah.x + 3.0 * ah.y - b.y)
    : (x.y < 0.0 ? b.x + ah.x : 3.0 * ah.x + 2.0 * ah.y - b.x);
  float fw = max(min(a0.x + 0.5 * uCardK.x, 0.08), 0.02);
  float r0 = fw * 0.16, r1 = fw * 0.8;
  float bm = 0.5 * (r0 + r1), bh = 0.5 * (r1 - r0);
  float waves = 2.0 * floor(per / (fw * 1.5) + 0.5);
  float kw = waves * 6.28318 / per;
  float ph = around * kw;
  float ring = max(max(enHair(dIn - r0, 1.1, px), enHair(dIn - r1, 1.1, px)), enHair(dIn - r1 - 2.2 * px, 0.8, px));
  float guil = 0.0;
  for (int i = 0; i < 3; i++) {
    // Three families a third of a turn apart, each five nested waves fanning from shared nodes.
    float pi = ph + float(i) * 2.0944;
    for (int k = 0; k < 5; k++) {
      float a = bh * (0.42 + 0.13 * float(k));
      guil = max(guil, enHair(enSine(dIn - bm, a, pi, kw), 0.75, px));
    }
  }
  // An epicycloid rosette in each corner of the frame; the waves stop at its rim.
  vec2 cc = ac + sign(x) * (ah + bm);
  vec2 pr = P - cc;
  float rr = length(pr), th = atan(pr.y, pr.x);
  float R = fw * 0.62;
  float ros = max(enHair(rr - R, 1.0, px), enHair(rr - R * 0.2, 0.8, px));
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    ros = max(ros, enHair(enPolar(rr, th, R, 0.8, 0.14, 24.0, fk * 1.5708), 0.75, px));
    if (k < 3) ros = max(ros, enHair(enPolar(rr, th, R, 0.48, 0.2, 12.0, fk * 2.0944), 0.75, px));
  }
  float inRos = smoothstep(R * 1.08, R * 0.98, rr);
  ros *= step(rr, R * 1.02);
  float inBand = step(r0, dIn) * step(dIn, r1);
  float frameLines = max(ring * (1.0 - inRos), max(guil * inBand * (1.0 - inRos), ros));
  // The name panel: a cartouche of two rules round a fine wave-line tint.
  vec2 kh = 0.5 * uCardK;
  float plo = a1.y + fw * 0.88, phi = kh.y - fw * 0.45;
  float upLo = -kh.y + fw * 0.45, upHi = a0.y - fw * 0.88;
  float box = 1e3;
  if (phi - plo > fw * 0.6) box = min(box, length(max(abs(P - vec2(ac.x, 0.5 * (plo + phi))) - vec2(ah.x, 0.5 * (phi - plo)) + 0.012, 0.0)) - 0.012);
  if (upHi - upLo > fw * 0.6) box = min(box, length(max(abs(P - vec2(ac.x, 0.5 * (upLo + upHi))) - vec2(ah.x, 0.5 * (upHi - upLo)) + 0.012, 0.0)) - 0.012);
  float cartouche = max(enHair(box, 1.1, px), enHair(box + 3.0 * px, 0.8, px));
  float tint = P.y * 170.0 + 0.35 * sin(P.x * 70.0);
  float tl = abs(fract(tint) - 0.5) / 170.0;
  float tintCut = enHair(tl, 0.8, px) * smoothstep(1.6, 3.0, 1.0 / (170.0 * px)) * smoothstep(-0.003, -0.006, box) * 0.8;
  float frameCut = max(max(frameLines, cartouche), tintCut);
  // Dark print on the frame (the name, the rarity) is cut as an incised groove: read through a
  // smooth spline so its outline is clean, and with a thin bright wall on the side facing the light.
  float glyphL = luma(enSmooth(fuv, enLod(0.0032, 0.0)));
  vec2 lit1 = vec2(1.0, 1.0) * px * 1.1 / uCardK;
  float glyphO = luma(enSmooth(fuv + lit1, enLod(0.0032, 0.0)));
  float ge = max(fwidth(glyphL), 0.02);
  float glyph = smoothstep(0.56 + ge, 0.56 - ge, glyphL);
  float glyphNext = smoothstep(0.56 + ge, 0.56 - ge, glyphO);
  float solid = glyph * (1.0 - art);
  float wallLit = glyph * (1.0 - glyphNext) * (1.0 - art);

  // The polished plate: a dim cool room (a little brighter above, a soft window that drifts with the
  // tilt), the strip light's quick copper glow and its narrow white-hot core, and a fainter second
  // pane beside it. The light lands only on bare plate: the ink is laid over it.
  float s = enBand(P, t, vec2(0.0));
  float s2 = s - 0.15;
  float core = exp(-s * s / (EN_CORE * EN_CORE)) + 0.4 * exp(-s2 * s2 / (0.5 * EN_CORE * EN_CORE));
  float halo = exp(-s * s / (EN_HALO * EN_HALO)) + 0.3 * exp(-s2 * s2 / (0.4 * EN_HALO * EN_HALO));
  vec2 win2 = vec2(-0.55, 0.83);
  float drift = dot(P, win2) - 0.35 * dot(t, vec2(-0.6, 0.8)) + 0.15;
  float env = 0.5 - 0.14 * clamp(P.y / kh.y, -1.0, 1.0) + 0.14 * exp(-drift * drift / 0.05);
  vec3 plate = EN_CU * EN_ROOM * env;
  plate = mix(plate, EN_CU * 1.08, 0.75 * min(halo, 1.0));
  plate = mix(plate, EN_PEAK, min(core, 1.0));
  // A faint wash of the picture's own colour, like a hand-tinted print (not on the band).
  vec3 wash = face(uv, enLod(2.0 / T, lod)).rgb;
  vec3 hue = wash / max(max(wash.r, max(wash.g, wash.b)), 0.05);
  plate *= mix(vec3(1.0), hue, 0.12 * art * (1.0 - min(core + halo, 1.0)));

  // The grooves: near-black ink, a hint of the picture's colour in the art.
  vec3 ink = mix(EN_INK, wash * 0.08, 0.15 * art);
  float cut = mix(max(frameCut, solid), cutArt, art);
  vec3 col = mix(plate, ink, cut);

  // The walls: the wall a pixel shows tilts across its groove, so it mirrors the strip light where
  // the flat plate does not. It lights as a thin bright line only where the cut runs along the band
  // and that wall faces the light.
  float sw = enBand(P, t, -sideF * nF * EN_WALL);
  float lit = exp(-sw * sw / 0.0016) * rimF * (1.0 - cutH) * art;
  col = mix(col, EN_PEAK, 0.95 * min(lit, 1.0));
  // The lettering's lit wall: brighter where the band is near.
  vec3 wallCol = mix(EN_CU * 0.9, EN_PEAK, 0.4 + 0.6 * min(halo, 1.0));
  col = mix(col, wallCol, 0.9 * wallLit);
  return col;
}
`;
