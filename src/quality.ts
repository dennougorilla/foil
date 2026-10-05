// Keeps slow devices smooth: watches how long the stage's frames take and, while it keeps
// missing frames, steps the on-screen drawing down. Exports never read this.
//
// This table is the one place where the page draws less: every level applies to the whole page
// (the stage, the hand, the backdrop, the sparks, the pack opening, the CSS loops, the CRT lines),
// so a new finish, backdrop or feature needs no light version of its own (docs/performance.md).

export interface QualityLevel {
  /** Multiplier on the card canvases' device pixel ratio (the stage's and the pack opening's). */
  res: number;
  /** The backdrop is drawn at 1/bg of the window's size. */
  bg: number;
  /** Multiplier on the number of sparks in a burst. */
  sparks: number;
  /** The backdrop holds still (drawn again only when its colors, size or place change) and the page's endless CSS loops play once. */
  still: boolean;
  /** The CRT lines over the page (when the CRT filter is on). */
  crt: boolean;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { res: 1, bg: 4, sparks: 1, still: false, crt: true },
  { res: 0.8, bg: 4, sparks: 1, still: true, crt: true },
  { res: 0.65, bg: 6, sparks: 0.5, still: true, crt: false },
  { res: 0.5, bg: 8, sparks: 0.5, still: true, crt: false },
];

/** Mean frame time (ms) above which the stage counts as stuttering: under 40 fps. */
const SLOW = 25;
/** Above this (under 20 fps) a step down skips a level. */
const FAR = 50;
/** At or under this the frames keep a 60 Hz display's pace, so a lowered start may climb back. */
const FAST = 18;
/** Frames measured after the page starts, before anything is judged (ms). */
const WARMUP = 1500;
/** Frame time measured before each judgement (ms). */
const WINDOW = 1000;
/** Longer frames are stalls (a long task, a hidden tab), not drawing; they start the window over. */
const STALL = 250;
/** ...unless this many come in a row after the warm-up (programs compiling): then the device is simply that slow. */
const STALL_RUN = 4;
/** A step down has to cut the frame time by this much to be kept. */
const GAIN = 0.9;

/** What the browser says about the device (navigator.deviceMemory, in GB; a coarse pointer). */
export interface DeviceHints {
  memory?: number;
  touch: boolean;
}

/**
 * Where a device starts: phones and tablets with little memory (low-priced Android phones) start a
 * step or two down, so their first seconds are smooth, and climb back while they keep up. Anything
 * else, and any browser that doesn't say (Safari), starts at full quality.
 */
export function startLevel(h: DeviceHints): number {
  if (!h.touch || h.memory === undefined) return 0;
  return h.memory <= 2 ? 2 : h.memory <= 4 ? 1 : 0;
}

const clampLevel = (l: number) => Math.max(0, Math.min(QUALITY_LEVELS.length - 1, Math.round(l)));

export class QualityGovernor {
  level: number;
  private pinned: boolean;
  /** Not measuring at all, while something else (an export) takes the frames. */
  private held = false;
  /** The lowest level still worth trying; a step that didn't help moves it up to stay. */
  private floor = QUALITY_LEVELS.length - 1;
  /** Started below full quality on a guess: it may climb back until a climb fails or a step down is needed. */
  private climbing: boolean;
  private wait = WARMUP;
  private total = 0;
  private count = 0;
  private stalls = 0;
  /** Time since watching began (ms). */
  private age = 0;
  /** The level before the last step down and the mean frame time then, until the next window shows whether it helped. */
  private stepped: { from: number; mean: number } | null = null;
  /** The level before the last climb, until the next window shows whether the device kept up. */
  private climbed: number | null = null;

  /** `pin` fixes the level (0 is full quality) and turns the watching off; `start` is where watching begins (see startLevel). */
  constructor(pin?: number, start = 0) {
    this.pinned = pin !== undefined;
    this.level = clampLevel(pin ?? start);
    this.climbing = !this.pinned && this.level > 0;
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

  /** Stops judging while `on` (an export draws and reads back every frame); measures afresh after. */
  hold(on: boolean) {
    this.held = on;
    this.rest();
  }

  /** Records one frame's length (ms); true when the level changed. */
  frame(ms: number): boolean {
    if (this.pinned || this.held) return false;
    this.age += ms;
    if (ms > STALL) {
      this.stalls = this.age < WARMUP ? 0 : this.stalls + 1;
      if (this.stalls < STALL_RUN) {
        this.rest(500);
        return false;
      }
      this.stalls = 0;
      return this.judge(ms);
    }
    this.stalls = 0;
    if (this.wait > 0) {
      this.wait -= ms;
      return false;
    }
    this.total += ms;
    this.count++;
    if (this.total < WINDOW) return false;
    return this.judge(this.total / this.count);
  }

  /** Weighs one window's mean frame time (ms); true when the level changed. */
  private judge(mean: number): boolean {
    const was = this.level;
    this.total = 0;
    this.count = 0;
    const stepped = this.stepped;
    const climbed = this.climbed;
    this.stepped = this.climbed = null;
    if (stepped && mean >= stepped.mean * GAIN) {
      // Not busy drawing (capped, or busy elsewhere): undo the step and leave it at that.
      this.level = this.floor = stepped.from;
    } else if (climbed !== null && mean > SLOW) {
      // The climb cost too much: back down, and no more climbing.
      this.level = climbed;
      this.climbing = false;
    } else if (mean > SLOW && this.level < this.floor) {
      this.climbing = false;
      this.stepped = { from: this.level, mean };
      this.level = Math.min(this.floor, this.level + (mean > FAR ? 2 : 1));
    } else if (this.climbing && mean <= FAST) {
      this.climbed = this.level;
      this.level--;
      this.climbing = this.level > 0;
    }
    if (this.level === was) return false;
    // The canvases resize on the next frame; let that settle before measuring again.
    this.wait = 500;
    return true;
  }
}
