// How a Shine setting reads (×1.2, +15°, 5600K…), in the Shine tab and the motion tray alike.
import type { Dict } from '../i18n';
import { TUNE_DEFAULTS, type NumKey } from './model';

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/** Amounts read as a multiple of the finish's own look (×1.0); the notch under the track marks it. */
const RELATIVE = new Set<NumKey>(['scale', 'sharp', 'sparkleSize', 'sat', 'glare']);

export function format(k: NumKey, v: number, t: Dict['tune']): string {
  if (RELATIVE.has(k)) return `×${(v / (TUNE_DEFAULTS[k] || 1)).toFixed(1)}`;
  switch (k) {
    case 'scale':
    case 'sharp':
    case 'sparkleSize':
      return `${Math.round(v * 100)}%`;
    case 'angle':
    case 'hue':
      return `${sign(Math.round(v))}°`;
    case 'lightAngle':
    case 'tiltMax':
      return `${Math.round(v)}°`;
    case 'sat':
    case 'glare':
      return `${Math.round(v * 100)}%`;
    case 'sparkle':
      return `${Math.round(v * 100)}%`;
    case 'temp':
      return `${Math.round(v)}K`;
    case 'speed':
      return v <= 0 ? t.stopped : `×${+v.toFixed(2)}`;
    case 'idleAmp':
      return `×${+v.toFixed(2)}`;
  }
}
