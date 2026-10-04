// Live light and idle motion for the stage. Pure bookkeeping: the stage asks for numbers each
// frame and keeps doing all of the drawing itself.
import { fixedLight, TUNE_DEFAULTS, type Tune } from './model';
import { GyroTilt } from './gyro';

const TAU = Math.PI * 2;

export interface IdlePose {
  fy: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  /** Turntable angle of the spin idle, added on top of everything else. */
  spin: number;
  /** Extra sheen travel, in the same -1..1 units as the shader's tilt. */
  sheen: [number, number];
}

/** Phones and tablets with a motion sensor tilt the card as the device tilts. */
const gyroAvailable = () => 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;

class LiveMotion {
  /** While held, the stage shows the untouched defaults for a before/after comparison. */
  comparing = false;
  /** The tune the stage should draw right now. */
  view = (t: Tune): Tune => (this.comparing ? TUNE_DEFAULTS : t);
  /** Clock for the finishes' own animation (shader time). Stops under reduced motion. */
  fx = 0;
  private idleT = 0;
  private orbit = 0;
  private spin = 0;
  /** Current turntable angle of the spin idle (0 when not spinning). */
  get spinAngle() {
    return this.spin;
  }
  private gyro = { tilt: new GyroTilt(), asked: false, sx: 0, sy: 0, last: 0 };

  step(dt: number, t: Tune, still: boolean, holding: boolean) {
    if (!still) {
      this.fx += dt * t.speed;
      this.idleT += dt * t.speed;
      if (t.light === 'orbit') this.orbit += dt * t.speed * 0.9;
    }
    if (t.idle === 'spin' && !still && !holding) {
      this.spin += dt * t.speed * 0.75;
    } else {
      // Let go of a spin by easing forward to the next time the face looks straight on.
      const target = Math.ceil(this.spin / TAU - 0.02) * TAU;
      this.spin += (target - this.spin) * (1 - Math.exp(-dt * 5));
      if (Math.abs(target - this.spin) < 1e-3) this.spin = 0;
    }
    const k = 1 - Math.exp(-dt * 14);
    this.gyro.sx += (this.gyro.tilt.x - this.gyro.sx) * k;
    this.gyro.sy += (this.gyro.tilt.y - this.gyro.sy) * k;
  }

  /** Automatic motion on top of the springs. `on` is false while dragging or with reduced motion. */
  idle(t: Tune, on: boolean): IdlePose {
    const pose: IdlePose = { fy: 0, rx: 0, ry: 0, rz: 0, scale: 1, spin: this.spin, sheen: [Math.sin(this.spin) * 0.6, 0] };
    if (!on) return pose;
    const s = this.idleT;
    if (t.idle === 'sway') {
      pose.fy = Math.sin(s * 1.3) * 6;
      pose.rz = Math.sin(s * 0.9) * 0.022;
      pose.rx = Math.sin(s * 0.7 + 1) * 0.05;
      pose.ry = Math.cos(s * 0.6) * 0.07;
      pose.sheen = [Math.sin(s * 0.45) * 0.3, Math.cos(s * 0.38) * 0.3];
    } else if (t.idle === 'breathe') {
      const b = Math.sin(s * 1.15);
      pose.scale = 1 + b * 0.035;
      pose.fy = -b * 6;
      pose.rx = b * 0.03;
      pose.sheen = [Math.sin(s * 0.4) * 0.15, b * 0.4];
    }
    return pose;
  }

  /** The tilt limit as a multiplier on the stage's built-in tilt. */
  tiltScale = (t: Tune) => t.tiltMax / TUNE_DEFAULTS.tiltMax;

  /** Light position in card uv. `follow` is where the pointer or tilt would put it. */
  light(t: Tune, follow: [number, number]): [number, number] {
    if (t.light === 'orbit') return [0.5 + Math.cos(this.orbit) * 0.34, 0.5 + Math.sin(this.orbit) * 0.36];
    if (t.light === 'fixed') return fixedLight(t.lightAngle);
    return follow;
  }

  /** Sheen added by an orbiting light, so the pattern travels with it. */
  orbitSheen(t: Tune): [number, number] {
    return t.light === 'orbit' ? [Math.cos(this.orbit) * 0.6, Math.sin(this.orbit) * 0.6] : [0, 0];
  }

  /** Device tilt as -1..1 on each axis while the sensor is reporting. */
  gyroInput(): [number, number] | null {
    if (performance.now() - this.gyro.last > 600) return null;
    return [this.gyro.sx, this.gyro.sy];
  }

  /**
   * Starts following the device's tilt. Where the sensor takes a permission (iOS), it is asked
   * for only from a tap on the card or the hand (a card or a step), once per visit. Under reduced
   * motion the sensor is left alone: no prompt, and no listener while it is on.
   */
  armGyro(stage: HTMLElement, reduced: MediaQueryList) {
    if (!gyroAvailable()) return;
    let allowed = false;
    const sync = () => {
      if (allowed && !reduced.matches) window.addEventListener('deviceorientation', this.orient);
      else window.removeEventListener('deviceorientation', this.orient);
    };
    reduced.addEventListener('change', sync);
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission !== 'function') {
      allowed = true;
      return sync();
    }
    const ask = (e: Event) => {
      if (!(e.target as Element).closest('#cardSlot, .hand-slot, .hand-step') || this.gyro.asked || reduced.matches) return;
      this.gyro.asked = true;
      stage.removeEventListener('click', ask);
      // Called straight from the tap, which iOS needs to show its prompt.
      void DOE.requestPermission!().then((r) => {
        allowed = r === 'granted';
        sync();
      }, () => {});
    };
    stage.addEventListener('click', ask);
  }

  private orient = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    const now = performance.now();
    this.gyro.tilt.feed(e.beta, e.gamma, screen.orientation?.angle ?? 0, now);
    this.gyro.last = now;
  };
}

export const motion = new LiveMotion();
