// How big and how long an MP4 will be, and whether this browser can make one: the format choice and
// the Save button need this before the exporter (mp4Export.ts) loads.
import { exportLoop, type Tune } from '../tune/model.ts';
import { exportFrame } from '../card/shape.ts';

/** Instagram's 4 : 5 portrait for the trading card; other shapes turn it (shape.ts exportFrame). */
export const MP4_W = 1080;
export const MP4_H = 1350;
export const MP4_FPS = 30;
/** Enough for the pixel swirl and the foil to stay crisp; Instagram re-encodes it anyway. */
export const MP4_BITRATE = 4_000_000;
/** The loop plays whole times until the video lasts this long (Instagram takes nothing under 3 s). */
const MIN_MS = 6000;
/** H.264 at level 4.0, which holds every frame size here: High, then Main, then Baseline. */
export const MP4_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];

export interface Mp4Plan {
  width: number;
  height: number;
  /** One loop of the card's motion (see `exportLoop`), and the source time it covers. */
  loopMs: number;
  sourceSpan: number;
  /** How many times the loop plays. */
  loops: number;
  frames: number;
  seconds: number;
  /** Rough size of the finished file in bytes. */
  bytes: number;
}

/** The video for a card `aspect` tall (height / width), as `apngPlan` is for the APNG. */
export function mp4Plan(tune: Tune, aspect: number, sourceMs?: number, torch = false): Mp4Plan {
  const { loopMs, sourceSpan } = exportLoop(tune, sourceMs, torch);
  const loops = Math.max(1, Math.ceil(MIN_MS / loopMs));
  const frames = Math.max(1, Math.round((loops * loopMs * MP4_FPS) / 1000));
  const seconds = frames / MP4_FPS;
  const { W, H } = exportFrame(aspect, MP4_W, MP4_H);
  return { width: W, height: H, loopMs, sourceSpan, loops, frames, seconds, bytes: Math.round((MP4_BITRATE / 8) * seconds) };
}

/** Loop position of frame `i`: the frames are spread evenly so the last loop closes on the first frame. */
export const mp4At = (plan: Mp4Plan, i: number) => ((i * plan.loops) / plan.frames) % 1;

/** The encoder settings for a frame, or null where this browser can't encode H.264 at that size. */
export async function mp4Config(width: number, height: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of MP4_CODECS) {
    const config: VideoEncoderConfig = { codec, width, height, bitrate: MP4_BITRATE, framerate: MP4_FPS, avc: { format: 'avc' } };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    } catch {
      // A codec string this browser doesn't know: try the next.
    }
  }
  return null;
}
