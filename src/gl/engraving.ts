// Engraving: the picture cut into a polished copper plate as a line engraving, like the portrait on
// an old banknote or stamp. Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/face/luma
// and the tune helpers are in scope. Every name here starts with `en`/`EN_`.
//
// What makes the real thing read as one (and what this copies):
// - The burin cuts straight, parallel lines, a base slant per region (near level in the sky, a
//   slant in the ground), and bends them only a little with the form: each line is pushed along its
//   normal by the broad picture, never more than about a spacing per few lines, so a line can
//   never close into a ring or a whorl. Where sky meets ground the lines of each taper out along a
//   soft seam rather than bending into each other.
// - Tone is the line's WIDTH, swelling and tapering smoothly along it, over a wide, gamma-shaped
//   range: bare plate in the lights, a hairline, then up to near-merged swells in the shadows.
//   The width is read from the picture blurred over more than a spacing, so a line tapers to
//   nothing over a spacing or two instead of breaking off. Local contrast is raised first, so the
//   mid-tones part.
// - Across the darkest quarter of tones a second set crosses the first at 50 degrees.
// - Along the picture's strong edges a thin outline is cut (the zero line of a difference of two
//   blurs, kept only where the broad edge is strong), so an eye or a silhouette reads at once.
// - The grooves hold a dark brown-black ink, not black; the wall facing the light shows as a thin
//   bright lip. The plate between is a polished mirror: a dim cool room and a narrow white-hot
//   band where it mirrors a strip light. The band is a smooth sheen only on bare plate: over the
//   hatching it breaks up into the lit groove walls, which mirror the strip elsewhere (a tilted
//   wall), so it shows as fine bright line segments only where a cut lines up with it.
// - The frame is a guilloche: three phase-offset families of nested hairline sine waves lace a
//   band between rules, a large epicycloid rosette medallion at each corner, and the name panel
//   has a wave-line tint with the name (set in a serif) cut into it as a V-groove: a lit wall and a
//   dark wall.
// Nothing reads the clock: it moves only with the tilt, so it holds still when motion is reduced
// and every export loop closes by itself.

export const ENGRAVING_GLSL = /* glsl */ `
// Lines per short side of the card, and the closest they may come on screen (px), so a small
// card gets fewer, still-resolvable lines.
const float EN_LINES = 66.0;
const float EN_MINPX = 5.0;
// The thinnest a line gets (of a spacing) before it tapers out in the light, the widest (swells
// all but merging in the shadows), the gamma of the tone-to-width curve, and the widest a
// cross-hatch line gets.
const float EN_HAIR = 0.06;
const float EN_FULL = 0.84;
const float EN_GAMMA = 1.35;
const float EN_CROSS = 0.5;
// The darkness above which the cross-hatch comes in (full by EN_XFULL): the darkest quarter.
const float EN_XDARK = 0.68;
const float EN_XFULL = 0.9;
// The cross-hatch's angle to the main lines (radians: 50 degrees).
const float EN_XANG = 0.8727;
// How far the picture pushes the lines along their normal (card units per unit of brightness),
// from its broadest shapes and from its broad ones. Kept small enough that the push never
// changes by more than a fraction of the spacing from line to line.
const float EN_BEND = 0.035;
const float EN_BEND_MID = 0.014;
const float EN_VBROAD_S = 0.14;
const float EN_BROAD_S = 0.05;
// The base slants of the sky and the ground (across the lines), and the half-width of the seam
// where one tapers out into the other (card units).
const vec2 EN_SKY = vec2(-0.06, 1.0);
const vec2 EN_GROUND = vec2(0.42, 1.0);
const float EN_SEAM = 0.022;
// Copper's own colour (as a mirror), the room it mirrors (dim and cool), the strip light's core,
// and the ink in the grooves (a dark brown-black, never black).
const vec3 EN_CU = vec3(0.97, 0.64, 0.46);
const vec3 EN_ROOM = vec3(0.9, 0.95, 1.0);
const vec3 EN_PEAK = vec3(1.0, 0.985, 0.95);
const vec3 EN_INK = vec3(0.105, 0.062, 0.042);
// Where the room's light comes from (card units, y down: the upper left).
const vec2 EN_LDIR = vec2(-0.6, -0.8);
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
// slope, so widths and edges drawn from it have none of the kinks a bilinear lookup leaves.
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
float enToneAt(vec2 fuv, float s, float lod) { return enTone(enSmooth(fuv, enLod(s, lod))); }

// A set of straight parallel grooves across the unit normal n, pushed along n by off (card
// units), T lines per card unit, w (0..1 of a spacing) wide. Returns the coverage; xd is where the
// pixel lies across its line (-0.5..0.5 of a spacing), rim the thin strip of wall just inside the
// groove's edge. A line thinner than a pixel fades out rather than breaking up.
float enLines(vec2 x, vec2 n, float off, float T, float w, out float xd, out float rim) {
  float u = (dot(x, n) + off) * T;
  float aa = max(fwidth(u), 1e-4);
  xd = fract(u + 0.5) - 0.5;
  float inside = (0.5 * w - abs(xd)) / aa;
  rim = clamp(1.0 - abs(inside - 0.6) / 0.6, 0.0, 1.0) * smoothstep(1.5, 3.0, w / aa);
  return clamp(inside + 0.5, 0.0, 1.0) * min(w / aa, 1.0);
}

// A stroke's width at darkness k (0..1): bare plate in the brightest light, a hairline, then a
// gamma-shaped swell up to EN_FULL. k comes from a blurred picture, so the width tapers along a line.
float enWidth(float k) {
  float hair = EN_HAIR * smoothstep(0.04, 0.12, k);
  return max(hair, EN_FULL * pow(smoothstep(0.06, 1.0, k), EN_GAMMA));
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
  vec2 x = P - ac;
  // A screen pixel in card units, and the tune's zoom (pattern units per card unit).
  float px = max(length(fwidth(P)) * 0.7071, 1e-6);
  float zoom = sqrt(abs(determinant(mat2(dFdx(q), dFdy(q)))) / max(abs(determinant(mat2(dFdx(P), dFdy(P)))), 1e-12));
  float T = min(EN_LINES * zoom, 1.0 / (EN_MINPX * px));
  vec2 inB = vec2(0.04) / uCardK;
  vec2 auv = clamp(fuv, min(uArt.xy + inB, 0.5), max(uArt.zw - inB, 0.5));

  // The tone. Local contrast is raised (the picture against its own neighbourhood, then that
  // against the whole), and the result is lifted when the whole picture is dark. The width follows
  // the picture blurred over about a spacing and a half, so a line swells and tapers smoothly.
  float soft = enToneAt(fuv, 1.5 / T, lod);
  float near = enToneAt(fuv, 0.05, 0.0);
  float wide = enToneAt(auv, EN_VBROAD_S, 0.0);
  float mean = enTone(enSmooth(vec2(0.5), 30.0));
  float tone = 0.56 + 1.5 * (soft - near) + 1.35 * (near - wide) + 1.15 * (wide - mean) + 0.4 * (mean - 0.5);
  tone = mix(tone, L, 0.04);
  float dark = clamp(1.0 - tone, 0.0, 1.0);

  // The push: the broad shapes bend the lines a little along their normal, never into rings.
  float bb = enToneAt(auv, EN_BROAD_S, 0.0);
  float off = EN_BEND * (wide - 0.5) + EN_BEND_MID * (bb - wide);

  // Sky above, ground below: the seam follows the picture's broadest shapes a little (a dark land
  // pulls it up), and each set tapers out across it.
  float hz = (x.y - 0.1 * ah.y) + 0.25 * (0.45 - wide);
  float gnd = smoothstep(-EN_SEAM, EN_SEAM, hz);
  vec2 nS = normalize(EN_SKY), nG = normalize(EN_GROUND);
  float w = enWidth(dark);
  float xdS, rimS, xdG, rimG;
  float cS = enLines(x, nS, off, T, w * (1.0 - gnd), xdS, rimS);
  float cG = enLines(x, nG, off, T, w * gnd, xdG, rimG);
  bool sky = cS * (1.0 - gnd) >= cG * gnd;
  float cutF = max(cS, cG);
  float xdF = sky ? xdS : xdG;
  float rimF = sky ? rimS : rimG;
  vec2 nF = sky ? nS : nG;
  vec2 nB = gnd < 0.5 ? nS : nG;
  // The cross-hatch, across the darkest quarter of tones, at EN_XANG to the main lines.
  vec2 nH = vec2(nB.x * cos(EN_XANG) - nB.y * sin(EN_XANG), nB.x * sin(EN_XANG) + nB.y * cos(EN_XANG));
  float xw = EN_CROSS * pow(smoothstep(EN_XDARK, EN_XFULL, dark), 1.2) * (1.0 - 2.0 * min(gnd, 1.0 - gnd));
  float xdH, rimH;
  float cutH = enLines(x, nH, 0.6 * off, T, xw, xdH, rimH);

  // The outline along strong edges: the zero line of a difference of two blurs (about a third and
  // a whole spacing), kept where the broad edge is strong. Its distance in pixels comes from the
  // screen slope, so it is a clean line about a pixel and a half wide whatever the zoom.
  float eS = max(0.6 / T, 0.012);
  float e1 = enToneAt(fuv, eS, lod), e2 = enToneAt(fuv, 2.5 * eS, lod);
  float dog = e1 - e2;
  float dpx = abs(dog) / max(length(vec2(dFdx(dog), dFdy(dog))), 1e-5);
  float hE = 0.012;
  vec2 gE = vec2(enToneAt(auv + vec2(hE, 0.0) / uCardK, 0.02, 0.0) - enToneAt(auv - vec2(hE, 0.0) / uCardK, 0.02, 0.0),
                 enToneAt(auv + vec2(0.0, hE) / uCardK, 0.02, 0.0) - enToneAt(auv - vec2(0.0, hE) / uCardK, 0.02, 0.0));
  float strong = smoothstep(0.16, 0.34, length(gE));
  float outline = clamp(1.3 - dpx / 0.9, 0.0, 1.0) * strong * smoothstep(1.5, 3.0, 1.0 / (T * px));
  float cutArt = 1.0 - (1.0 - cutF) * (1.0 - cutH) * (1.0 - outline);

  // The frame, in face card units: rules, a laced guilloche and corner rosettes round the art.
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
  // A large epicycloid rosette medallion at each corner, over the frame and the art's corner: the
  // waves and the hatching stop at its rim, inside it is bare plate and its own laced curves.
  vec2 cc = ac + sign(x) * (ah + bm);
  vec2 pr = P - cc;
  float rr = length(pr), th = atan(pr.y, pr.x);
  float R = fw * 1.15;
  float ros = max(max(enHair(rr - R, 1.3, px), enHair(rr - R - 2.5 * px, 0.8, px)), enHair(rr - R * 0.16, 0.9, px));
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    ros = max(ros, enHair(enPolar(rr, th, R, 0.8, 0.13, 30.0, fk * 1.5708), 0.75, px));
    ros = max(ros, enHair(enPolar(rr, th, R, 0.55, 0.18, 16.0, fk * 1.5708 + 0.4), 0.75, px));
    if (k < 3) ros = max(ros, enHair(enPolar(rr, th, R, 0.3, 0.22, 8.0, fk * 2.0944), 0.75, px));
  }
  float inRos = smoothstep(R + 3.0 * px, R + 1.5 * px, rr);
  ros *= step(rr, R + 3.5 * px);
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
  float frameCut = max(max(frameLines * (1.0 - art * (1.0 - inRos)), cartouche * (1.0 - inRos)), tintCut * (1.0 - inRos));
  // Dark print on the frame (the name, the rarity) is cut as a V-groove: its outline read through a
  // smooth spline, and its two walls told apart by which way a softer copy of it slopes: the wall
  // facing the light is bright copper (white-hot where the band is near), the other in shade.
  float glyphL = luma(enSmooth(fuv, enLod(0.0032, 0.0)));
  float ge = max(fwidth(glyphL), 0.02);
  float glyph = smoothstep(0.56 + ge, 0.56 - ge, glyphL) * (1.0 - art);
  vec2 hg = vec2(0.0022) / uCardK;
  float gls = enLod(0.0045, 0.0);
  vec2 gg = vec2(luma(enSmooth(fuv + vec2(hg.x, 0.0), gls)) - luma(enSmooth(fuv - vec2(hg.x, 0.0), gls)),
                 luma(enSmooth(fuv + vec2(0.0, hg.y), gls)) - luma(enSmooth(fuv - vec2(0.0, hg.y), gls)));
  // A wall's surface faces into the groove, against the slope of the print's brightness.
  float facing = dot(-gg / max(length(gg), 1e-4), normalize(EN_LDIR));
  float wallLit = glyph * smoothstep(-0.15, 0.45, facing) * smoothstep(0.004, 0.02, length(gg));

  // The polished plate: a dim cool room (a little brighter above, a soft window that drifts with the
  // tilt), the strip light's quick copper glow and its narrow white-hot core, and a fainter second
  // pane beside it.
  float s = enBand(P, t, vec2(0.0));
  float s2 = s - 0.15;
  float core = exp(-s * s / (EN_CORE * EN_CORE)) + 0.4 * exp(-s2 * s2 / (0.5 * EN_CORE * EN_CORE));
  float halo = exp(-s * s / (EN_HALO * EN_HALO)) + 0.3 * exp(-s2 * s2 / (0.4 * EN_HALO * EN_HALO));
  vec2 win2 = vec2(-0.55, 0.83);
  float drift = dot(P, win2) - 0.35 * dot(t, vec2(-0.6, 0.8)) + 0.15;
  float env = 0.56 - 0.14 * clamp(P.y / kh.y, -1.0, 1.0) + 0.14 * exp(-drift * drift / 0.05);
  // Over the hatching the flat sheen gives way to the lit groove walls (below): the denser the
  // hatching, the less smooth band is left between the cuts.
  float hatch = art * (1.0 - inRos) * smoothstep(0.08, 0.6, max(w, xw));
  float sheen = 1.0 - 0.8 * hatch;
  vec3 plate = EN_CU * EN_ROOM * env;
  plate = mix(plate, EN_CU * 1.08, 0.75 * min(halo, 1.0) * mix(1.0, sheen, 0.6));
  plate = mix(plate, EN_PEAK, min(core, 1.0) * sheen);
  // A faint wash of the picture's own colour, like a hand-tinted print (not on the band).
  vec3 wash = face(uv, enLod(2.0 / T, lod)).rgb;
  vec3 hue = wash / max(max(wash.r, max(wash.g, wash.b)), 0.05);
  plate *= mix(vec3(1.0), hue, 0.12 * art * (1.0 - inRos) * (1.0 - min(core + halo, 1.0)));

  // The grooves: dark brown-black ink, a hint of the picture's colour in the art.
  vec3 ink = mix(EN_INK, wash * 0.12, 0.15 * art);
  float cut = mix(max(frameCut, glyph), cutArt * (1.0 - inRos), art);
  cut = max(cut, ros * inRos);
  vec3 col = mix(plate, ink, cut);

  // The lip: the groove's wall that faces the light shows as a thin line of lighter copper.
  float lip = rimF * step(0.0, -sign(xdF) * dot(nF, normalize(EN_LDIR))) * (1.0 - cutH) * (1.0 - outline);
  float lipH = rimH * step(0.0, -sign(xdH) * dot(nH, normalize(EN_LDIR))) * (1.0 - cutF);
  float lips = max(lip, 0.8 * lipH) * art * (1.0 - inRos);
  col = mix(col, EN_CU * (0.62 + 0.25 * env), 0.75 * lips);
  // The walls mirror the strip light where the flat plate does not (a tilted wall moves its
  // reflection), so the band shows on the hatching as fine bright segments where the cut lines up.
  float sw = enBand(P, t, -sign(xdF) * nF * EN_WALL);
  float swH = enBand(P, t, -sign(xdH) * nH * EN_WALL);
  float lit = max(exp(-sw * sw / 0.0012) * rimF * (1.0 - cutH), exp(-swH * swH / 0.0012) * rimH * (1.0 - cutF));
  lit *= art * (1.0 - inRos) * (1.0 - outline);
  col = mix(col, EN_PEAK, 0.95 * min(lit, 1.0));
  // The lettering's walls: the lit one bright copper (white-hot near the band), the other in shade.
  vec3 wallCol = mix(EN_CU * 0.95, EN_PEAK, 0.35 + 0.65 * min(halo, 1.0));
  vec3 shadeCol = mix(EN_INK, EN_CU * 0.3, 0.5);
  col = mix(col, shadeCol, 0.6 * glyph * (1.0 - smoothstep(-0.15, 0.45, facing)));
  col = mix(col, wallCol, 0.9 * wallLit);
  return col;
}
`;
