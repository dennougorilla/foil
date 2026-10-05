// How big and how long an APNG will be: the Save button says so before the exporter (apngExport.ts) loads.
import { exportLoop, framePlan, type ExportMotion, type Tune } from '../tune/model';
import { exportFrame } from '../card/shape';

/** The frame for the trading card; other shapes turn it (shape.ts exportFrame). */
export const W = 320;
export const H = 400;
/** Up to 12.5 fps: smooth enough for the slow idle motion, and half the frames (and bytes) of 25 fps. */
const DELAY = 80;
/** Long loops play at a lower frame rate rather than growing the file without end. */
const MAX_FRAMES = 60;
/** Measured average for one deflated frame at this size across finishes (busy pictures run higher). */
const BYTES_PER_FRAME = 95_000;

export interface ApngPlan {
  width: number;
  height: number;
  /** Delay of each frame in whole ms; together they add up to the loop length. */
  delays: number[];
  /** Rough size of the finished file in bytes. */
  bytes: number;
  /** Source time one loop covers (see `exportLoop`). */
  sourceSpan: number;
}

/**
 * Frame timing, size and expected bytes for a card `aspect` tall (height / width): the loop of the
 * export's motion, as for the GIF.
 */
export function apngPlan(tune: Tune, aspect: number, loopMs?: number, motion: ExportMotion = 'stage'): ApngPlan {
  const { loopMs: ms, sourceSpan } = exportLoop(tune, loopMs, motion);
  const delays = framePlan(ms, DELAY, MAX_FRAMES, 1);
  const f = exportFrame(aspect, W, H);
  return { width: f.W, height: f.H, delays, bytes: Math.round(delays.length * BYTES_PER_FRAME * ((f.W * f.H) / (W * H))), sourceSpan };
}
