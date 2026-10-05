# Integrating v0.14.0

v0.14.0 ships the work that was finished on top of v0.13.1. The low-end Android work (#31) and
the pack clean-up with every pack open (#43) are still in progress and wait for v0.14.1.

| Branch | What it brings |
| --- | --- |
| `foil-pwa` (6c484b5) | #32: install to the home screen, open offline (own service worker), the Update chip, persistent storage, pictures shared to FOIL (`docs/pwa.md`) |
| `foil-bugs-p1` (e999c0e, 1c2e85a, 3994b5a) | #36: a kept card keeps its brush strokes; #37: a wide trading card sets its words beside the picture, and the text area is the words alone |
| `foil-mp4` (a686d0f) | #42: MP4 export and share for Instagram; the still PNG format is gone |

## Decisions

### Snow Globe stays as in v0.13.1 (#35)

`foil-bugs-p1` also made Snow Globe's glitter a function of loop time (fe731e9) and shook the
dome lightly at the start of every loop (e4ff4dd), so a GIF or APNG would close without a seam.
The owner chose to keep v0.13.1's Snow Globe, a physics simulation shaken by hand, so those two
commits and their tests are not taken. #35 is closed on this rule: **a finish that changes when
you touch it, or that runs a physics simulation, does not have to loop seamlessly in a file.**

### Where the branches met

- `src/binder/binder.ts`: keeping a card both stores its brush strokes (#36) and asks for
  persistent storage once it is kept (#32).
- `tests/lazy-load.test.ts`: `pwa.ts`, `card/effect.ts` and the MP4 export are all on demand.
- `README.md` / `README.ja.md`: Share names GIF or MP4; the privacy notes keep the service
  worker's offline copy.
- The service worker keeps the MP4 chunk offline like any other built file (`src/swFiles.ts`
  only leaves out og.png, the notices, the depth model's wasm and itself).
