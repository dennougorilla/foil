// Cosmo Holo (beta): the cosmos foil of trading cards. Spliced into CARD_FS after COMMON and
// TUNE_GLSL, so hsv2rgb/screen/tuneUnpattern/uLight are in scope.
//
// A regular print of foil motifs on one square grid: circles at the grid points (two sizes
// on a checker), stars in every gap, and fine dots between them. Under the print runs one
// sheet of diffracted light: rainbow bands that cross the card on a diagonal and slide along
// it as the card tilts. The motifs are windows onto that sheet, so a band shows as a rainbow
// running through rows of circles, and off the bands the foil all but disappears. On top:
// - circles carry faint concentric grooves that spread the spectrum a little from centre to rim,
//   a glint on the rim facing the light, and twinkle in turn on a regular four-phase plan;
// - stars are cut into ten facets with straight grooves, so the facets flash one after another;
// - dots come in four groove directions on a regular plan: one family at a time twinkles.
// Nothing here reads the clock, so the finish moves only with the tilt: exports loop and
// reduced motion holds it still.

export const COSMOHOLO_GLSL = /* glsl */ `
const float CH_CELLS = 10.0; // circles across the card
const vec2 CH_ASPECT = vec2(1.0, 1.4);
const vec2 CH_DIR = vec2(0.55, 0.835); // the bands' direction of travel

// Where the bands sit at card position pos (card widths): s grows along CH_DIR, shifted by the tilt.
float chSheet(vec2 pos, vec2 t) {
  return dot(pos - uLight * CH_ASPECT * 0.5, CH_DIR) + dot(t, CH_DIR) * 0.8;
}

// How bright the sheet is at s: a band about every card width, near black between them.
float chBand(float s) {
  return pow(0.5 + 0.5 * cos(s * 6.2831853), 2.5);
}

// The sheet's colour: the spectrum runs across each band, a little further on every band.
vec3 chRainbow(float s, float shift) {
  return hsv2rgb(vec3(fract(s * 1.3 + shift), 0.72, 1.0));
}

// A grating with straight grooves across d: bright only when the light vector v lies along d.
float chFacet(vec2 d, vec2 v, float sharp) {
  float lv = length(v) + 1e-4;
  return pow(abs(dot(d, v / lv)), sharp) * smoothstep(0.03, 0.2, lv);
}

// Five-pointed star, signed distance (negative inside), pointing up the card.
float chStar(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994, -0.587785252);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.y = -p.y;
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

vec3 cosmoholo(vec3 c, vec2 uv, vec2 t, float L) {
  vec2 q = (uv - 0.5) * CH_ASPECT * CH_CELLS;
  float aa = max(fwidth(q.x), 1e-4) * 0.9; // about a screen pixel, in cells
  vec2 pos = tuneUnpattern(uv) * CH_ASPECT;
  float s = chSheet(pos, t);
  float band = chBand(s);
  // The light as seen from here, for the facets: the tilt plus the way to the highlight.
  vec2 v = t * 0.9 + (pos - uLight * CH_ASPECT) * 1.5;

  // Circles at the grid points, the smaller one on every other point.
  vec2 gc = floor(q + 0.5);
  vec2 fc = q - gc;
  float rc = length(fc);
  float R = mod(gc.x + gc.y, 2.0) < 0.5 ? 0.3 : 0.22;
  float circle = smoothstep(aa, -aa, rc - R);
  float rings = mix(0.9 + 0.1 * cos(rc / R * 25.0), 0.95, smoothstep(0.015, 0.035, aa));
  float body = mix(0.65, 1.0, smoothstep(0.0, R, rc)) * rings;
  float rim = smoothstep(aa * 1.5, 0.0, abs(rc - R) - 0.01);
  float glint = pow(max(dot(fc / max(rc, 1e-4), -CH_DIR), 0.0), 5.0) * smoothstep(R * 0.4, R, rc);
  // Within a band each circle twinkles in its own turn: four phases on a regular plan.
  float turn = (mod(gc.x, 2.0) + 2.0 * mod(gc.y, 2.0)) * 1.5708;
  float twinkle = 0.7 + 0.3 * pow(0.5 + 0.5 * cos(length(v) * 9.0 + turn), 2.0);
  // The concentric grooves split the light into rings of spectrum, centre to rim.
  vec3 film = chRainbow(s, rc / R * 0.18) * (circle * body + rim * 0.7) * (0.02 + band * twinkle);
  film += vec3(1.0) * glint * circle * band * twinkle * 0.45;

  // A star in every gap between four circles.
  vec2 fg = q - floor(q) - 0.5;
  float ds = chStar(fg, 0.24, 0.45);
  float star = smoothstep(aa * 1.2, -aa * 1.2, ds);
  // Ten facets, two to an arm; each facet's grooves run across its own bisector.
  float facet = (floor(atan(fg.x, -fg.y) / 0.6283185 + 5.0) + 0.5) * 0.6283185 - 3.1415927;
  float flash = chFacet(vec2(sin(facet), -cos(facet)), v, 6.0);
  // Each facet catches the spectrum a step further on, so a flashing star shows its own rainbow.
  film += chRainbow(s, 0.1 + facet * 0.04) * star * (0.02 + band * 0.6 + flash * (0.3 + 0.7 * band));

  // Fine dots between the motifs, four to a cell, fading out when they shrink below a pixel.
  vec2 qd = q * 4.0;
  vec2 id = floor(qd);
  vec2 fd = qd - id - 0.5;
  float clear = smoothstep(R + 0.04, R + 0.09, rc) * smoothstep(0.03, 0.08, ds);
  float dots = smoothstep(aa * 4.0, -aa * 4.0, length(fd) - 0.16) * clear * smoothstep(0.12, 0.05, aa);
  float dir = mod(id.x + 2.0 * id.y, 4.0) * 0.7853982;
  film += chRainbow(s, 0.05) * dots * (0.02 + band * (0.3 + 1.2 * chFacet(vec2(cos(dir), sin(dir)), v, 12.0)));

  // Over the brightest parts of the art the foil gives way, so the picture keeps its light.
  film *= mix(1.0, 0.5, smoothstep(0.6, 0.95, L));
  // Off the bands the foil all but disappears and the art shows through untouched.
  return screen(c, film);
}
`;
