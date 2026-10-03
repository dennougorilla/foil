// Live light and idle motion for the stage. Pure bookkeeping: the stage asks for numbers each
// frame and keeps doing all of the drawing itself.
import { fixedLight, TUNE_DEFAULTS, type Tune } from './model';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

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

export type GyroResult = 'ok' | 'denied' | 'unsupported';

/** Phones and tablets with a motion sensor can steer the light by tilting the device. */
export const gyroAvailable = () =>
  typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;

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
  private gyro = { listening: false, x: 0, y: 0, sx: 0, sy: 0, base: null as null | [number, number], last: 0 };

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
    const k = 1 - Math.exp(-dt * 10);
    this.gyro.sx += (this.gyro.x - this.gyro.sx) * k;
    this.gyro.sy += (this.gyro.y - this.gyro.sy) * k;
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

  /** Device tilt as -1..1 on each axis while the gyro light is on and reporting. */
  gyroInput(t: Tune): [number, number] | null {
    if (t.light !== 'gyro' || performance.now() - this.gyro.last > 600) return null;
    return [this.gyro.sx, this.gyro.sy];
  }

  async enableGyro(): Promise<GyroResult> {
    if (!gyroAvailable()) return 'unsupported';
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      // iOS only grants this from a tap, which is where the panel calls us from.
      const r = await DOE.requestPermission().catch(() => 'denied');
      if (r !== 'granted') return 'denied';
    }
    if (!this.gyro.listening) {
      this.gyro.listening = true;
      window.addEventListener('deviceorientation', this.onOrient);
    }
    this.gyro.base = null;
    return 'ok';
  }

  /** Stops listening to the sensor once another light source is chosen. */
  disableGyro() {
    if (!this.gyro.listening) return;
    this.gyro.listening = false;
    window.removeEventListener('deviceorientation', this.onOrient);
    this.gyro.base = null;
    this.gyro.last = 0;
  }

  /** True once the sensor has sent anything since it was enabled. */
  gyroLive = () => performance.now() - this.gyro.last < 1000;

  private onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    // Map the sensor onto the screen as it is held.
    const turn = (screen.orientation?.angle ?? 0) % 360;
    let x = e.gamma;
    let y = e.beta;
    if (turn === 90) [x, y] = [e.beta, -e.gamma];
    else if (turn === 270 || turn === -90) [x, y] = [-e.beta, e.gamma];
    else if (turn === 180 || turn === -180) [x, y] = [-e.gamma, -e.beta];
    const g = this.gyro;
    if (!g.base) g.base = [x, y];
    // The rest pose slowly follows how the phone is held, so any grip feels centred.
    g.base[0] += (x - g.base[0]) * 0.01;
    g.base[1] += (y - g.base[1]) * 0.01;
    g.x = clamp((x - g.base[0]) / 22, -1, 1);
    g.y = clamp((y - g.base[1]) / 22, -1, 1);
    g.last = performance.now();
  };
}

export const motion = new LiveMotion();
