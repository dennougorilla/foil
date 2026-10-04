// Keeps slow devices smooth: watches how long the stage's frames take and, while it keeps
// missing frames, steps the on-screen drawing down. Exports never read this.

export interface QualityLevel {
  /** Multiplier on the card canvas's device pixel ratio. */
  res: number;
  /** The swirl backdrop is drawn at 1/bg of the window's size. */
  bg: number;
  /** Multiplier on the number of sparks in a burst. */
  sparks: number;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { res: 1, bg: 4, sparks: 1 },
  { res: 0.8, bg: 4, sparks: 1 },
  { res: 0.65, bg: 6, sparks: 0.5 },
  { res: 0.5, bg: 8, sparks: 0.5 },
];

/** Mean frame time (ms) above which the stage counts as stuttering: under 40 fps. */
const SLOW = 25;
/** Frame time measured before each judgement (ms). */
const WINDOW = 2000;
/** Longer frames are stalls (a long task, a hidden tab), not drawing; they start the window over. */
const STALL = 250;
/** A step down has to cut the frame time by this much to be kept. */
const GAIN = 0.9;

export class QualityGovernor {
  level = 0;
  private pinned: boolean;
  /** The lowest level still worth trying; a step that didn't help moves it up to stay. */
  private floor = QUALITY_LEVELS.length - 1;
  private wait = 3000;
  private total = 0;
  private count = 0;
  /** Mean frame time before the last step down, until the next window shows whether it helped. */
  private before = 0;

  /** `pin` fixes the level (0 is full quality) and turns the watching off. */
  constructor(pin?: number) {
    this.pinned = pin !== undefined;
    if (pin !== undefined) this.level = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, Math.round(pin)));
  }

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level];
  }

  /** Starts measuring afresh after `ms`, e.g. once a hidden page shows again. */
  rest(ms = 1000) {
    this.wait = ms;
    this.total = 0;
    this.count = 0;
  }

  /** Records one frame's length (ms); true when the level changed. */
  frame(ms: number): boolean {
    if (this.pinned) return false;
    if (ms > STALL) {
      this.rest(500);
      return false;
    }
    if (this.wait > 0) {
      this.wait -= ms;
      return false;
    }
    this.total += ms;
    this.count++;
    if (this.total < WINDOW) return false;
    const mean = this.total / this.count;
    this.total = 0;
    this.count = 0;
    if (this.before) {
      const helped = mean < this.before * GAIN;
      this.before = 0;
      if (!helped) {
        // Not busy drawing (capped, or busy elsewhere): undo the step and leave it at that.
        this.level--;
        this.floor = this.level;
        this.wait = 500;
        return true;
      }
    }
    if (mean > SLOW && this.level < this.floor) {
      this.before = mean;
      this.level++;
      // The canvases resize on the next frame; let that settle before measuring again.
      this.wait = 500;
      return true;
    }
    return false;
  }
}
