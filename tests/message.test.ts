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

test('a message keeps at most three lines and a short length', () => {
  assert.equal(cleanMessageText('a\nb\nc\nd\ne'), 'a\nb\nc d e');
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
