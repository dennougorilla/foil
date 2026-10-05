// Engraving: the picture cut into a copper plate as a line engraving, like the portrait on an old
// banknote or stamp. Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/face/luma
// and the tune helpers are in scope. Every name here starts with `en`/`EN_`.
//
// The art is one set of parallel lines whose width follows the picture's darkness (thin to bare
// metal in the lights, swelling in the shadows), bent a little by the picture's broad shapes so
// they wrap round its forms, with a second set crossing them in the deepest shadows. The frame
// is cut in interlaced guilloche waves. Bare copper is a polished plate that mirrors a soft
// room; each groove is a V with two walls that catch the light at their own angle, so tilting
// makes runs of lines flash, a stretch at a time.
// Nothing reads the clock: it moves only with the tilt and the light, so it holds still when
// motion is reduced and every export loop closes by itself.

export const ENGRAVING_GLSL = /* glsl */ `
// Lines per short side of the card: the art's lines, and the frame's guilloche.
const float EN_LINES = 74.0;
const float EN_GUILLOCHE = 88.0;
// How many line spacings the picture's broad shapes bend the lines by.
const float EN_BEND = 3.5;
const vec3 EN_DEEP = vec3(0.16, 0.065, 0.035);
const vec3 EN_MID = vec3(0.74, 0.40, 0.21);
const vec3 EN_HI = vec3(1.0, 0.86, 0.66);
const vec3 EN_INK = vec3(0.075, 0.04, 0.03);

// One set of grooves at phase f (one per unit) and width w (0..1 of a spacing). Returns how much
// of the pixel is cut (0..1); side comes back signed across the groove (which wall) and edge is
// how much of a wall this pixel shows: a groove wide on screen catches light only along its
// walls, a thin one (whose walls share its pixels) at half strength, and lines finer than the
// pixels show only their tone.
float enCut(float f, float w, out float side, out float edge) {
  float aa = max(fwidth(f), 1e-4);
  float x = fract(f) - 0.5;
  float hw = 0.5 * w;
  side = x;
  // The groove's share of the pixel (box-filtered), so a hairline fades instead of breaking up.
  float cut = clamp((hw - abs(x)) / aa + 0.5, 0.0, 1.0) * min(w / aa, 1.0);
  float fine = 1.0 - smoothstep(0.32, 0.6, aa);
  edge = mix(0.45, smoothstep(0.35, 0.85, abs(x) / max(hw, 1e-3)), smoothstep(1.5, 4.0, w / aa)) * fine;
  return mix(w, cut, fine);
}

// The room the polished plate mirrors: two broad windows of light, at r along the plate.
float enRoom(float r) { return exp(-pow((r + 0.18) / 0.16, 2.0)) * 0.55 + exp(-pow((r - 0.45) / 0.22, 2.0)) * 0.35; }
const vec2 EN_ROOM_DIR = vec2(0.85, 0.5);

// How brightly a groove wall at \`side\` of a groove running across \`across\` mirrors the light,
// seen along h (the half vector, card units with z up). The burin never cuts quite evenly, so
// each wall's slope wanders along the groove (\`seed\`: which groove, \`along\`: where on it), and a
// tilt lights it a stretch at a time instead of all at once. A wall mirrors the light (h, the
// half vector) and the room (r, where the flat plate here sees it), seen off at its own slope.
float enWall(vec2 across, float side, float edge, vec3 h, float r, float seed, float along) {
  float slope = 0.08 + 0.5 * vnoise(vec2(seed * 0.73 + step(0.0, side) * 17.0, along * 4.0 + seed * 3.1));
  vec3 n = normalize(vec3(-across * sign(side) * slope, 1.0));
  float k = max(dot(n, h), 0.0);
  float room = enRoom(r + 2.2 * dot(n.xy, EN_ROOM_DIR));
  return (1.6 * pow(k, 60.0) + 0.4 * pow(k, 12.0) + 1.4 * room * room) * edge;
}

/** uv is pattern uv (the lines follow the tune's size and angle); m is the face mask. */
vec3 engraving(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  vec2 q = (uv - 0.5) * uCardK;
  float art = m.r;
  // The picture's broad shapes (they bend the lines) and its tone (it sets their width).
  const float E = 0.015;
  float b0 = luma(face(uv, lod + 5.0).rgb);
  vec2 grad = vec2(luma(face(uv + vec2(E, 0.0), lod + 5.0).rgb) - b0, luma(face(uv + vec2(0.0, E), lod + 5.0).rgb) - b0) / (E * uCardK);
  float tone = mix(L, luma(face(uv, lod + 1.0).rgb), 0.5);
  float dark = 1.0 - smoothstep(0.02, 0.9, tone);

  // The art: lines at a slight slant that wander a little and wrap round the picture's forms.
  vec2 dirA = normalize(vec2(0.3, 1.0));
  float wander = (vnoise(q * 2.2 + 3.7) - 0.5) * 1.4;
  float fA = dot(q, dirA) * EN_LINES + b0 * EN_BEND + wander;
  vec2 acrossA = normalize(dirA * EN_LINES + grad * EN_BEND);
  float alongA = dot(q, vec2(-dirA.y, dirA.x));
  float sideA, edgeA;
  // A thin line of bare metal always parts the cuts, as on a real plate.
  float wA = 0.05 + 0.66 * dark;
  float cutA = enCut(fA, wA, sideA, edgeA);
  // Cross-hatching, thin, only in the deepest shadows.
  vec2 dirB = normalize(vec2(0.84, 0.55));
  float fB = dot(q, dirB) * EN_LINES + b0 * EN_BEND * 0.5;
  float sideB, edgeB;
  float wB = smoothstep(0.66, 1.0, dark) * 0.32;
  float cutB = enCut(fB, wB, sideB, edgeB);

  // The frame: two interlaced families of waves, like the border of a banknote.
  float ph = q.x * 19.0 + q.y * 3.0;
  float wave1 = q.y * EN_GUILLOCHE + sin(ph) * 3.0;
  float wave2 = q.y * EN_GUILLOCHE - sin(ph) * 3.0 + 0.5;
  vec2 across1 = normalize(vec2(cos(ph) * 19.0 * 3.0, EN_GUILLOCHE));
  vec2 across2 = normalize(vec2(-cos(ph) * 19.0 * 3.0, EN_GUILLOCHE));
  float frameDark = 1.0 - smoothstep(0.08, 0.95, L);
  float wG = clamp(0.14 + frameDark * 0.9, 0.0, 1.0);
  float side1, side2, edge1, edge2;
  float cut1 = enCut(wave1, wG * 0.55, side1, edge1);
  float cut2 = enCut(wave2, wG * 0.4, side2, edge2);
  // Dark lettering on the frame is cut solid, so the name stays crisp.
  float solid = smoothstep(0.7, 0.85, frameDark);

  // The light: where the plate mirrors it (h, the half vector between the light and the eye).
  vec2 real = tuneFaceUv(uv);
  vec2 dl = (uLight - real) * uCardK;
  vec3 h = normalize(vec3(dl * 0.6 + t * 0.75, 1.0));

  // Polished copper: a soft room in the metal (two broad windows sliding with the tilt) and the
  // light's own sheen, stronger towards the top.
  float r = dot(q, EN_ROOM_DIR) + t.x * 0.5 - t.y * 0.25;
  float room = enRoom(r);
  float sheen = exp(-dot(dl, dl) / 0.1);
  float body = clamp(0.3 + 0.55 * room + 0.45 * sheen - 0.1 * q.y, 0.0, 1.0);
  vec3 copper = body < 0.5 ? mix(EN_DEEP, EN_MID, body / 0.5) : mix(EN_MID, EN_HI, (body - 0.5) / 0.5);
  // A faint wash of the picture's own color on the plate, like a hand-tinted print.
  vec3 hue = c / max(max(c.r, max(c.g, c.b)), 0.05);
  vec3 plate = copper * mix(vec3(1.0), hue, 0.3 * art);

  // The grooves: dark oxide and ink, with walls that flash.
  vec3 ink = mix(EN_INK, c * 0.2, 0.25 * art);
  float cut = mix(max(max(cut1, cut2), solid), max(cutA, cutB), art);
  vec3 col = mix(plate, ink, cut);

  float flash = art * (enWall(acrossA, sideA, edgeA, h, r, floor(fA), alongA) * cutA + enWall(dirB, sideB, edgeB, h, r, floor(fB) + 40.0, dot(q, vec2(-dirB.y, dirB.x))) * cutB)
              + (1.0 - art) * (1.0 - solid) * (enWall(across1, side1, edge1, h, r, floor(wave1), q.x) * cut1 + enWall(across2, side2, edge2, h, r, floor(wave2) + 60.0, q.x) * cut2);
  // A glint is the bright metal of the wall: gold-white, a little warmer than the plate.
  col += vec3(1.0, 0.84, 0.6) * min(flash * 2.6, 1.4);
  return col;
}
`;
