# Handoff: Chameleon (foil-chameleon)

Branch `dennougorilla/foil-chameleon`, cut from `main` at v0.13.1 (a66c8dc). Work in progress: moved
from the Windows desktop to the Mac to take load off the desktop.

## Done

- **Chameleon / カメレオン**, shader **90**, in the Metal pack as the card before the showpiece
  (`relief, gold, platinum, cosmoholo, chameleon, crystal`; the only `src/packs.ts` change, since
  foil-openall is regrouping the packs). Shader in `src/gl/chameleon.ts`, spliced in by
  `src/gl/finishes/metal.ts` (`e == 90`); edition in `src/editions.ts` (`dither: true`), names in
  `src/i18n/{en,ja}.ts`.
- The look: color-shift car paint under a clear coat. The tilt moves the whole card through gold →
  green → blue → violet (`chamPaint`, with a mirrored end, so a big tilt keeps changing color); the
  way to the highlight and the card's breadth spread it a little, so neighboring colors meet
  across the card. The frame is a deep lacquer (`paint²` toward the flop) with a shaded bevel at the
  art window and a thin line of gloss at the outer edge. Over the art, a thin color-shift film: the
  picture keeps its colors, and the highlight and a softbox strip (with a little orange-peel ripple)
  reflect in the paint's color.
- No clock (`uTime` is not read), so GIF/APNG loops close and reduced motion holds it still. It
  declares no uniforms of its own; any it adds must start with `uCham` (tested).
- Core changes in `src/gl/shaders.ts`: 90 covers the frame in full; the core glare is ×0.4 for 90
  (the clear coat draws its own highlight).
- Docs: README (en/ja: 34 finishes, Metal row), `docs/features.md` (table, paragraph, dithered
  list), `docs/packs.md` (Metal reveal order, why it joins Metal, Metal and Studio are packs of
  six), `docs/layering.md` (covers the frame in full).
- Tests: `tests/chameleon.test.ts` (shader 90, Metal before the showpiece, dithered, layerable, no
  clock, uniform prefix, dispatched by the Metal module); `tests/packs.test.ts` updated for six in
  Metal. `npm run build`, typecheck and `npm test` (159) pass.
- The low-end "light version" was dropped by the owner's call (the common low-end tuning covers
  it); nothing of it remains.

## Not done / open

1. **e2e is not green: 41 ok, 15 FAIL** (run on the desktop with several other sessions' e2e at the
   same time). Failed steps: fine-tune opens with four tabs and is remembered; an unreadable file
   is explained beside the pick button; crop zoom; switch finish; keep a card (binder); play a
   card from the binder; throw a card away / Undo; cards stay in their pocket; a full binder;
   open a pack (trace, swipe, showpiece last); the deck builder; a replay from the shop; a wide
   card in the opening; held still, the pack opens with a button; a support link puts the
   Supporter pack in the shop ("expected two sealed packs"). Most are 30 s click timeouts that
   cascade. The binder and pack steps failed in two runs. First rerun them on a quiet machine
   against a freshly started dev server (don't edit files while it runs: HMR reloads break it).
2. **Metal now holds six finishes: fixed in the e2e script.** The app itself already handles six
   (Studio has six). The only five-card assumptions were in `scripts/e2e.mjs`'s pack step: it
   swiped exactly Relief, Gold, Platinum and Cosmo Holo, so Chameleon left the overlay stuck and
   every later step (deck builder, replay, wide card, button opening, Supporter link) cascaded.
   The step now swipes until the showpiece waits, counts what it dealt, and the haul and deck
   counts follow that count. `scripts/shoot.mjs` lists Chameleon too. The earlier binder and
   fine-tune failures come before the pack steps, so they are not explained by this; they were
   most likely load (the Mac was also at load ~150 with several sessions' e2e running). e2e was
   not rerun here (the owner's call: review first).
3. Quality: realism stayed at 4 in every judge round (see below). The last tweak (wider color
   spread, deeper frame edge) was not judged. Worth trying: a stronger face/flop color pair (the
   flop showing the *other* color, as real ChromaFlair does), a crisper softbox edge, and judging
   on a second sample picture and another frame (Ink, Gilt) and shape.
4. Not checked yet: Chameleon as layer 2, the wide/square shapes, the phone stage, APNG/MP4.
5. Not pushed for review beyond this branch; no PR (owner's flow: Codex review, UI loop, then PR).

## Preview tweak (not committed)

To have Chameleon in the hand and on the card on every visit, `src/packStore.ts` gets two marked
`PREVIEW (uncommitted)` changes: the Metal pack counts as opened
(`mergePacks(read(), { opened: ['metal'], supporter: false })`), and `releaseSealedEdition` adds
`chameleon` to the hand (`addToHand`) and sets `edition: 'chameleon'`. Remove it before e2e (it
forces the edition every visit). The review server was `vite preview --host 0.0.0.0 --port 5401` on
a production build.

## Judge scores (Codex, strict; realism / clearly working / not cheap / picture)

| Round | Scores | Main points |
|---|---|---|
| 1 | 4 / 7 / 5 / 6 | uneven colors on one face, white glare, coat too heavy on the art, neon frame |
| 2 | 4 / 8 / 4 / 6 | still "rainbow tint + glow", big white glare, yellow-green haze on the art |
| 3 | 4 / 7 / 5 / 8 | reads as a color-changing plastic frame; wants neighboring hues across one face (round 1 asked for the opposite), near-white reflections, more frame depth |

Round 1 → 2: a thinner coat on the art, a deeper frame, the core glare cut for 90. Round 2 → 3: one
color over the face, `paint²` lacquer flop, the film reflects only at the highlight and the strip.

## Notes

- Shader number 90 and the `cham*` / `uCham*` names collide with nothing (`CH_*` / `ch*` belong to
  Cosmo Holo).
- The shader uses `vUv` (the real face uv, for the bevel and edge) and `uArt`, never 5 : 7 literals.
- On the desktop, Playwright GPU capture (`--use-angle=d3d11`) took the shots; GIF frames were laid
  out with `ImageDecoder`, which needs a secure page (localhost), not `about:blank`.
