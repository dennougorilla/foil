// The MP4 for Instagram, which takes neither GIF nor APNG: the card's loop played whole times, each
// frame drawn and handed to the browser's own H.264 encoder (WebCodecs), never recorded in real time,
// then put in an MP4 with its index at the front.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { createScene, fileSafe, nextFrame, packsLoaded, swirlAt, type ExportInput, type Scene } from '../exporter';
import { TUNE_DEFAULTS } from '../tune/model';
import { MP4_FPS, MP4_H, MP4_W, mp4At, mp4Config, mp4Plan } from './mp4Plan';

/** A keyframe every two seconds. */
const KEY_EVERY = MP4_FPS * 2;
/** Frames the encoder may hold before drawing waits for it. */
const QUEUE = 4;

/** Draws one frame per animation frame, so the stage keeps moving throughout. */
export async function exportMp4(input: ExportInput, onProgress?: (p: number) => void): Promise<File> {
  await packsLoaded(input);
  const plan = mp4Plan(input.tune ?? TUNE_DEFAULTS, input.face.height / input.face.width, input.loopMs, !!input.edition.torch);
  const config = await mp4Config(plan.width, plan.height);
  if (!config) throw new Error('mp4: no H.264 encoder');
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: plan.width, height: plan.height, frameRate: MP4_FPS },
    fastStart: 'in-memory',
  });
  let failed: DOMException | null = null;
  let encoded = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
      onProgress?.(++encoded / plan.frames);
    },
    error: (e) => (failed = e),
  });
  encoder.configure(config);
  const frameUs = 1e6 / MP4_FPS;
  let scene: Scene | undefined;
  try {
    scene = createScene(input, MP4_W, MP4_H);
    for (let i = 0; i < plan.frames; i++) {
      await nextFrame();
      while (encoder.encodeQueueSize > QUEUE && !failed) await nextFrame();
      if (failed) throw failed;
      const p = mp4At(plan, i);
      scene.draw(p, swirlAt(p), p * plan.sourceSpan);
      const frame = new VideoFrame(scene.out, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % KEY_EVERY === 0 });
      frame.close();
    }
    await encoder.flush();
    muxer.finalize();
    return new File([muxer.target.buffer], `${fileSafe(input.name)}-${input.edition.id}.mp4`, { type: 'video/mp4' });
  } finally {
    scene?.dispose();
    if (encoder.state !== 'closed') encoder.close();
  }
}
