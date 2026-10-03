// Turns the phone's orientation sensor into a card tilt: -1..1 on each screen axis, measured from
// a rest pose that slowly follows how the phone is held.

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Degrees of tilt away from the rest pose that lean the card about three quarters of the way. */
const REACH = 20;
/** Seconds for the rest pose to catch up with a new grip (about two thirds of the way). */
const SETTLE = 2.5;
/** A gap in readings this long (ms) starts over from wherever the phone is then. */
const GAP = 1000;

/** Degrees from a to b the short way round. */
const turnTo = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

export class GyroTilt {
  x = 0;
  y = 0;
  private base: [number, number] | null = null;
  private last = -Infinity;

  /** One sensor reading: beta and gamma in degrees, the screen's turn, the time in ms. */
  feed(beta: number, gamma: number, turn: number, now: number) {
    // Map the sensor onto the screen as it is held.
    const a = ((turn % 360) + 360) % 360;
    let sx = gamma;
    let sy = beta;
    if (a === 90) [sx, sy] = [beta, -gamma];
    else if (a === 270) [sx, sy] = [-beta, gamma];
    else if (a === 180) [sx, sy] = [-gamma, -beta];
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.base || dt * 1000 > GAP) this.base = [sx, sy];
    const k = 1 - Math.exp(-Math.max(0, dt) / SETTLE);
    this.base[0] += turnTo(this.base[0], sx) * k;
    this.base[1] += turnTo(this.base[1], sy) * k;
    // tanh leans in softly and never past the edge, so a big swing doesn't slam the card.
    this.x = clamp(Math.tanh(turnTo(this.base[0], sx) / REACH), -1, 1);
    this.y = clamp(Math.tanh(turnTo(this.base[1], sy) / REACH), -1, 1);
  }
}
