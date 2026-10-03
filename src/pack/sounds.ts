// The pack opening's sounds and vibration, synthesised like the rest (src/audio.ts): nothing is
// downloaded. Vibration follows the sound switch and only happens where the device has it.
import { blip, noise, note, soundOn } from '../audio';

export function buzz(pattern: number | number[]) {
  if (soundOn()) navigator.vibrate?.(pattern);
}

export const packSfx = {
  /** The pack flies in. */
  whoosh() {
    noise(0.28, 0.18, 400, 2400);
  },
  /** One grain of the tear, pitched up as the line grows (p: 0..1). */
  tear(p: number) {
    noise(0.045, 0.16, 1100 + 2600 * p, 1600 + 3400 * p);
  },
  /** The line drains back when the finger lifts early. */
  fizzle() {
    noise(0.22, 0.08, 2400, 500);
  },
  rip(rich: boolean) {
    noise(0.34, 0.32, 700, 5200);
    blip(90, 0.28, 'sine', 0.3, 0.5);
    if (rich) [0, 1, 2, 3].forEach((i) => blip(note(i + 5) * 2, 0.4, 'sine', 0.05, 0, 0.08 + i * 0.05));
  },
  /** The stack lands in the middle. */
  land() {
    noise(0.12, 0.1, 1800, 600);
    blip(140, 0.12, 'sine', 0.16, 0.6, 0.02);
  },
  swish() {
    noise(0.16, 0.14, 1800, 700);
  },
  /** The next card pops forward. */
  pop(i: number) {
    blip(note(i + 2) * 2, 0.07, 'triangle', 0.08, 1.4);
  },
  /** The card before the showpiece surfaces. */
  chime() {
    blip(1319, 0.2, 'triangle', 0.08);
    blip(1760, 0.32, 'triangle', 0.07, 0, 0.08);
  },
  /** The showpiece gathers itself (dur in seconds). */
  charge(dur: number) {
    blip(180, dur, 'sawtooth', 0.035, 4);
    blip(90, dur, 'triangle', 0.08, 4);
    noise(dur, 0.05, 300, 3000);
  },
  /** The showpiece turns over: a boom, a chord and a sparkle. */
  reveal(rich: boolean) {
    blip(rich ? 55 : 70, 0.6, 'sine', 0.32, 0.5);
    noise(0.4, 0.18, 4000, 900);
    [0, 2, 4, 5].forEach((i, n) => blip(note(i) * 2, 0.7, 'triangle', 0.08, 0, n * 0.04));
    [5, 6, 7, 8, 9].forEach((i, n) => blip(note(i) * 4, 0.12, 'square', 0.035, 0, 0.18 + n * 0.05));
    if (rich) [7, 8, 9].forEach((i, n) => blip(note(i) * 4, 0.9, 'sine', 0.05, 0, 0.3 + n * 0.09));
  },
  /** A card dealt into the haul, pitched up along the row. */
  deal(i: number) {
    blip(note(i) * 2, 0.07, 'square', 0.05);
  },
};
