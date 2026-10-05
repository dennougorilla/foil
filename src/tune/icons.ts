// Pixel icons of the Shine tab's controls and choices, on a 16 × 16 grid; the motion button
// by the deck draws its motions with the same ones. The motions other than Sway and None draw
// with icons from motionIcons.ts, which come with the tray and the Shine tab.

const ICONS: Record<string, string> = {
  pattern: '<path d="M2 2h4v4H2zm8 0h4v4h-4zM6 6h4v4H6zm-4 4h4v4H2zm8 0h4v4h-4z"/>',
  light: '<path d="M7 1h2v3H7zm0 11h2v3H7zM1 7h3v2H1zm11 0h3v2h-3zM5 5h6v6H5zM3 2h1v1h1v1H3zm9 0h1v2h-2V3h1zM3 12h2v1H4v1H3zm8 0h2v2h-1v-1h-1z"/>',
  motion: '<path d="M2 9h2V7h2V5h2v2h2v2h2V7h2v2h-2v2h-2V9H8V7H6v2H4v2H2z"/>',
  pointer: '<path d="M4 1h2v1h1v1h1v1h1v1h1v1h1v1h1v2H9v1h1v2H8v-2H7v1H6v1H4z"/>',
  orbit: '<path d="M6 2h4v1h2v1h1v2h1v4h-1v2h-1v1h-2v1H6v-1H4v-1H3v-2H2V6h1V4h1V3h2zm0 2v1H5v1H4v4h1v1h1v1h4v-1h1v-1h1V6h-1V5h-1V4zm1 3h2v2H7zm4-6h3v3h-3z"/>',
  fixed: '<path d="M3 2h10v12H3zm2 2v8h6V4zm4 1h2v2H9z"/>',
  none: '<path d="M5 2h6v10H5zm1 1v8h4V3zM2 14h12v1H2z"/>',
  sway: '<path d="M1 8h2V6h2v2h2v2h2V8h2V6h2v2h2v2h-2v2h-2v-2H9v-2H7v2H5v2H3v-2H1z"/>',
  close: '<path d="M3 2h2v1h1v1h1v1h2V4h1V3h1V2h2v2h-1v1h-1v1H9v1H8v2h1v1h1v1h1v1h1v2h-2v-1H9v-1H8v-1H7v1H6v1H5v1H3v-2h1v-1h1v-1h1V9h1V7H6V6H5V5H4V4H3z"/>',
  gold: '<path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zm1 3v1H5v4h1v1h4v-1h1V6h-1V5z"/>',
  silver: '<path d="M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zm0 3v6h6V5zm2 2h2v2H7z"/>',
  eye: '<path d="M5 4h6v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H5v-1H3v-1H2V9H1V7h1V6h1V5h2zm1 2v1H5v2h1v1h4V9h1V7h-1V6zm1 1h2v2H7z"/>',
  reset: '<path d="M7 2h4v1h1v1h1v1h1v5h-1v1h-1v1h-1v1H6v-2h4v-1h1V6h-1V5H7v1H6v1h2v2H2V3h2v2h1V4h1V3h1z"/>',
};

export const svg = (name: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

/** Whether the icon is here yet (see motionIcons.ts). */
export const hasIcon = (name: string) => name in ICONS;
export const addIcons = (more: Record<string, string>) => void Object.assign(ICONS, more);
