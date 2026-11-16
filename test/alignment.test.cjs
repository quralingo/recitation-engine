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
