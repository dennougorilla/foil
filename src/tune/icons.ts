// Pixel icons of the Shine tab's controls and choices, on a 16 × 16 grid; the motion button
// by the deck draws its motions with the same ones.

const ICONS: Record<string, string> = {
  pattern: '<path d="M2 2h4v4H2zm8 0h4v4h-4zM6 6h4v4H6zm-4 4h4v4H2zm8 0h4v4h-4z"/>',
  light: '<path d="M7 1h2v3H7zm0 11h2v3H7zM1 7h3v2H1zm11 0h3v2h-3zM5 5h6v6H5zM3 2h1v1h1v1H3zm9 0h1v2h-2V3h1zM3 12h2v1H4v1H3zm8 0h2v2h-1v-1h-1z"/>',
  motion: '<path d="M2 9h2V7h2V5h2v2h2v2h2V7h2v2h-2v2h-2V9H8V7H6v2H4v2H2z"/>',
  pointer: '<path d="M4 1h2v1h1v1h1v1h1v1h1v1h1v1h1v2H9v1h1v2H8v-2H7v1H6v1H4z"/>',
  orbit: '<path d="M6 2h4v1h2v1h1v2h1v4h-1v2h-1v1h-2v1H6v-1H4v-1H3v-2H2V6h1V4h1V3h2zm0 2v1H5v1H4v4h1v1h1v1h4v-1h1v-1h1V6h-1V5h-1V4zm1 3h2v2H7zm4-6h3v3h-3z"/>',
  fixed: '<path d="M3 2h10v12H3zm2 2v8h6V4zm4 1h2v2H9z"/>',
  none: '<path d="M5 2h6v10H5zm1 1v8h4V3zM2 14h12v1H2z"/>',
  sway: '<path d="M1 8h2V6h2v2h2v2h2V8h2V6h2v2h2v2h-2v2h-2v-2H9v-2H7v2H5v2H3v-2H1z"/>',
  float: '<path d="M5 1h6v7H5zM2 11h2v1h2v-1h4v1h2v-1h2v1h-2v1h-2v-1H6v1H4v-1H2zm0 3h2v1h2v-1h4v1h2v-1h2v1h-2v1h-2v-1H6v1H4v-1H2z"/>',
  pendulum: '<path d="M7 1h2v2H7zm0 2h2v3H7zM4 6h8v8H4zm2 2v4h4V8z"/>',
  wobble: '<path d="M6 2h5v1h1v9h-1v1H6v-1H5V3h1zM1 4h2v1H2v2H1zm0 5h1v2h1v1H1zm13-5h1v3h-1V5h-1V4zm0 5h1v3h-2v-1h1z"/>',
  bounce: '<path d="M5 1h6v7H5zM1 14h14v1H1zM2 12h2v1H2zm10 0h2v1h-2zM3 10h1v1H3zm9 0h1v1h-1zM6 10h4v1H6z"/>',
  glint: '<path d="M7 0h2v4h1v1h1v1h1v1h4v2h-4v1h-1v1h-1v1H9v4H7v-4H6v-1H5v-1H4V9H0V7h4V6h1V5h1V4h1zM2 2h2v2H2zm10 10h2v2h-2z"/>',
  spin: '<path d="M6 2h5v1h1v1h1v3h-2V5h-1V4H6v1H5v2H3V4h1V3h2zm-3 7h2v2h1v1h4v-1h1V9h2v3h-1v1h-1v1H5v-1H4v-1H3z"/>',
  turn: '<path d="M7 3h2v10H7zM4 4h1v8H4zm7 0h1v8h-1zM2 6h1v4H2zm11 0h1v4h-1zM9 1h3v1h1v1h-2V2H9zM4 13h2v1H4z"/>',
  breathe: '<path d="M6 6h4v4H6zM2 2h4v1H3v3H2zm8 0h4v4h-1V3h-3zM2 10h1v3h3v1H2zm11 0h1v4h-4v-1h3z"/>',
  close: '<path d="M3 2h2v1h1v1h1v1h2V4h1V3h1V2h2v2h-1v1h-1v1H9v1H8v2h1v1h1v1h1v1h1v2h-2v-1H9v-1H8v-1H7v1H6v1H5v1H3v-2h1v-1h1v-1h1V9h1V7H6V6H5V5H4V4H3z"/>',
  gold: '<path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zm1 3v1H5v4h1v1h4v-1h1V6h-1V5z"/>',
  silver: '<path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zm0 3v6h6V5zm2 2h2v2H7z"/>',
  eye: '<path d="M5 4h6v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H5v-1H3v-1H2V9H1V7h1V6h1V5h2zm1 2v1H5v2h1v1h4V9h1V7h-1V6zm1 1h2v2H7z"/>',
  reset: '<path d="M7 2h4v1h1v1h1v1h1v5h-1v1h-1v1h-1v1H6v-2h4v-1h1V6h-1V5H7v1H6v1h2v2H2V3h2v2h1V4h1V3h1z"/>',
};

export const svg = (name: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;
