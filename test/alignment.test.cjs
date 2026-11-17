const { test } = require('node:test');
const assert = require('node:assert/strict');
const { alignWords, thresholds } = require('../lib/alignment');
const { pcm16leToFloat32 } = require('../lib/engine');
const word = (id, ...phonemes) => ({ id, text: id, phonemes });
const decoded = (names, { settled = names.length, isFinal = false, confidence = .99 } = {}) => ({
  text: names.join(' '), settled, isFinal,
  tokens: names.map((name, i) => ({ id: name === '|' ? 0 : i + 1, name,
    firstMs: i * 40, peakMs: i * 40, lastMs: i * 40, confidence })),
});
test('an exact but unclosed word stays provisional', () => {
  const [r] = alignWords([word('w', 'a', 'b')], decoded(['a', 'b']), 0);
  assert.equal(r.state, 'pending'); assert.equal(r.provisionalState, 'correct'); assert.equal(r.committed, false);
});
test('a settled word boundary commits an exact match', () => {
  const [r] = alignWords([word('w', 'a', 'b')], decoded(['a', 'b', '|']), 0);
  assert.equal(r.state, 'correct'); assert.equal(r.committed, true);
  assert.equal(r.startMs, 0); assert.equal(r.endMs, 40);
});
test('an unsettled boundary does not commit a word', () => {
  const [r] = alignWords([word('w', 'a')], decoded(['a', '|'], { settled: 1 }), 0);
  assert.equal(r.state, 'pending');
});
test('a final word needs no trailing word bar', () => {
  assert.equal(alignWords([word('w', 'a')], decoded(['a'], { isFinal: true }), 0)[0].state, 'correct');
});
test('low or missing confidence cannot produce correct', () => {
  for (const confidence of [.5, null, NaN]) {
    assert.equal(alignWords([word('w', 'a')], decoded(['a'], { isFinal: true, confidence }), 0)[0].state, 'uncertain');
  }
});
test('high confidence single substitution can flag a word', () => {
  const [r] = alignWords([word('w', 'a', 'b', 'c')], decoded(['a', 'x', 'c'], { isFinal: true }), 0);
  assert.equal(r.state, 'incorrect'); assert.equal(r.reason, 'substitution');
});
test('unrelated or short uncertain utterances are not confidently marked incorrect', () => {
  const [r] = alignWords([word('w', 'a', 'b', 'c')], decoded(['x', 'y', 'z'], { isFinal: true }), 0);
  assert.equal(r.state, 'uncertain');
});
test('missing audio stays uncertain instead of accusing a learner', () => {
  const r = alignWords([word('one', 'a'), word('two', 'b')], decoded(['a'], { isFinal: true }), 0);
  assert.equal(r[0].state, 'correct'); assert.equal(r[1].state, 'uncertain');
  assert.equal(r[1].reason, 'missing_audio');
});
test('repeated expected words create ambiguity', () => {
  const r = alignWords([word('one', 'a'), word('two', 'b'), word('three', 'a')], decoded(['a', '|', 'a', '|']), 0);
  assert.ok(r.every(w => !w.committed));
});
test('unrecited suffix remains pending during streaming', () => {
  const r = alignWords([word('one', 'a'), word('two', 'b')], decoded(['a', '|']), 0);
  assert.equal(r[0].state, 'correct'); assert.equal(r[1].state, 'pending');
});
test('tentative output cannot move an already settled alignment', () => {
  const expected = [word('one', 'a'), word('two', 'b')];
  const before = alignWords(expected, decoded(['a', '|']), 0);
  const after = alignWords(expected, decoded(['a', '|', 'x'], { settled: 2 }), 0);
  assert.deepEqual(after[0], before[0]);
});
test('threshold validation rejects invalid ranges and inverted confidence', () => {
  assert.throws(() => thresholds({ correctConfidence: NaN }));
  assert.throws(() => thresholds({ incorrectConfidence: .1 }));
});
test('PCM16LE conversion respects signed limits, offsets and alignment', () => {
  const bytes = Uint8Array.from([99, 0, 128, 0, 0, 255, 127, 99]).subarray(1, 7);
  assert.deepEqual([...pcm16leToFloat32(bytes)], [-1, 0, 32767 / 32768]);
  assert.throws(() => pcm16leToFloat32(Uint8Array.of(1)));
});

test('barless exact ayah is segmented into its expected words', () => {
  const r = alignWords([word('one', 'a', 'b'), word('two', 'c')], decoded(['a', 'b', 'c'], { isFinal: true }), 0);
  assert.deepEqual(r.map(w => w.state), ['correct', 'correct']);
  assert.deepEqual(r.map(w => w.recognizedPhonemes), [['a', 'b'], ['c']]);
});
test('barless streaming closes only boundaries supported by settled following phones', () => {
  const expected = [word('one', 'a', 'b'), word('two', 'c', 'd')];
  const r = alignWords(expected, decoded(['a', 'b', 'c'], { settled: 3 }), 0);
  assert.equal(r[0].state, 'correct');
  assert.equal(r[1].state, 'pending');
  const tentative = alignWords(expected, decoded(['a', 'b', 'c'], { settled: 2 }), 0);
  assert.ok(tentative.every(w => !w.committed));
});
test('silence, unmatched short fragments and low confidence cannot fabricate correct words', () => {
  const expected = [word('one', 'a', 'b'), word('two', 'c')];
  for (const names of [[], ['a', 'x', 'c']]) {
    assert.ok(alignWords(expected, decoded(names, { isFinal: true }), 0).every(w => w.state !== 'correct'));
  }
  assert.ok(alignWords(expected, decoded(['a', 'b', 'c'], { isFinal: true, confidence: .5 }), 0).every(w => w.state !== 'correct'));
});

test('a wrong word without word bars does not suppress later exact words', () => {
  const words = [word('first', 'a', 'b', 'c'), word('second', 'd', 'e', 'f'), word('third', 'g', 'h')];
  const result = alignWords(words, decoded(['a', 'x', 'c', 'd', 'e', 'f', 'g', 'h'], { isFinal: true }), 0);
  assert.deepEqual(result.map(w => w.state), ['incorrect', 'correct', 'correct']);
});

test('naturally repeating the preceding word still accepts the next word', () => {
  const words = [word('first', 'a', 'b'), word('second', 'c', 'd'), word('third', 'e', 'f')];
  const result = alignWords(words, decoded(['a', 'b', 'a', 'b', 'c', 'd', 'e', 'f'], { isFinal: true }), 0);
  assert.deepEqual(result.map(w => w.state), ['correct', 'correct', 'correct']);
});

test('a correction after a wrong attempt can match without restarting capture', () => {
  const words = [word('first', 'a', 'b', 'c'), word('second', 'd', 'e', 'f')];
  const result = alignWords(words, decoded(['a', 'x', 'c', 'a', 'b', 'c', 'd', 'e', 'f'], { isFinal: true }), 0);
  assert.deepEqual(result.map(w => w.state), ['correct', 'correct']);
});


test('settled silence closes the last word without ending microphone capture', () => {
  const expected = [word('one', 'a', 'b'), word('two', 'c', 'd')];
  const result = alignWords(expected, decoded(['a', 'b', 'c', 'd']), 0, undefined, 1000);
  assert.deepEqual(result.map(w => w.state), ['correct', 'correct']);
});

test('unsettled trailing silence cannot commit tentative phones', () => {
  const result = alignWords([word('one', 'a', 'b')], decoded(['a', 'b'], { settled: 1 }), 0, undefined, 1000);
  assert.equal(result[0].committed, false);
});


test('settled silence commits the last word while microphone session stays live', () => {
  const result = alignWords([word('one', 'a', 'b')], decoded(['a', 'b']), 0, undefined, 1000);
  assert.equal(result[0].state, 'correct');
  assert.equal(result[0].committed, true);
});

test('settled silence can close a confident wrong word without an SDK separator', () => {
  const result = alignWords([word('one', 'a', 'b', 'c')], decoded(['a', 'x', 'c']), 0, undefined, 1000);
  assert.equal(result[0].state, 'incorrect');
});


test('CTC timestamp gaps inside a known word are not silence boundaries', () => {
  const d = decoded(['l', 'aa', 'h', 'i'], { isFinal: true });
  d.tokens[2].firstMs = 1000;
  d.tokens[2].lastMs = 1040;
  d.tokens[3].firstMs = 1080;
  d.tokens[3].lastMs = 1120;
  const result = alignWords([word('allah', 'l', 'aa', 'h', 'i')], d, 0);
  assert.equal(result[0].state, 'correct');
});
