// Engraving: the picture cut into a copper plate as a line engraving, like the portrait on an old
// banknote or stamp. Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/face/luma
// and the tune helpers are in scope. Every name here starts with `en`/`EN_`.
//
// What makes the real thing read as one (and what this copies):
// - One set of fine, evenly spaced lines carries the whole picture, each an unbroken burin stroke
//   whose width swells smoothly in the shadows and thins to a hairline in the lights; in the
//   brightest places the hairline breaks into short flicks that end in pointed slivers, so even
//   a highlight is still engraved metal.
// - The lines follow the form (contour hatching): they are the level lines of the picture's broad
//   shapes laid over a gentle slant, so they bulge and orbit round an eye or a sun disc and run
//   along a ridge, never kinking at a pixel's hard edge.
// - A hard silhouette is drawn once, as a single crisp engraved outline.
// - A second, thinner set is laid over the first only in the deepest shadows (added, never cut
//   into it), so the darks are cross-hatched lozenges and the strokes stay whole.
// - The frame is a calm guilloche: two interlaced waves between two rules round the art, and a
//   plain polished cartouche where the name sits.
// - The plate is polished copper mirroring a room: a long, narrow, slightly streaky window strip
//   slides across it as the card tilts, never brighter than pale gold.
// - The grooves hold dark ink; only the lip of each cut catches the light, every groove on the
//   same side at the same time, so a tilt runs a coherent sheen along the lines.
// Nothing reads the clock: it moves only with the tilt and the light, so it holds still when
// motion is reduced and every export loop closes by itself.

export const ENGRAVING_GLSL = /* glsl */ `
// Lines per short side of the card.
const float EN_LINES = 140.0;
// How far (card units) the picture's broad and middle shapes bend the lines.
const float EN_BEND_BIG = 0.13;
const float EN_BEND_MID = 0.022;
// The thinnest a line gets (of a spacing), and the widest.
const float EN_HAIR = 0.17;
const float EN_FULL = 0.6;
// Polished copper's own colour (its reflectance), the ink left in the grooves, the brightest the
// plate ever gets (pale gold) and the slope of a groove's walls (a burin cuts a V about this steep).
const vec3 EN_COPPER = vec3(0.93, 0.58, 0.4);
const vec3 EN_INK = vec3(0.05, 0.027, 0.02);
const vec3 EN_PALE = vec3(1.0, 0.8, 0.6);
const float EN_WALL = 0.5;
const vec2 EN_ROOM_DIR = vec2(0.8, 0.6);

// The mip level that blurs the face over s card units (never sharper than the pixel picture's).
float enLod(float s, float lod) { return max(log2(s * uFaceTexels / uCardK.x), lod); }
float enLuma(vec2 uv, float l) { return luma(face(uv, l).rgb); }
// The same in face uv (no tune), premultiplied as the face is.
float enBlur(vec2 fuv, float l) { vec4 f = textureLod(uFace, fuv, l); return luma(f.rgb / max(f.a, 1e-3)); }

// One set of grooves at phase f (one per unit) and width w (0..1 of a spacing). Returns how much
// of the pixel is cut (0..1); side comes back signed across the groove (which wall) and lip is
// how much of the groove's edge this pixel shows: lines finer than the pixels show only their
// tone and no lip, so a small card keeps the tone of the plate instead of turning pale.
float enCut(float f, float w, out float side, out float lip) {
  float aa = max(fwidth(f), 1e-4);
  float x = fract(f) - 0.5;
  float hw = 0.5 * w;
  side = x;
  float cut = clamp((hw - abs(x)) / aa + 0.5, 0.0, 1.0) * min(w / aa, 1.0);
  float fine = 1.0 - smoothstep(0.3, 0.55, aa);
  lip = smoothstep(0.35, 0.95, abs(x) / max(hw, 1e-3)) * smoothstep(1.5, 3.5, w / aa) * fine;
  return mix(w, cut, fine);
}

// A hairline (in card units) at signed distance d from its centre, d's slope taken on screen.
float enRule(float d, float w) {
  float px = max(length(vec2(dFdx(d), dFdy(d))), 1e-5);
  return clamp((0.5 * w - abs(d)) / px + 0.5, 0.0, 1.0) * min(w / px, 1.0);
}

// The room the polished plate mirrors, at r across the plate: one long, narrow window (with a
// faint streak of polish along it), a dimmer one beside it, and the shade between.
float enRoom(float r, float along) {
  float streak = 0.82 + 0.18 * vnoise(vec2(r * 70.0, along * 1.3));
  return 0.15 + 0.85 * exp(-pow((r + 0.2) / 0.07, 2.0)) * streak + 0.15 * exp(-pow((r + 0.2) / 0.25, 2.0))
    + 0.25 * exp(-pow((r - 0.5) / 0.18, 2.0)) + 0.4 * exp(-pow((r + 0.95) / 0.08, 2.0));
}

// What the lip of a groove running across \`across\` shows at \`side\`: the wall tilts that way at
// the burin's slope, so it mirrors another part of the room and the light at its own angle.
vec3 enWall(vec2 across, float side, vec3 h, float r, float along) {
  vec3 n = normalize(vec3(-across * sign(side) * EN_WALL, 1.0));
  float room = enRoom(r + 1.4 * dot(n.xy, EN_ROOM_DIR), along);
  float spec = pow(max(dot(n, h), 0.0), 24.0);
  return min(EN_COPPER * (0.2 + 0.9 * room + 0.6 * spec), EN_PALE);
}

/** uv is pattern uv (the lines follow the tune's size and angle); m is the face mask. */
vec3 engraving(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  vec2 q = (uv - 0.5) * uCardK;
  float art = m.r;
  float sp = 1.0 / EN_LINES;

  // The shapes that bend the lines: the picture blurred over many lines (broad) and a few (middle),
  // looked up no nearer the art window's edge than the blur reaches, so the frame never pulls on
  // the lines and they run straight into the edge.
  float lb = enLod(0.09, lod), lm = enLod(0.035, lod);
  vec2 fuv = tuneFaceUv(uv);
  vec2 inB = vec2(0.11) / uCardK, inM = vec2(0.04) / uCardK;
  vec2 ub = clamp(fuv, min(uArt.xy + inB, 0.5), max(uArt.zw - inB, 0.5));
  vec2 R = vec2(0.06) / uCardK;
  float big = (enBlur(ub + vec2(R.x, 0.0), lb) + enBlur(ub - vec2(R.x, 0.0), lb)
    + enBlur(ub + vec2(0.0, R.y), lb) + enBlur(ub - vec2(0.0, R.y), lb) + 2.0 * enBlur(ub, lb)) / 6.0;
  float mid = enBlur(clamp(fuv, min(uArt.xy + inM, 0.5), max(uArt.zw - inM, 0.5)), lm);
  float bend = big * EN_BEND_BIG + mid * EN_BEND_MID;
  // The tone the width follows, blurred over about a spacing so a width never changes faster along
  // a line than a spacing per stroke, with a little of the sharp picture for a photo's detail.
  float lt = enLod(1.3 * sp, lod);
  vec2 o = vec2(0.7 * sp) / uCardK;
  float soft = 0.25 * (enLuma(uv + o, lt) + enLuma(uv - o, lt) + enLuma(uv + vec2(o.x, -o.y), lt) + enLuma(uv + vec2(-o.x, o.y), lt));
  float tone = mix(soft, L, 0.15);
  float dark = pow(1.0 - smoothstep(0.04, 0.95, tone), 1.35);

  // The art's lines: a gentle slant bent round the picture's shapes.
  vec2 dirA = normalize(vec2(0.32, 1.0));
  vec2 perpA = vec2(-dirA.y, dirA.x);
  float fA = (dot(q, dirA) + bend) * EN_LINES;
  vec2 gA = vec2(dFdx(fA), dFdy(fA));
  // Across the line on the plate (for the lit wall), from the phase's own slope.
  mat2 J = mat2(dFdx(q), dFdy(q));
  vec2 acrossA = normalize(inverse(transpose(J)) * gA + dirA * 1e-3);
  float alongA = dot(q, perpA) * EN_LINES;
  // Width swells with the darkness; in the lights a hairline that breaks into short flicks, each
  // tapering to a point at both ends (the burin going in and lifting out).
  float id = floor(fA);
  float s = fract(alongA / 11.0 + hash12(vec2(id, 3.1)));
  float flick = pow(clamp(sin(3.14159 * min(s * 1.12, 1.0)), 0.0, 1.0), 0.6);
  float hair = EN_HAIR * mix(flick, 1.0, smoothstep(0.03, 0.14, dark));
  float wA = mix(hair, EN_FULL, smoothstep(0.08, 1.0, dark));
  float sideA, lipA;
  float cutA = enCut(fA, wA, sideA, lipA);
  // The cross set, thinner, laid over the first only in the deepest shadows and bent the same way.
  vec2 dirB = normalize(vec2(1.0, -0.42));
  float fB = (dot(q, dirB) + bend * 0.8) * EN_LINES * 0.92;
  float sideB, lipB;
  float wB = 0.3 * smoothstep(0.82, 1.0, dark);
  float cutB = enCut(fB, wB, sideB, lipB);
  // A hard silhouette is drawn once as a crisp line: where the picture, a little blurred, crosses
  // its own surroundings (a zero of the difference) and the step across it is steep.
  float e1 = enLuma(uv, enLod(2.6 * sp, lod)), e2 = enLuma(uv, enLod(8.0 * sp, lod));
  float dog = e1 - e2;
  float px = max(length(fwidth(q)), 1e-5);
  float steep = length(vec2(dFdx(e1), dFdy(e1))) / px * 3.0 * sp;
  float edge = enRule(dog / max(length(vec2(dFdx(dog), dFdy(dog))) / px, 1e-4), 0.42 * sp) * smoothstep(0.12, 0.24, steep);
  float cutArt = max(max(cutA, cutB), edge);

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

  // The light: where the plate mirrors it (h, the half vector between the light and the eye).
  vec2 dl = (uLight - fuv) * uCardK;
  vec3 h = normalize(vec3(dl * 0.6 + t * 0.75, 1.0));

  // Polished copper mirroring the room, its window strip sliding across with the tilt; its
  // brightest is pale gold, never white.
  float r = dot(q, EN_ROOM_DIR) + t.x * 0.6 - t.y * 0.35;
  float alongR = dot(q, vec2(-EN_ROOM_DIR.y, EN_ROOM_DIR.x));
  float body = 0.5 + 0.6 * enRoom(r, alongR) - 0.06 * q.y;
  vec3 plate = mix(EN_COPPER * body, EN_PALE * min(body, 1.0), smoothstep(0.75, 1.05, body) * 0.5);
  plate = min(plate, EN_PALE);
  // A faint wash of the picture's own colour, like a hand-tinted print.
  vec3 wash = face(uv, enLod(2.0 * sp, lod)).rgb;
  vec3 hue = wash / max(max(wash.r, max(wash.g, wash.b)), 0.05);
  plate *= mix(vec3(1.0), hue, 0.2 * art);

  // The grooves: ink and oxide, a hint of the picture's colour in the art.
  vec3 ink = mix(EN_INK, wash * 0.14, 0.2 * art);
  float cut = mix(max(frameCut, solid), cutArt, art);
  vec3 col = mix(plate, ink, cut);

  // The lips of the art's strokes catch the light together: a sheen along the lines, never white.
  float lipArt = art * lipA * cutA * (1.0 - cutB) * (1.0 - edge);
  col = mix(col, enWall(acrossA, sideA, h, r, alongR), 0.7 * lipArt);
  return col;
}
`;
