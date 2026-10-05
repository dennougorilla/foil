// Engraving: the picture cut into a copper plate as a line engraving, like the portrait on an old
// banknote or stamp. Spliced into CARD_FS after COMMON and TUNE_GLSL, so hash/vnoise/face/luma
// and the tune helpers are in scope. Every name here starts with `en`/`EN_`.
//
// What makes the real thing read as one (and what this copies):
// - One set of evenly spaced parallel lines carries the whole picture: their spacing never
//   changes, only their width, swelling in the shadows and tapering to nothing in the lights,
//   where the bare plate shows.
// - The lines bend smoothly round the picture's forms (contour hatching) and never kink: the
//   field that bends them is the picture blurred over several line spacings.
// - A second set crosses them only in the deepest shadows, thin where it starts.
// - The frame is guilloche: hairlines of one width woven from interlaced waves, machine-even.
// - The plate is polished copper, a mirror of a dim room: dark where it faces the room's shade,
//   salmon to pale gold where it catches a window, the bright band sliding as the card tilts.
// - The grooves hold dark ink and oxide; only the lip of each V-cut catches light, and every
//   groove in a region catches it on the same side at the same time, so a tilt runs a coherent
//   copper sheen over the lines (never white, never one stray line: that reads as scratches).
// Nothing reads the clock: it moves only with the tilt and the light, so it holds still when
// motion is reduced and every export loop closes by itself.

export const ENGRAVING_GLSL = /* glsl */ `
// Lines per short side of the card: the art's lines, and the frame's guilloche.
const float EN_LINES = 92.0;
const float EN_GUILLOCHE = 120.0;
// How many line spacings the picture's broad shapes bend the lines by.
const float EN_BEND = 3.2;
// Polished copper's own colour (its reflectance), and the ink left in the grooves.
const vec3 EN_COPPER = vec3(0.96, 0.6, 0.4);
const vec3 EN_INK = vec3(0.045, 0.024, 0.018);
// The slope of a groove's walls (a burin cuts a V about this steep).
const float EN_WALL = 0.5;

// One set of grooves at phase f (one per unit) and width w (0..1 of a spacing). Returns how much
// of the pixel is cut (0..1); side comes back signed across the groove (which wall) and lip is
// how much of the groove's edge this pixel shows: lines finer than the pixels show only their
// tone and no lip, so a small card keeps the tone of the plate instead of turning pale.
float enCut(float f, float w, out float side, out float lip) {
  float aa = max(fwidth(f), 1e-4);
  float x = fract(f) - 0.5;
  float hw = 0.5 * w;
  side = x;
  // The groove's share of the pixel (box-filtered), so a hairline fades instead of breaking up.
  float cut = clamp((hw - abs(x)) / aa + 0.5, 0.0, 1.0) * min(w / aa, 1.0);
  float fine = 1.0 - smoothstep(0.3, 0.55, aa);
  lip = smoothstep(0.3, 0.9, abs(x) / max(hw, 1e-3)) * smoothstep(1.2, 3.0, w / aa) * fine;
  return mix(w, cut, fine);
}

// The dim room the polished plate mirrors, at r along the plate: a bright window, softer ones
// either side of it, and the shade between, so some band of light is on the plate at any tilt.
float enRoom(float r) {
  return 0.1 + 0.9 * exp(-pow((r + 0.2) / 0.15, 2.0)) + 0.45 * exp(-pow((r - 0.5) / 0.24, 2.0)) + 0.6 * exp(-pow((r + 0.95) / 0.18, 2.0));
}
const vec2 EN_ROOM_DIR = vec2(0.8, 0.6);

// What the lip of a groove running across \`across\` shows at \`side\`: the wall tilts that way at
// the burin's slope (its pressure wandering a little along the cut), so it mirrors another part
// of the room and the light at its own angle. All walls facing one way light up together.
vec3 enWall(vec2 across, float side, vec3 h, float r, float along) {
  float slope = EN_WALL * (0.85 + 0.3 * vnoise(vec2(along * 5.0, step(0.0, side) * 7.0)));
  vec3 n = normalize(vec3(-across * sign(side) * slope, 1.0));
  float room = enRoom(r + 1.4 * dot(n.xy, EN_ROOM_DIR));
  float spec = pow(max(dot(n, h), 0.0), 24.0);
  return EN_COPPER * (0.15 + 1.25 * room + 1.1 * spec);
}

/** uv is pattern uv (the lines follow the tune's size and angle); m is the face mask. */
vec3 engraving(vec3 c, vec2 uv, vec2 t, float L, float lod, vec3 m) {
  vec2 q = (uv - 0.5) * uCardK;
  float art = m.r;
  // The field that bends the lines: the picture blurred over several line spacings (five taps
  // far down its mips), so a hard edge in a pixel picture bends them in a smooth sweep, not a kink.
  vec2 R = vec2(0.045) / uCardK;
  float bl = luma(face(uv - vec2(R.x, 0.0), lod + 5.5).rgb);
  float br = luma(face(uv + vec2(R.x, 0.0), lod + 5.5).rgb);
  float bd = luma(face(uv - vec2(0.0, R.y), lod + 5.5).rgb);
  float bu = luma(face(uv + vec2(0.0, R.y), lod + 5.5).rgb);
  float bc = luma(face(uv, lod + 5.0).rgb);
  float b0 = (bl + br + bd + bu + 2.0 * bc) / 6.0;
  vec2 grad = vec2(br - bl, bu - bd) / (2.0 * 0.045);
  // The tone sets the lines' width: soft enough that a dithered pixel picture swells its lines
  // evenly, with a little of the sharp picture so a photo keeps its detail.
  vec2 o = vec2(0.6 / EN_LINES) / uCardK;
  float soft = 0.25 * (luma(face(uv + o, lod + 3.0).rgb) + luma(face(uv - o, lod + 3.0).rgb)
    + luma(face(uv + vec2(o.x, -o.y), lod + 3.0).rgb) + luma(face(uv + vec2(-o.x, o.y), lod + 3.0).rgb));
  float tone = mix(soft, L, 0.3);
  float dark = 1.0 - smoothstep(0.04, 0.92, tone);

  // The art: lines at a slight slant that wander a little and wrap round the picture's forms.
  vec2 dirA = normalize(vec2(0.3, 1.0));
  float wander = (vnoise(q * 2.2 + 3.7) - 0.5) * 1.2;
  float fA = dot(q, dirA) * EN_LINES + b0 * EN_BEND + wander;
  vec2 acrossA = normalize(dirA * EN_LINES + grad * EN_BEND);
  float alongA = dot(q, vec2(-dirA.y, dirA.x));
  float sideA, lipA;
  // Widths taper to nothing in the lights, where the bare plate shows.
  float wA = 0.74 * smoothstep(0.03, 1.0, dark);
  float cutA = enCut(fA, wA, sideA, lipA);
  // Cross-hatching only in the deepest shadows, thin where it starts.
  vec2 dirB = normalize(vec2(0.86, 0.5));
  float fB = dot(q, dirB) * EN_LINES * 0.9 + b0 * EN_BEND * 0.6;
  float sideB, lipB;
  float wB = smoothstep(0.86, 1.0, dark) * 0.45;
  float cutB = enCut(fB, wB, sideB, lipB);

  // The frame: guilloche, two interlaced families of waves whose swing itself swells and shrinks
  // along the frame, all in hairlines of one width, like the border of a banknote.
  float ph = q.x * 22.0 + q.y * 2.0;
  float amp = 2.2 + 1.1 * sin(q.x * 6.0 - q.y * 9.0);
  float wave1 = q.y * EN_GUILLOCHE + sin(ph) * amp;
  float wave2 = q.y * EN_GUILLOCHE - sin(ph) * amp + 0.5;
  vec2 across1 = normalize(vec2(cos(ph) * 22.0 * amp, EN_GUILLOCHE));
  vec2 across2 = normalize(vec2(-cos(ph) * 22.0 * amp, EN_GUILLOCHE));
  float frameDark = 1.0 - smoothstep(0.08, 0.95, L);
  float wG = 0.22 + 0.4 * frameDark;
  float side1, side2, lip1, lip2;
  float cut1 = enCut(wave1, wG, side1, lip1);
  float cut2 = enCut(wave2, wG * 0.8, side2, lip2);
  // Dark lettering on the frame is cut solid, so the name stays crisp.
  float solid = smoothstep(0.7, 0.85, frameDark);

  // The light: where the plate mirrors it (h, the half vector between the light and the eye).
  vec2 real = tuneFaceUv(uv);
  vec2 dl = (uLight - real) * uCardK;
  vec3 h = normalize(vec3(dl * 0.6 + t * 0.75, 1.0));

  // Polished copper mirroring the room (its bright window sliding with the tilt) and the light's
  // own sheen; metal's brightest highlights pale a little towards gold.
  float r = dot(q, EN_ROOM_DIR) + t.x * 0.6 - t.y * 0.35;
  float sheen = exp(-dot(dl, dl) / 0.08);
  float body = 0.3 + 0.85 * enRoom(r) + 0.5 * sheen - 0.08 * q.y;
  vec3 plate = EN_COPPER * body;
  plate = mix(plate, vec3(1.0, 0.86, 0.66) * body * 0.92, smoothstep(0.7, 1.25, body) * 0.55);
  // A faint wash of the picture's own colour, like a hand-tinted print (soft, so a pixel
  // picture's dither never shows through).
  vec3 wash = face(uv, lod + 3.0).rgb;
  vec3 hue = wash / max(max(wash.r, max(wash.g, wash.b)), 0.05);
  plate *= mix(vec3(1.0), hue, 0.22 * art);

  // The grooves: ink and oxide, a hint of the picture's colour in the art.
  vec3 ink = mix(EN_INK, wash * 0.16, 0.25 * art);
  float cut = mix(max(max(cut1, cut2), solid), max(cutA, cutB), art);
  vec3 col = mix(plate, ink, cut);

  // The lips of the cuts catch the light: a coherent copper sheen over the lines, never white.
  float lipArt = art * max(lipA * cutA * (1.0 - cutB), lipB * cutB);
  float lipFrame = (1.0 - art) * (1.0 - solid) * max(lip1 * cut1, lip2 * cut2);
  vec3 wallArt = cutB > cutA * 0.5 ? enWall(dirB, sideB, h, r, dot(q, vec2(-dirB.y, dirB.x))) : enWall(acrossA, sideA, h, r, alongA);
  vec3 wallFrame = cut1 >= cut2 ? enWall(across1, side1, h, r, q.x) : enWall(across2, side2, h, r, q.x);
  col = mix(col, wallArt, 0.85 * lipArt);
  col = mix(col, wallFrame, 0.85 * lipFrame);
  return col;
}
`;
