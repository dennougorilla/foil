# Motion

The card's automatic motion. There is one list of motions: the one picked on screen (the motion
button above the deck, or Fine-tune → Shine) is the one a GIF or APNG is made with. The stage is the
preview of the export.

## The stage is the preview

Left alone, the card on the stage is exactly what a GIF or APNG will show: the same motion, the same
loop length, the same speed and size, the same light, sheen and dimmed room. There is no stage-only
version of any motion and no export-only motion.

- Your hand is the one thing that changes it, and only while it touches the card: pointing at the card
  (or a finger on it) leans it and puts the light under the pointer, a drag tosses it, the device's tilt
  (phones and tablets) leans it, and a turning motion comes round to its face and waits. Let go and the
  card goes back to the preview. None of this goes into a file.
- The backdrop is part of the preview too (Fine-tune → Card, [`backdrops.md`](backdrops.md)): the stage
  and the file draw it at the same moment of the loop, and it goes round whole in one loop.
- Finishes that react to touch (Warmth and the other touch finishes) keep your own strokes on the
  stage. A file has no hand in it, so in a GIF or APNG an unseen finger strokes the busiest part of the
  picture once per loop and the finish cools between strokes.
- Blacklight's lamp drifts round the art in six seconds and glows dimmer while nobody holds it, on the
  stage and in a file alike; under the pointer it turns up to full. Under a Light motion the lamp is
  the light whatever the light setting; otherwise a fixed light holds it still.
- Reduced motion stops the motion and the backdrop on the stage (the card faces you); exports still move.

## Groups and loop lengths

Twenty motions in four groups, plus None. The length is one loop at speed 1; the speed setting
divides it (speed 2 halves it) on the stage and in the file alike.

| Group | Motion (ja) | Motion (en) | What it does | Loop |
| --- | --- | --- | --- | --- |
| Gentle (ゆったり) | ゆらゆら | Sway | Drifts and sways (the default) | 6 s |
| | ふわふわ | Float | Hovers, slowly rising and sinking | 6 s |
| | ぶらぶら | Pendulum | Swings from its top edge | 3 s |
| | すーはー | Breathe | Swells and settles | 6 s |
| Tilt (傾けて見せる) | ぐるり | Gyre | Nods round an ellipse, so the glare travels round the face | 3 s |
| | ぐいーん | Lean | Tilts slowly and deeply, then holds | 3 s |
| | ぷるん | Jelly | Flicked from side to side, bouncing like jelly | 3 s |
| | 8の字 | Figure 8 | Tilts in a figure eight while the light circles the other way | 3 s |
| | そわそわ | Jiggle | The restless jitter of a card in a hand | 6 s |
| | くるくる | Spin | Turns without stop, showing its back | 6 s |
| Light (光で見せる) | スイープ | Sweep | Almost square on while a band of light sweeps across and back | 3 s |
| | すーっ | Light bar | Holds still in a dimmed room while a broad band of light crosses it | 3 s |
| | スポット | Spotlight | A spotlight circles the art in a dark room | 3 s |
| | ピカッ | Flare | A hard highlight runs edge to edge and ends in a twinkle | 2 s |
| Showpiece (見せ場) | じゃーん | Reveal | Shows its back, flips round, light runs across as it lands | 3 s |
| | ずいっ | Push in | Moves in from one side; light crosses as it faces you | 3 s |
| | どくん | Heartbeat | Beats like a heart, each beat sweeping light across | 2 s |
| | キラッ | Glint | Rests face on, tips over into a flash and a streak of light, settles | 3 s |
| | ひと回り | Turn once | Rests face up, then one slow full turn | 6 s |
| | ぴょん | Bounce | Hops, lands with a thud, then hops the other way | 6 s |

- A loop is 6 seconds (at speed 1) whenever something else in it goes round in 6: the orbiting light
  (except under the Light motions, which bring their own light) and Blacklight's drifting lamp. The
  lengths above all divide 6, so the stage and the file stay in step.
- At speed 0 nothing moves on its own: the stage holds still and an export is a still loop (an
  animated picture's own timing, or 2.4 s).
- **Size** scales every motion: how far the card moves and turns, and how far the light travels
  under the Light motions and the ones that steer the light (Figure 8, Glint). At 0 the card
  holds still; a turn (Spin, Turn once, Reveal) still turns all the way round.
- The Light group brings its own light, so the light setting (pointer, orbit, fixed) waits until another
  motion is picked; every other motion follows the light setting.

## What was merged (v0.13.1)

Up to v0.13.0 the stage had ten idle motions and exports had thirteen motions of their own, picked
separately under the GIF and APNG options. They are one list now, and the export's own Motion choice
is gone.

- **Showcase** (the v0.12 export motion: the card circles its tilt with the light opposite) was the
  same movement as Gyre, a little wider and on 2.4 s. It is Gyre now.
- **Moment** (the export motion) and **Glint** (the stage motion) were both a light streak crossing a
  card that leans into it, once every 3 s. They are one motion, **Glint**, with Moment's movement
  (the bigger tip into the flash). "見せ場" now only names the group.
- **Sweep** went from 2.4 s to 3 s, so every loop length divides 6.
- The A/B/C labels of the old export motions are gone.

A saved choice from v0.13.0 is carried over once: an export motion other than "As on screen" becomes
the card's motion (Showcase → Gyre, Moment → Glint, the rest by the same name). Cards kept in the
binder carry their own motion, whose names all still exist.
