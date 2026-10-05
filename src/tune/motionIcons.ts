// The pixel icons of the motions other than Sway and None (16 × 16, as in icons.ts): fetched with
// the motion tray and the Shine tab, or when the motion button has to show one of them.
import { addIcons } from './icons';

addIcons({
  float: '<path d="M5 1h6v7H5zM2 11h2v1h2v-1h4v1h2v-1h2v1h-2v1h-2v-1H6v1H4v-1H2zm0 3h2v1h2v-1h4v1h2v-1h2v1h-2v1h-2v-1H6v1H4v-1H2z"/>',
  pendulum: '<path d="M7 1h2v2H7zm0 2h2v3H7zM4 6h8v8H4zm2 2v4h4V8z"/>',
  wobble: '<path d="M6 2h5v1h1v9h-1v1H6v-1H5V3h1zM1 4h2v1H2v2H1zm0 5h1v2h1v1H1zm13-5h1v3h-1V5h-1V4zm0 5h1v3h-2v-1h1z"/>',
  bounce: '<path d="M5 1h6v7H5zM1 14h14v1H1zM2 12h2v1H2zm10 0h2v1h-2zM3 10h1v1H3zm9 0h1v1h-1zM6 10h4v1H6z"/>',
  glint: '<path d="M7 0h2v4h1v1h1v1h1v1h4v2h-4v1h-1v1h-1v1H9v4H7v-4H6v-1H5v-1H4V9H0V7h4V6h1V5h1V4h1zM2 2h2v2H2zm10 10h2v2h-2z"/>',
  spin: '<path d="M6 2h5v1h1v1h1v3h-2V5h-1V4H6v1H5v2H3V4h1V3h2zm-3 7h2v2h1v1h4v-1h1V9h2v3h-1v1h-1v1H5v-1H4v-1H3z"/>',
  turn: '<path d="M7 3h2v10H7zM4 4h1v8H4zm7 0h1v8h-1zM2 6h1v4H2zm11 0h1v4h-1zM9 1h3v1h1v1h-2V2H9zM4 13h2v1H4z"/>',
  breathe: '<path d="M6 6h4v4H6zM2 2h4v1H3v3H2zm8 0h4v4h-1V3h-3zM2 10h1v3h3v1H2zm11 0h1v4h-4v-1h3z"/>',
  gyre: '<path d="M4 1h8v1h-8zM4 14h8v1h-8zM1 5h1v6h-1zM14 5h1v6h-1zM2 3h1v2h-1zM3 2h1v1h-1zM12 2h1v1h-1zM13 3h1v2h-1zM2 11h1v2h-1zM3 13h1v1h-1zM12 13h1v1h-1zM13 11h1v2h-1zM6 4h4v8h-4zM11 0h2v3h-2z"/>',
  lean: '<path d="M4 2h5v2h-5zM5 4h5v2h-5zM6 6h5v2h-5zM7 8h5v2h-5zM8 10h5v2h-5zM1 14h14v1h-14zM1 6h1v4h-1zM2 9h1v1h-1z"/>',
  jelly: '<path d="M6 3h4v10h-4zM2 4h1v2h-1zM3 6h1v2h-1zM2 8h1v2h-1zM3 10h1v2h-1zM13 4h1v2h-1zM12 6h1v2h-1zM13 8h1v2h-1zM12 10h1v2h-1z"/>',
  figure8: '<path d="M6 1h4v1h-4zM5 2h1v3h-1zM10 2h1v3h-1zM6 5h1v1h-1zM9 5h1v1h-1zM7 6h2v2h-2zM6 8h1v1h-1zM9 8h1v1h-1zM5 9h1v4h-1zM10 9h1v4h-1zM6 13h4v1h-4z"/>',
  sweep: '<path d="M4 2h8v1h-8zM4 13h8v1h-8zM4 3h1v10h-1zM11 3h1v10h-1zM5 10h1v2h-1zM6 9h1v2h-1zM7 8h1v2h-1zM8 7h1v2h-1zM9 6h1v2h-1zM10 5h1v2h-1zM1 13h2v1h-2zM2 12h1v1h-1zM13 2h2v1h-2zM13 3h1v1h-1z"/>',
  beam: '<path d="M4 2h8v1h-8zM4 13h8v1h-8zM4 3h1v10h-1zM11 3h1v10h-1zM5 8h1v4h-1zM6 7h1v4h-1zM7 6h1v4h-1zM8 5h1v4h-1zM9 4h1v4h-1zM10 3h1v4h-1z"/>',
  spotlight: '<path d="M4 3h9v1h-9zM4 13h9v1h-9zM4 4h1v9h-1zM12 4h1v9h-1zM1 0h2v2h-2zM3 2h1v1h-1zM4 1h1v1h-1zM7 6h3v1h-3zM6 7h5v3h-5zM7 10h3v1h-3z"/>',
  flare: '<path d="M2 13h1v1h-1zM3 12h1v1h-1zM4 11h1v1h-1zM5 10h1v1h-1zM6 9h1v1h-1zM7 8h1v1h-1zM8 7h1v1h-1zM9 6h1v1h-1zM12 0h1v7h-1zM9 3h7v1h-7zM11 2h3v3h-3z"/>',
  reveal: '<path d="M3 2h10v1h-10zM3 13h10v1h-10zM3 3h1v10h-1zM12 3h1v10h-1zM8 3h1v10h-1zM10 4h1v1h-1zM9 5h1v1h-1zM11 5h1v1h-1zM10 6h1v1h-1zM9 7h1v1h-1zM11 7h1v1h-1zM10 8h1v1h-1zM9 9h1v1h-1zM11 9h1v1h-1zM10 10h1v1h-1zM9 11h1v1h-1zM11 11h1v1h-1z"/>',
  push: '<path d="M2 5h4v1h-4zM2 6h1v6h-1zM2 11h4v1h-4zM7 2h7v12h-7zM0 8h1v1h-1z"/>',
  pulse: '<path d="M3 3h3v1h-3zM10 3h3v1h-3zM2 4h5v1h-5zM9 4h5v1h-5zM2 5h12v2h-12zM3 7h10v1h-10zM4 8h8v1h-8zM5 9h6v1h-6zM6 10h4v1h-4zM7 11h2v1h-2z"/>',
});
