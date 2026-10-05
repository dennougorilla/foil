// Live light and motion for the stage. Pure bookkeeping: the stage asks for numbers each frame and
// keeps doing all of the drawing itself. The motion itself is `idlePose` in model.ts, shared with
// the exported loops, so a GIF moves exactly as the card does here.
import { hasMove, IdleClock, loadMoves, TUNE_DEFAULTS, type Tune } from './model';
import { GyroTilt } from './gyro';

/** Phones and tablets with a motion sensor tilt the card as the device tilts. */
const gyroAvailable = () => 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;

export class LiveMotion extends IdleClock {
  /** While held, the stage shows the untouched defaults for a before/after comparison. */
  comparing = false;
  /** The tune the stage should draw right now. */
  view = (t: Tune): Tune => (this.comparing ? TUNE_DEFAULTS : t);
  /**
   * Clock for the finishes' own animation (shader time): the motion's own, so the stage left alone
   * shows the file's frame. Stops under reduced motion.
   */
  get fx() {
    return this.idleTime;
  }
  /** The stage's flip to a new picture (radians, 0 when not flipping); set by the stage each frame. */
  flip = 0;
  private gyro = { tilt: new GyroTilt(), asked: false, sx: 0, sy: 0, last: 0 };

  step(dt: number, t: Tune, still: boolean, facing: boolean, held = false) {
    // A motion other than Sway is fetched the first time it is wanted; the card rests until it arrives.
    if (!hasMove(t.idle)) void loadMoves().catch(() => {});
    super.step(dt, t, still, facing, held);
    const k = 1 - Math.exp(-dt * 14);
    this.gyro.sx += (this.gyro.tilt.x - this.gyro.sx) * k;
    this.gyro.sy += (this.gyro.tilt.y - this.gyro.sy) * k;
  }

  /** The tilt limit as a multiplier on the stage's built-in tilt. */
  tiltScale = (t: Tune) => t.tiltMax / TUNE_DEFAULTS.tiltMax;

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
