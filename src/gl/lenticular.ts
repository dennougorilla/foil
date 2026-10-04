// Lenticular: the picture under a sheet of fine vertical lenses, like a 3D lenticular print. The
// depth comes from the Shadowbox depth reader (uLayers.a, 1 = near), so the subject floats in
// front of the card and the background sinks behind it. Each lens shows one of a few views,
// picked by the sideways tilt; past the last view they flip back to the first. Spliced into
// CARD_FS after SHADOWBOX_GLSL, whose art window, layers and untune it shares.

export const LENTICULAR_GLSL = /* glsl */ `
// Views printed under each lens, and how far the views of the nearest and farthest points part
// (card uv) from one end of the views to the other.
const float LN_VIEWS = 9.0;
const float LN_PARALLAX = 0.11;
// The depth that stays on the card's surface: nearer comes out, farther sinks.
const float LN_FOCUS = 0.42;

float lnDepth(vec2 su) { return textureLod(uLayers, (su - SB_ART.xy) / (SB_ART.zw - SB_ART.xy), 0.6).a; }

// Where the art for card point x is found in view v (-1..1): march from the front of the depth
// back until the ray meets the surface, so near things cover far ones.
vec2 lnFind(vec2 at, float v, float span) {
  const int N = 20;
  float hPrev = 1.0;
  for (int i = 0; i <= N; i++) {
    float h = 1.0 - float(i) / float(N);
    if (lnDepth(vec2(at.x + v * span * (LN_FOCUS - h), at.y)) >= h) {
      if (i == 0) return vec2(at.x + v * span * (LN_FOCUS - h), at.y);
      // Narrow the crossing down between the last step in front and this one.
      float lo = h, hi = hPrev;
      for (int j = 0; j < 4; j++) {
        float mid = 0.5 * (lo + hi);
        if (lnDepth(vec2(at.x + v * span * (LN_FOCUS - mid), at.y)) >= mid) lo = mid;
        else hi = mid;
      }
      return vec2(at.x + v * span * (LN_FOCUS - lo), at.y);
    }
    hPrev = h;
  }
  return vec2(at.x + v * span * LN_FOCUS, at.y);
}

vec2 lnSeen(vec2 at, float v, float span) { return clamp(lnFind(at, v, span), SB_ART.xy, SB_ART.zw); }

vec3 lenticular(vec3 c, vec2 puv, vec2 t, float lod) {
  // The lenses run down the card itself, not along the tuned pattern grid; only their pitch is tuned.
  vec2 uv = tuneUnpattern(puv);
  vec3 m = texture(uMask, uv).rgb;
  float amt = uIntensity * mix(0.7, 1.0, m.r) * (1.0 - m.b);
  if (amt < 1e-3) return c;

  // Thumbnails in the hand get coarser lenses, so the ridges still show at that size.
  float lenses = (uPlate > 0.5 ? 84.0 : 30.0) / uTScale;
  float x = uv.x * lenses;
  float lf = fract(x);
  float uc = (floor(x) + 0.5) / lenses;
  // Lens pitch on screen, in pixels: the ridges fade out where they would only alias.
  float pitch = 1.0 / max(fwidth(x), 1e-4);
  float crisp = smoothstep(1.8, 3.6, pitch);

  // The view each lens shows: the sideways tilt, plus the angle to the eye across the card.
  float a = 0.5 + t.x * 0.42 + (uc - 0.5) * 0.14;
  float sw = fract(a);
  float vi = floor(sw * LN_VIEWS);
  float vf = fract(sw * LN_VIEWS);
  float v = ((vi + 0.5) / LN_VIEWS - 0.5) * 2.0;

  // The art seen through the lenses, and what the blend and tune that follow must hand back.
  vec3 img = c;
  vec3 lifted = vec3(0.0);
  if (m.r > 0.5) {
    // The print is held at the window's edges, so a tilt never pulls the frame into the art.
    float hold = smoothstep(0.0, 0.07, min(uv.x - SB_ART.x, SB_ART.z - uv.x));
    float span = LN_PARALLAX * min(uIntensity, 1.5) * uLayerRise * hold;
    // A lens magnifies one strip of the print, so the art is drawn in fine vertical strips.
    vec2 at = vec2(mix(uv.x, uc, 0.55 * crisp), uv.y);
    vec2 seen = lnSeen(at, v, span);
    img = textureLod(uFace, seen, lod).rgb;
    // Light leaks between neighbouring views, so a lens on the edge of a view shows both.
    float leak = 0.5 * (1.0 - smoothstep(0.0, 0.14, min(vf, 1.0 - vf)));
    if (leak > 0.0) {
      float vn = v + (vf < 0.5 ? -2.0 : 2.0) / LN_VIEWS;
      img = mix(img, textureLod(uFace, lnSeen(at, vn, span), lod).rgb, leak);
    }
    // Past the last view the print flips back to the first: a faint double image near the jump.
    float wrap = min(sw, 1.0 - sw) * LN_VIEWS;
    float ghost = 1.0 - smoothstep(0.0, 0.45, wrap);
    if (ghost > 0.0) {
      img = mix(img, textureLod(uFace, lnSeen(at, -v, span), lod).rgb, ghost * 0.4);
    }
    // Depth cues on the flat print: the far scene a little softer and dimmer, and the near one
    // casting a soft shadow back onto it, away from the light.
    float near = lnDepth(seen);
    vec2 away = normalize(uv - uLight + 1e-4) * vec2(1.0, 0.7);
    float caster = lnDepth(clamp(seen - away * 0.022 * uLayerRise, SB_ART.xy, SB_ART.zw));
    float shade = smoothstep(0.2, 0.45, caster - near) * 0.32 * uLayerRise;
    float sink = (1.0 - near) * uLayerRise;
    img = mix(img, textureLod(uFace, seen, lod + 2.0).rgb, sink * 0.25);
    img *= (1.0 - shade) * (1.0 - 0.14 * sink) * (1.0 + 0.06 * (near - LN_FOCUS));
    // The picture is handed over unblended: undo the blend and the tune that follow.
    lifted = sbUntune(img - c) / amt;
  }

  // The lens sheet, over the whole card. Each ridge is a little cylinder: a thin line of light
  // where it faces the light, a dark seam in the valley between two lenses.
  float nx = (lf - 0.5) * 2.0;
  float target = clamp((uLight.x - uv.x) * 1.6 - t.x * 0.35, -0.85, 0.85);
  float ridge = exp(-pow((nx - target) / 0.2, 2.0));
  // The valley stays a hairline however large the card is drawn.
  float seam = 1.0 - smoothstep(0.0, clamp(1.4 / pitch, 0.05, 0.16), min(lf, 1.0 - lf));
  // Ribbed plastic stretches a light into a tall band across many ridges.
  vec2 dl = uv - uLight;
  float band = exp(-dl.x * dl.x * 14.0) * (0.55 + 0.45 * exp(-dl.y * dl.y * 2.5));
  // Between two views the print goes dim, so soft bands of shade sweep across as it tilts.
  float edge = 1.0 - smoothstep(0.0, 0.22, min(vf, 1.0 - vf));
  vec3 sheet = c + lifted - img * (0.22 * seam + 0.14 * edge) * crisp;
  sheet += uTLight * ridge * (0.05 + 0.55 * band) * crisp;
  // A faint rainbow at the lens edges, from the plastic splitting the light.
  vec3 fringe = 0.5 + 0.5 * cos(6.2831 * (nx * 0.5 + uv.y * 0.6 + t.x * 0.3 + vec3(0.0, 0.33, 0.67)));
  sheet += fringe * band * smoothstep(0.55, 0.95, abs(nx)) * 0.06 * crisp;
  return sheet;
}
`;
