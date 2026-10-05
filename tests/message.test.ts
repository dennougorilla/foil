// Run with `npm test` (Node's own test runner, which strips the types itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MESSAGE,
  MESSAGE_FONTS,
  MESSAGE_MAX_CHARS,
  MESSAGE_PHRASES,
  MESSAGE_PLACES,
  cleanMessageText,
  layoutMessage,
  messageLines,
  normalizeMessage,
} from '../src/message.ts';
import { tcgFrame } from '../src/card/tcg.ts';
import { columnSize, layoutEffect } from '../src/card/effect.ts';

/** A stand-in for canvas text metrics: every character is 0.6 em wide. */
const measure = (text: string, size: number) => Array.from(text).length * 0.6 * size;
/** The trading card's art window, in face pixels. */
const ART = { x: 56, y: 56, w: 788, h: 1051 };

test('a card carries no message until one is written', () => {
  assert.equal(DEFAULT_MESSAGE.text, '');
  assert.equal(layoutMessage(messageLines(DEFAULT_MESSAGE.text), ART, 'top', measure), null);
});

test('anything stored that is not a message starts over from the default', () => {
  assert.deepEqual(normalizeMessage(null), DEFAULT_MESSAGE);
  assert.deepEqual(normalizeMessage({ text: 5, place: 'left', font: 'comic' }), DEFAULT_MESSAGE);
  const ok = { text: 'Happy\nBirthday', place: 'bottom', font: 'serif' } as const;
  assert.deepEqual(normalizeMessage(ok), ok);
  for (const p of MESSAGE_PLACES) assert.equal(normalizeMessage({ ...ok, place: p }).place, p);
  for (const f of MESSAGE_FONTS) assert.equal(normalizeMessage({ ...ok, font: f }).font, f);
});

test('a message is in the pixel face until another is picked', () => {
  assert.equal(DEFAULT_MESSAGE.font, 'dot');
});

test('a message keeps at most four lines and a short length', () => {
  assert.equal(cleanMessageText('a\nb\nc\nd\ne\nf'), 'a\nb\nc\nd e f');
  assert.equal(cleanMessageText('a\r\nb'), 'a\nb');
  assert.equal(Array.from(cleanMessageText('あ'.repeat(200))).length, MESSAGE_MAX_CHARS);
  assert.deepEqual(messageLines('  Happy \n\nBirthday\n\n'), ['Happy', '', 'Birthday']);
  assert.deepEqual(messageLines(' \n '), []);
});

test('every line fits inside the picture with a margin, centred', () => {
  for (const text of ['Hi', 'Happy Birthday to the best friend', 'おたんじょうび\nおめでとう', 'a\nbb\nccc']) {
    for (const place of MESSAGE_PLACES) {
      const l = layoutMessage(messageLines(text), ART, place, measure)!;
      for (const line of l.lines) {
        assert.ok(line.x >= ART.x + ART.w * 0.05, `${text} @${place}: line starts at ${line.x}`);
        assert.ok(line.x + line.w <= ART.x + ART.w * 0.95 + 0.5, `${text} @${place}: line ends past the art`);
        assert.ok(Math.abs(line.x + line.w / 2 - (ART.x + ART.w / 2)) < 0.5, 'line is not centred');
      }
      assert.ok(l.box.y >= ART.y && l.box.y + l.box.h <= ART.y + ART.h, `${text} @${place}: block leaves the art`);
    }
  }
});

test('the size shrinks to fit a long line and stays large for a short one', () => {
  const short = layoutMessage(['Hi'], ART, 'top', measure)!;
  const long = layoutMessage(['Happy Birthday to the best friend'], ART, 'top', measure)!;
  assert.ok(short.size > long.size * 2, `${short.size} vs ${long.size}`);
  // Short text never grows past a headline: about a seventh of the art's width.
  assert.ok(short.size <= ART.w * 0.17);
  // More lines, smaller type.
  const three = layoutMessage(['Hi', 'Hi', 'Hi'], ART, 'top', measure)!;
  assert.ok(three.size < short.size);
});

test('top, middle and bottom put the block where they say', () => {
  const at = (p: (typeof MESSAGE_PLACES)[number]) => layoutMessage(['Thank you'], ART, p, measure)!.box;
  const mid = (b: { y: number; h: number }) => b.y + b.h / 2;
  assert.ok(mid(at('top')) < ART.y + ART.h * 0.25);
  assert.ok(Math.abs(mid(at('middle')) - (ART.y + ART.h / 2)) < 2);
  assert.ok(mid(at('bottom')) > ART.y + ART.h * 0.75);
});

test('the layout follows the art window, whatever its shape', () => {
  const wide = { x: 56, y: 56, w: 1148, h: 691 };
  for (const place of MESSAGE_PLACES) {
    const l = layoutMessage(['Happy', 'Birthday'], wide, place, measure)!;
    assert.ok(l.box.y >= wide.y && l.box.y + l.box.h <= wide.y + wide.h, `${place} leaves a wide art window`);
    // Type is sized from the short side, so a wide card does not get a giant headline.
    assert.ok(l.size <= wide.h * 0.17);
  }
});

test('each language offers a few ready phrases that fit as they are', () => {
  for (const lang of ['ja', 'en'] as const) {
    const phrases = MESSAGE_PHRASES[lang];
    assert.ok(phrases.length >= 4 && phrases.length <= 6, `${lang}: ${phrases.length} phrases`);
    // Not a birthday tool: most phrases are for any occasion.
    assert.ok(phrases.filter((p) => /birthday|たんじょう|誕生/i.test(p)).length <= 2, `${lang}: too many birthday phrases`);
    for (const p of phrases) assert.equal(cleanMessageText(p), p, `${lang}: "${p}" would be cut`);
  }
});

/** The trading card's effect box, in face pixels. */
const BOX = { x: 40, y: 886, w: 820, h: 296 };

test('effect text fits its box, wrapping and shrinking as it grows', () => {
  const short = layoutEffect(['Happy birthday!'], BOX, measure)!;
  const long = layoutEffect(['Every year you make the table louder, the cake bigger and the night longer. Here is to many more of them together'], BOX, measure)!;
  const ja = layoutEffect(['いつもありがとう。これからも、たくさん笑って、たくさん食べて、元気でいてね。'], BOX, measure)!;
  for (const l of [short, long, ja]) {
    for (const line of l.lines) {
      assert.ok(line.x >= BOX.x && line.x + line.w <= BOX.x + BOX.w + 0.5, `"${line.text}" leaves the box`);
      assert.ok(line.y - l.size / 2 >= BOX.y && line.y + l.size / 2 <= BOX.y + BOX.h, `"${line.text}" leaves the box`);
    }
  }
  assert.ok(long.lines.length > 2 && long.size < short.size, 'long text neither wrapped nor shrank');
  assert.ok(ja.lines.length >= 2, 'Japanese did not wrap');
  // No line of the Japanese starts with a closing mark.
  for (const line of ja.lines) assert.ok(!/^[、。]/.test(line.text), `"${line.text}" starts with punctuation`);
});

test('effect text is centred, short or wrapped', () => {
  for (const text of ['Happy birthday!', 'Every year you make the table louder, the cake bigger and the night longer.']) {
    for (const l of layoutEffect([text], BOX, measure)!.lines) assert.ok(Math.abs(l.x + l.w / 2 - (BOX.x + BOX.w / 2)) < 0.5, `"${l.text}" is not centred`);
  }
});

test('the trading-card stack fits every upright or square card, top to bottom without overlaps', () => {
  for (const [W, H] of [[900, 1260], [900, 900], [900, 1332]]) {
    const f = tcgFrame(W, H, { type: true, lines: 4 });
    const order = [f.name, f.art, f.type!, f.effect!, f.foot];
    for (const r of order) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && r.w > 0 && r.h > 0, `${W}x${H}: a part leaves the face`);
    for (let i = 1; i < order.length; i++) assert.ok(order[i].y >= order[i - 1].y + order[i - 1].h, `${W}x${H}: parts overlap`);
    const aspect = f.art.w / f.art.h;
    assert.ok(aspect > 0.9 && aspect < 3.5, `${W}x${H}: art window ${aspect.toFixed(2)}`);
  }
});

/** The upright and square trading cards as they were drawn before wide cards had a layout of their own: unchanged. */
const UPRIGHT: Record<string, ([number, number, number, number] | null)[]> = {
  '900x1260 t2': [[52,52,796,90.72],[62,156.72,776,718.8],[52,889.52,796,68.04],[52,971.56,796,201.6],[52,1187.16,796,42.84]],
  '900x1332 t2': [[52,52,796,95.904],[62,161.904,776,767.76],[52,943.664,796,71.928],[52,1029.592,796,213.12],[52,1256.712,796,45.288]],
  '900x900 t2': [[52,52,796,64.8],[62,130.8,776,474],[52,618.8,796,48.6],[52,681.4,796,144],[52,839.4,796,30.6]],
  '900x1260 t4': [[52,52,796,90.72],[62,156.72,776,643.2],[52,813.92,796,68.04],[52,895.96,796,277.2],[52,1187.16,796,42.84]],
  '900x1332 t4': [[52,52,796,95.904],[62,161.904,776,687.84],[52,863.744,796,71.928],[52,949.672,796,293.04],[52,1256.712,796,45.288]],
  '900x900 t4': [[52,52,796,64.8],[62,130.8,776,420],[52,564.8,796,48.6],[52,627.4,796,198],[52,839.4,796,30.6]],
  '900x1260 -0': [[52,52,796,90.72],[62,156.72,776,1016.44],null,null,[52,1187.16,796,42.84]],
  '900x1332 -0': [[52,52,796,95.904],[62,161.904,776,1080.808],null,null,[52,1256.712,796,45.288]],
  '900x900 -0': [[52,52,796,64.8],[62,130.8,776,694.6],null,null,[52,839.4,796,30.6]],
};

test('upright and square trading cards keep their stack exactly', () => {
  for (const [key, want] of Object.entries(UPRIGHT)) {
    const [size, parts] = key.split(' ');
    const [W, H] = size.split('x').map(Number);
    const f = tcgFrame(W, H, { type: parts[0] === 't', lines: Number(parts.slice(1)) });
    const got = [f.name, f.art, f.type, f.effect, f.foot].map((r) => (r ? [r.x, r.y, r.w, r.h].map((v) => Math.round(v * 1000) / 1000) : null));
    assert.deepEqual(got, want, key);
  }
});

test('a wide trading card sets its words beside the picture, on plates as tall as an upright card has', () => {
  const tall = tcgFrame(900, 1260, { type: true, lines: 2 });
  for (const [W, H] of [[1260, 900], [1332, 900], [1489, 900]]) {
    for (const lines of [1, 2, 4]) {
      const f = tcgFrame(W, H, { type: true, lines });
      const t = f.type!;
      const e = f.effect!;
      const at = `${W}x${H}, ${lines} lines`;
      for (const r of [f.name, f.art, t, e, f.foot]) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && r.w > 0 && r.h > 0, `${at}: a part leaves the face`);
      // The name across the top and the fine print across the foot, as on every trading card.
      assert.equal(f.name.w, W - 2 * f.name.x, at);
      assert.equal(f.foot.w, f.name.w, at);
      // The picture on the left; the type line over the text box in a column on the right, between the name and the foot.
      assert.ok(t.x >= f.art.x + f.art.w && e.x === t.x && e.w === t.w, `${at}: the words are not beside the picture`);
      assert.equal(t.x + t.w, f.name.x + f.name.w, at);
      assert.ok(t.y === f.art.y && e.y >= t.y + t.h && e.y + e.h === f.art.y + f.art.h, `${at}: the column does not run beside the picture`);
      assert.ok(f.art.y >= f.name.y + f.name.h && f.foot.y >= f.art.y + f.art.h, `${at}: parts overlap`);
      // Plates as tall as the upright card's, and the picture the larger part of the card.
      assert.ok(Math.abs(f.name.h - tall.name.h) < 1e-9 && Math.abs(t.h - tall.type!.h) < 1e-9 && Math.abs(f.foot.h - tall.foot.h) < 1e-9, `${at}: plates squeezed`);
      assert.ok(f.art.w > t.w && f.art.w / f.art.h > 0.85 && f.art.w / f.art.h < 1.4, `${at}: art window ${(f.art.w / f.art.h).toFixed(2)}`);
      assert.ok(e.h > tall.effect!.h, `${at}: the text box is smaller than on an upright card`);
      // The text is set at the top of the box, under the type line, in a band as tall as the upright card's box.
      const upright = tcgFrame(900, 1260, { type: true, lines }).effect!;
      assert.ok(f.text!.x === e.x && f.text!.y === e.y && f.text!.w === e.w && Math.abs(f.text!.h - upright.h) < 1e-9, `${at}: the text is not set under the type line`);
    }
    // Without card text there is no column: the type line runs under the picture, the plates still full height.
    const typed = tcgFrame(W, H, { type: true, lines: 0 });
    assert.ok(typed.type!.y >= typed.art.y + typed.art.h && typed.type!.w === typed.name.w && Math.abs(typed.type!.h - tall.type!.h) < 1e-9, `${W}x${H}: a lone type line`);
    const bare = tcgFrame(W, H, { type: false, lines: 0 });
    assert.ok(bare.type === null && bare.effect === null && bare.foot.y - (bare.art.y + bare.art.h) < 30, `${W}x${H}: full art`);
  }
});

test('card text can be held to a size, as in the tall column of a wide card', () => {
  const column = { x: 0, y: 0, w: 460, h: 570 };
  assert.ok(layoutEffect(['Happy birthday!'], column, measure)!.size > 100, 'a tall box alone sizes text by its height');
  const l = layoutEffect(['Happy birthday!', 'From all of us'], column, measure, 30)!;
  assert.equal(l.size, 30);
});

test("a wide card's column sets its text as large as its longest line allows unwrapped, within bounds", () => {
  const w = 500;
  // A short line is held to a tenth of the column, a long one wraps at a fifteenth, and one between fills the column.
  assert.equal(columnSize(['Hi!'], w, measure), w / 10);
  assert.equal(columnSize(['Every year you make the table louder and the cake bigger'], w, measure), w / 15);
  const two = ['Happy birthday, Hana', 'from all of us!'];
  const size = columnSize(two, w, measure);
  assert.ok(size > w / 15 && size < w / 10, `${size}`);
  const l = layoutEffect(two, { x: 0, y: 0, w, h: 560 }, measure, size)!;
  assert.equal(l.lines.length, 2, 'the lines wrapped');
  for (const line of l.lines) assert.ok(line.x >= 0 && line.x + line.w <= w, `"${line.text}" leaves the column`);
});

test('a trading card holds only the parts it has: an empty one is all picture, a short message a short box', () => {
  const full = tcgFrame(900, 1260, { type: true, lines: 4 });
  const one = tcgFrame(900, 1260, { type: true, lines: 1 });
  const bare = tcgFrame(900, 1260, { type: false, lines: 0 });
  assert.equal(bare.type, null);
  assert.equal(bare.effect, null);
  assert.ok(one.effect!.h < full.effect!.h, 'one line keeps the four-line box');
  assert.equal(full.text, full.effect, 'an upright card sets its text in the whole box');
  assert.ok(one.art.h > full.art.h && bare.art.h > one.art.h, 'the art does not take the room left');
  // The art runs down to just above the footer.
  assert.ok(bare.foot.y - (bare.art.y + bare.art.h) < 30);
});

test('wrapped effect text comes out even: no word left alone on its last line', () => {
  const l = layoutEffect(['Happy birthday! Whoever holds this card is the star of the day.'], BOX, measure)!;
  if (l.lines.length > 1) {
    const widths = l.lines.map((x) => x.w);
    assert.ok(Math.min(...widths) > Math.max(...widths) * 0.5, `uneven lines: ${l.lines.map((x) => x.text).join(' / ')}`);
  }
});
