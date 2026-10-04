// 3D Lenticular: the picture under a sheet of fine vertical lenses, like a 3D lenticular print. The
// depth comes from the Shadowbox depth reader (uLayers.a, 1 = near), so the subject floats in
// front of the card and the background sinks behind it. Each lens shows one of a few views,
// picked by the sideways tilt; past the last view they flip back to the first. Spliced into
// CARD_FS after SHADOWBOX_GLSL, whose art window, layers and untune it shares.

export const LENTICULAR3D_GLSL = /* glsl */ `
// Views printed under each lens, and how far the views of the nearest and farthest points part
// (card uv) from one end of the views to the other.
const float L3D_VIEWS = 9.0;
const float L3D_PARALLAX = 0.17;
// The depth that stays on the card's surface: nearer comes out, farther sinks.
const float L3D_FOCUS = 0.42;

vec2 l3dWin(vec2 su) { return (su - SB_ART.xy) / (SB_ART.zw - SB_ART.xy); }
// Depth of the whole picture, or of the back plate (the cut-out subjects painted out).
float l3dDepth(vec2 su, bool back) { return back ? textureLod(uPlateBack, l3dWin(su), 0.6).a : textureLod(uLayers, l3dWin(su), 0.6).a; }
// 1 on the subjects the depth reader cut out (any of its sheets in front of the back one).
float l3dCut(vec2 su) {
  vec4 l = textureLod(uLayers, l3dWin(su), 0.0);
  return uLayerCuts > 0.5 ? smoothstep(0.35, 0.65, max(l.r, max(l.g, l.b))) : 0.0;
}

// Where the art for a card point is found in view v (-1..1): march from the front of the
// depth back until the ray meets the surface, so near things cover far ones.
vec2 l3dFind(vec2 at, float v, float span, bool back) {
  const int N = 20;
  float hPrev = 1.0;
  for (int i = 0; i <= N; i++) {
    float h = 1.0 - float(i) / float(N);
    if (l3dDepth(vec2(at.x + v * span * (L3D_FOCUS - h), at.y), back) >= h) {
      if (i == 0) return vec2(at.x + v * span * (L3D_FOCUS - h), at.y);
      // Narrow the crossing down between the last step in front and this one.
      float lo = h, hi = hPrev;
      for (int j = 0; j < 4; j++) {
        float mid = 0.5 * (lo + hi);
        if (l3dDepth(vec2(at.x + v * span * (L3D_FOCUS - mid), at.y), back) >= mid) lo = mid;
        else hi = mid;
      }
      return vec2(at.x + v * span * (L3D_FOCUS - lo), at.y);
    }
    hPrev = h;
  }
  return vec2(at.x + v * span * L3D_FOCUS, at.y);
}

vec2 l3dSeen(vec2 at, float v, float span, bool back) { return clamp(l3dFind(at, v, span, back), SB_ART.xy, SB_ART.zw); }

// What one view shows at a card point: a cut-out subject where the ray meets one, otherwise the back
// plate at its own depth, so a tilt uncovers background instead of smearing the subject's edge.
// near: the depth seen.
vec3 l3dView(vec2 at, float v, float span, float lod, out float near) {
  vec2 s = l3dSeen(at, v, span, false);
  float cut = l3dCut(s);
  near = l3dDepth(s, false);
  vec3 col = textureLod(uFace, s, lod).rgb;
  if (cut > 0.99) return col;
  vec2 b = l3dSeen(at, v, span, true);
  vec3 back = mix(textureLod(uFace, b, lod).rgb, textureLod(uPlateBack, l3dWin(b), lod).rgb, uPlateMix);
  near = mix(l3dDepth(b, true), near, cut);
  return mix(back, col, cut);
}

vec3 lenticular3d(vec3 c, vec2 puv, vec2 t, float lod) {
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
  float vi = floor(sw * L3D_VIEWS);
  float vf = fract(sw * L3D_VIEWS);
  float v = ((vi + 0.5) / L3D_VIEWS - 0.5) * 2.0;

  // The art seen through the lenses, and what the blend and tune that follow must hand back.
  vec3 img = c;
  vec3 lifted = vec3(0.0);
  if (m.r > 0.5) {
    // The print is held at the window's edges (and its rounded corners), so a tilt never pulls
    // the frame into the art.
    float hold = smoothstep(0.0, 0.12, min(uv.x - SB_ART.x, SB_ART.z - uv.x)) * smoothstep(0.0, 0.04, min(uv.y - SB_ART.y, SB_ART.w - uv.y));
    float span = L3D_PARALLAX * min(uIntensity, 1.5) * uLayerRise * hold;
    // A lens magnifies one strip of the print, so the art is drawn in fine vertical strips.
    vec2 at = vec2(mix(uv.x, uc, 0.55 * crisp), uv.y);
    float near, n2;
    img = l3dView(at, v, span, lod, near);
    // Light leaks between neighbouring views, so a lens on the edge of a view shows both.
    float leak = 0.5 * (1.0 - smoothstep(0.0, 0.14, min(vf, 1.0 - vf)));
    if (leak > 0.0) img = mix(img, l3dView(at, v + (vf < 0.5 ? -2.0 : 2.0) / L3D_VIEWS, span, lod, n2), leak);
    // Past the last view the print flips back to the first: a faint double image near the jump.
    float ghost = 1.0 - smoothstep(0.0, 0.45, min(sw, 1.0 - sw) * L3D_VIEWS);
    if (ghost > 0.0) img = mix(img, l3dView(at, -v, span, lod, n2), ghost * 0.4);
    // The far scene sinks a little into shade.
    img *= 1.0 - 0.12 * (1.0 - near) * uLayerRise;
    // The picture is handed over unblended: undo the blend and the tune that follow.
    lifted = sbUntune(img - c) / amt;
  }

  // The lens sheet, over the art window. Each ridge is a little cylinder: a narrow glint where it
  // faces the light, shading off to either side, and a hairline valley between two lenses. The
  // hand's thumbnails get it softer, so it never turns into a screen door.
  float relief = crisp * smoothstep(0.3, 0.7, m.r) * (uPlate > 0.5 ? 1.0 : 0.45);
  float nx = (lf - 0.5) * 2.0;
  float target = clamp((uLight.x - uv.x) * 1.6 - t.x * 0.35, -0.85, 0.85);
  float ridge = exp(-pow((nx - target) / 0.13, 2.0));
  float side = smoothstep(0.25, 1.5, abs(nx - target));
  float seam = 1.0 - smoothstep(0.0, clamp(1.4 / pitch, 0.05, 0.16), min(lf, 1.0 - lf));
  // Ribbed plastic stretches a light into a tall band across many ridges.
  vec2 dl = uv - uLight;
  float band = exp(-dl.x * dl.x * 14.0) * (0.55 + 0.45 * exp(-dl.y * dl.y * 2.5));
  // Between two views the print goes dim, so soft bands of shade sweep across as it tilts.
  float edge = 1.0 - smoothstep(0.0, 0.22, min(vf, 1.0 - vf));
  vec3 sheet = c + lifted - img * (0.1 * seam + 0.06 * side + 0.1 * edge) * relief;
  sheet += uTLight * ridge * (0.07 + 0.16 * band) * relief;
  // A faint rainbow at the lens edges, from the plastic splitting the light.
  vec3 fringe = 0.5 + 0.5 * cos(6.2831 * (nx * 0.5 + uv.y * 0.6 + t.x * 0.3 + vec3(0.0, 0.33, 0.67)));
  sheet += fringe * band * smoothstep(0.55, 0.95, abs(nx)) * 0.06 * relief;
  return sheet;
}
`;
