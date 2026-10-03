// Tiny synthesised sound kit. Nothing is loaded from the network.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setSound(on: boolean): void {
  enabled = on;
  if (master) master.gain.value = on ? 0.22 : 0;
}

function blip(freq: number, dur: number, type: OscillatorType, vol: number, glide = 0, delay = 0): void {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * glide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, from: number, to: number): void {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.4;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// Pentatonic so that sweeping across the hand always sounds musical.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const note = (i: number) => 440 * Math.pow(2, (SCALE[i % SCALE.length] - 9) / 12);

export const sfx = {
  hover(i: number) {
    blip(note(i) * 2, 0.06, 'square', 0.05);
  },
  select(i: number) {
    blip(note(i) * 2, 0.09, 'square', 0.08);
    blip(note(i + 2) * 2, 0.12, 'triangle', 0.09, 0, 0.05);
    blip(note(i + 4) * 2, 0.22, 'triangle', 0.08, 0, 0.1);
  },
  pop() {
    blip(520, 0.12, 'triangle', 0.12, 1.8);
  },
  toss() {
    noise(0.22, 0.25, 600, 2400);
  },
  land() {
    blip(180, 0.1, 'sine', 0.14, 0.6);
  },
  flip() {
    noise(0.18, 0.2, 2400, 500);
    blip(330, 0.08, 'square', 0.05, 1.5, 0.08);
  },
  coin() {
    blip(988, 0.08, 'square', 0.07);
    blip(1319, 0.3, 'square', 0.07, 0, 0.07);
  },
  error() {
    blip(220, 0.12, 'square', 0.08);
    blip(165, 0.2, 'square', 0.08, 0, 0.1);
  },
  tick() {
    blip(1400, 0.025, 'square', 0.025);
  },
};
