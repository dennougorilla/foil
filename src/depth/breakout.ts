// How far the Breakout finish's subject comes out of the card. No imports, so Node's test runner
// can load it.

/**
 * `scale`: how much the cut-out subject is enlarged about the foot of the art window (0 = not at
 * all), so its top breaks through the frame. `lift`: how far its top floats off the card towards
 * the viewer, in card heights (it is hinged at the foot), so a tilt slides it against the frame. Both grow as the card tilts and
 * follow the cut standing up (`rise`) and the finish's strength.
 */
export function breakoutPose(tilt: [number, number], rise: number, intensity: number): { scale: number; lift: number } {
  const lean = Math.min(1, Math.hypot(tilt[0], tilt[1]));
  const k = Math.max(0, rise) * Math.min(1, Math.max(0, intensity));
  return { scale: k * (0.13 + 0.1 * lean), lift: k * (0.12 + 0.1 * lean) };
}
