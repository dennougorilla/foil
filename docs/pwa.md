# Home screen and offline

How FOIL installs like an app, opens without a network, takes pictures from other apps' share
menus and moves to a new version. The product summary is in `README.md`. FOIL is a static site on
GitHub Pages (`https://dennougorilla.github.io/foil/`), so all of it is a manifest, one service
worker and a few lines in the page; there is no server to help.

## The manifest

`public/manifest.webmanifest`, linked from `index.html`. Its URLs are relative to the manifest, so
on GitHub Pages `start_url`, `scope` and `id` are `/foil/` (and the share target `/foil/share-target`),
and a local build served at `/` works the same way.

- Name **FOIL**, short name **FOIL**, `display: standalone`, theme color `#11181a` (the page's
  `theme-color`), background `#0d1315` (the page's ink).
- Icons: the favicon's pixel card on the app's ink, 192 and 512 px with rounded corners (`any`), and
  192 and 512 px edge to edge with the card inside the middle 80 % (`maskable`, for Android's
  shapes). They are drawn by `npm run og` with the home-screen icon for iOS
  (`apple-touch-icon.png`, which iOS still reads instead of the manifest's).
- Installing is left to the browser's own prompts (the install button in Chrome's address bar,
  Android's menu, Safari's "Add to Home Screen"); the page adds no install button or banner.

## The service worker

`src/sw.ts`, built into `dist/sw.js` by the `serviceWorker` plugin in `vite.config.ts` once the rest
of the build is written: it lists the files in `dist`, hashes them, and puts the list and the hash
at the top of the worker. A build that changes any file therefore changes `sw.js`, which is how the
browser learns there is a new version. The page registers it only in a production build, after the
page has loaded and is idle (`src/pwa.ts`, its own small chunk), so the first load carries only the
few lines that fetch that chunk. "Loaded" is checked, not only waited for: the page's script waits
for its texts first, and a page served from the worker's cache has finished loading by then.

What it keeps (the cache `foil-app-<hash>`, one per version):

- the page, its scripts and styles, every chunk that loads on demand (Fine-tune, the exporters, the
  binder, the packs and their openings, the decoders, both languages), the icons and the manifest;
- not `og.png` (for link previews only), `THIRD_PARTY_NOTICES.txt`, or the WebAssembly runtime of
  the depth model (14 and 27 MB), which Shadowbox and 3D Lenticular fetch as before (they need the
  network the first time anyway, for the model);
- the sample pictures need nothing: they are painted by the page's own code.

The fonts come from Google Fonts. The worker keeps every font stylesheet and font file the page
uses in `foil-fonts` (kept across versions): a font file is served from there, a stylesheet from
there while a fresh copy is fetched behind it. The first visit's fonts are fetched before the
worker exists, so once it is running the page hands it the fonts it has loaded. A Japanese page
keeps only the character slices its text used; a character typed for the first time offline falls
back to a system font.

How it answers:

- Opening FOIL (a navigation to the scope's page, with any query) is answered with the kept page
  at once, online or not, so the app opens instantly and offline.
- A file of the app is answered from the version's cache; anything else (the depth model, Hugging
  Face, the support links) goes to the network untouched.

## A new version

FOIL is released often, and an old version must not linger. The browser checks `sw.js` whenever FOIL
is opened, and the page asks again whenever it comes back to the foreground. A new worker downloads
the new version beside the old one (files whose names carry a content hash are copied from the old
cache rather than downloaded again) and then waits. The page that is open keeps running the version
it started with, so a chunk it loads later always matches it.

While a new version waits, a small green **Update** chip (a pixel circular arrow and the word)
appears at the left of the header's chips. At 1180 px and narrower, where the header has no room to
spare, it keeps to its icon (the pointer shows the word, screen readers read it) and takes the GitHub
link's place while it shows, so the row is never wider than without it. The chip and its styles come
with `src/pwa.ts`, not with the first load. Pressing it lets the new worker take over and reloads
the page, which then runs the new version; the old version's cache is deleted at that moment. Ignored, the chip stays; once every FOIL window is closed the browser switches by itself,
so the next launch is the new version either way. The first install never shows the chip and never
reloads the page.

## Keeping the binder

Browsers may clear a site's storage under pressure unless it is marked persistent. FOIL asks
(`navigator.storage.persist()`) when a card is first kept in the binder, the moment there is
something worth keeping and the person has just asked to keep it. Chrome decides by itself (an
installed app is granted), Firefox asks the person once; FOIL says nothing either way, and asks again
on a later Keep only while the storage is not persistent.

## Sharing a picture to FOIL

On Android and desktop Chrome (and Edge), an installed FOIL appears in the system share menu for
pictures (`share_target` in the manifest; the same types the Open button takes). The menu sends the
picture as a form POST to `./share-target`; GitHub Pages cannot take a POST, so the service worker
answers it: it keeps the picture in the cache `foil-shared` and redirects to `./?shared`. The page
sees `?shared`, takes the picture back from the worker (`GET ./shared-picture`, which hands it over
once and forgets it), drops `shared` from the address and opens it exactly like a picked file. A
shared picture comes before last visit's picture. If more than one picture is shared, the first is
used.

iOS and Safari don't support share targets: the manifest's entry is ignored there and nothing else
changes. If the worker is missing (site data cleared while the app stayed installed), the POST
reaches GitHub Pages and fails; opening FOIL once brings the worker back.

## Development

- The worker exists only in a production build (`npm run build`, then `npm run preview`); the dev
  server never registers one.
- Service workers need a secure page: `localhost` counts, a phone on the LAN needs https. For that,
  `npm install --no-save @vitejs/plugin-basic-ssl` and a git-excluded local config that merges
  `./vite.config.ts` with `basicSsl()`; neither is committed.
- `npm run e2e:pwa` (after `npm run build`) serves `dist` under `/foil/` on its own port and checks
  the manifest, the registration, an offline launch, the Update chip and a shared picture.
