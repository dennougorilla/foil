# Handoff: Plasma (branch `dennougorilla/foil-plasma`)

New finish **Plasma / プラズマ** (shader 96, Light pack, before the showpiece Shallows). The card
becomes a plasma ball: violet-to-pink streamers grow from an electrode at the card's middle,
wander slowly when nobody touches the card, and reach for the pointer (a finger on phones),
gathering there in one bolt with a pink spark. The picture sits a little darker. Started from
main v0.13.1 (a66c8dc). Committed as WIP; no PR, no release.

## Done

- Docs first: README / README.ja (34 finishes, Light pack), `docs/features.md` (table row, the
  finish's paragraph, dithered GIFs, the list of finishes that are never layer 2, loop length),
  `docs/packs.md` (Light is now a pack of six, and why), `docs/layering.md`, `docs/motion.md`.
- Shader `src/gl/plasma.ts` (`PLASMA_GLSL`, helpers prefixed `pl`, one uniform `uPlasmaAim` =
  x, y in face uv plus how firmly it is held, 0..1), dispatched in `src/gl/finishes/light.ts`. In the core
  `src/gl/shaders.ts`, 96 sits with 72 (covers the frame in full, no white glare).
- `Edition.torch` is now a kind (`TorchKind` in `src/gl/torch.ts`): `'uv'` Blacklight, `'plasma'`
  Plasma. Plasma rides Blacklight's lamp path: the pointer's card uv, a drag leads the lightning
  instead of tossing the card, not layerable, 6 s loop.
- `CardDraw.aim` (`src/gl/renderers.ts`), when absent: at the light, half held. Stage:
  `Stage.aimPlasma` lets the tip trail the pointer (rate 9/s) and gather (7/s in, 2.5/s out).
  Files: `plasmaFinger(p)` in `src/gl/torch.ts` is the unseen finger: down for about 0.3–0.8 of each loop,
  on an arc over the top of the art (a straight path crossed the electrode and the bolt
  vanished). PNG and speed 0 use `PLASMA_STILL`. Hand previews use the finger too. With nobody
  touching, the shader ignores where the aim point is, so the stage left alone matches the file
  outside the finger's touch.
- Reduced motion: the shader clock stops (the stage's idle clock), so the crackle freezes; the
  lightning still follows the pointer.
- Low-end: per the owner, no separate light version (the shared quality mechanism, #31, covers it).
- Tests: `tests/plasma.test.ts` (edition and pack placement, uniform prefix, the finger's loop
  closing, smoothness and reach); `tests/blacklight.test.ts`, `tests/packs.test.ts`,
  `tests/layering.test.ts` updated. `npm test`: 158 pass. `tsc --noEmit` clean.
- e2e (`scripts/e2e.mjs`): Plasma added to the "needs the card to itself" list; the old-secrets
  carry-over now expects a deck of 11 (Light has six); a new step "Plasma: the lightning reaches
  for the pointer…" (reduced motion; bright-light patch metric = luma above 140, because the
  sample picture is already purple, so a pink metric does not separate).

## Scores (Codex image judge, strict; A realism / B clarity / C quality / D stage–GIF)

| Round | A | B | C | D | Main asks |
|---|---|---|---|---|---|
| 1 | 5 | 6 | 6 | 8 | organic curves instead of sawtooth; contact dominant; smaller white core |
| 2 | 5 | 8 | 6 | 7 | irregular strands with short forks; gaps between gathered strands; light off the label |
| 3 | 6 | 8 | 7 | 8 | longer gentle paths with occasional kinks, half the forks; softer emitter |

After round 3 (not re-judged): forks at about half strength, smaller bead, less bloom at the contact.

## Remaining

Second pass (Mac): `npm run build` and `npm test` (158) pass on the final code, and
`scripts/shoot.mjs` lists Plasma in the Light pack's reveal order. Per the owner, no more scoring
rounds and no e2e for now: the owner looks at the finish first and sets the direction. Also open:
while held, the three strands that do not gather fade almost out.

1. **e2e not yet green on the final code** (not re-run, see above). Run 1 (before the last fixes): all ok except the
   old-secrets deck count (fixed, now 11) and the Plasma step (metric changed). Run 2: the Plasma
   step measured 0.008 vs 0.002 (threshold 0.02) after a 1.5 s wait. On a fast machine the probe gave
   0.061 vs 0.002. The wait is now 3.5 s; re-run. Run 2 also had a binder step fail ("the binder does not
   show one card") and every step after it time out in a chain; those passed in run 1, so this looks
   like load flakiness, but re-check. Run 3 ended at once with no output (cause not looked at). Restart
   the dev server before e2e.
2. `npm run build` passes on the final code (second pass).
3. Quality loop: 3 rounds done. Open points: the realism score (it still reads somewhat as a
   "lightning spell"); in a 480 px GIF the bolt on the finger is small; check other shapes and
   the trading-card layout (the art window's centre: the code falls back to the card when the
   electrode is outside the art window).
4. The review server on its port (production build, `--host 0.0.0.0`, outside Claude Code's process
   tree) was not started. The temporary preview change (uncommitted, not in this branch) was: in
   `src/packStore.ts` `read()`, merge `{ opened: ['light'] }` into the saved packs; in `src/state.ts`
   defaults, `edition: 'plasma'` and the hand `['base', 'plasma', 'foil', 'holo', 'poly', 'negative', 'prism']`.
5. Final check before a PR (AGENTS.md step 4), then squash or reword the WIP commit as you like.

## Notes

- The shape test rejects `1.4` near a y in any shader/torch code (even in TS): the finger arc
  uses explicit radii (0.27, 0.19).
- Screenshots on the real GPU: Playwright with `--use-angle=d3d11 --enable-gpu
  --ignore-gpu-blocklist` (Windows); wait about 9 s after load for the Light pack to compile and the card to deal in.
