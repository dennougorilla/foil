// Which files of the build the service worker keeps for offline use (docs/pwa.md): all of them but
// these. Read by vite.config.ts when it writes dist/sw.js.
const LEFT_OUT = [
  // Only link previews fetch it.
  /^og\.png$/,
  // Linked from nowhere in the app.
  /^THIRD_PARTY_NOTICES\.txt$/,
  // The depth model's runtime (14 and 27 MB); its finishes need the network for the model anyway.
  /\.wasm$/,
  /^sw\.js$/,
];

/** The URLs to keep, relative to the scope, from the built files' paths; the page is kept as the scope itself. */
export const offlineFiles = (built: string[]): string[] =>
  built.filter((f) => !LEFT_OUT.some((r) => r.test(f))).map((f) => (f === 'index.html' ? './' : `./${f}`));
