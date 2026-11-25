const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapWordLetters, mismatchedPhones, parseLetterMapBundle } = require('../lib/letter-mapping');
const { LETTER_MAP_ASSET } = require('../lib/letter-map-asset');

const map = { text: 'بِسْمِ', units: [[[0, 1], [2, 3], [4, 5]]] };
const feedback = [{ expectedPhonemes: ['b', 's', 'm'], recognizedPhonemes: ['b', 's', 'x'] }];
test('maps a wrong phone to its Arabic letter together with the vowel', () => {
  assert.deepEqual(mapWordLetters(map, map.text, feedback, [0]), [
    { text: 'بِ', wrong: false }, { text: 'سْ', wrong: false }, { text: 'مِ', wrong: true },
  ]);
});
test('rejects ambiguous alignments, insertions and display text mismatches', () => {
  assert.equal(mismatchedPhones(['a', 'a'], ['a']), null);
  assert.equal(mismatchedPhones(['b'], ['b', 'x']), null);
  assert.deepEqual(mismatchedPhones(['b', 'i', 's'], ['b', 's']), [1]);
  assert.equal(mapWordLetters(map, 'different', feedback, [0]), null);
  assert.equal(mapWordLetters(undefined, map.text, feedback, [0]), null);
  assert.equal(mapWordLetters(map, map.text, feedback, [-1]), null);
  assert.equal(mapWordLetters(map, map.text, feedback, [0, 1]), null);
});
test('uses canonical source offsets when display normalization has different code-point lengths', () => {
  const canonical = { text: 'أب', units: [[[0, 1], [1, 2]]] };
  const parts = mapWordLetters(canonical, 'ا\u0654ب', [{ expectedPhonemes: ['a', 'b'], recognizedPhonemes: ['a', 'x'] }], [0]);
  assert.deepEqual(parts, [{ text: 'ا\u0654', wrong: false }, { text: 'ب', wrong: true }]);
});
function completeBundle() {
  return { schemaVersion: 1, version: LETTER_MAP_ASSET.version, referenceSha256: LETTER_MAP_ASSET.referenceSha256,
    license: 'test license', sourceNotice: 'test notice',
    surahs: Object.fromEntries(LETTER_MAP_ASSET.ayahCounts.map((count, index) => [String(index + 1).padStart(3, '0'),
      Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i + 1), structuredClone(map)]))])),
  };
}
test('validates the complete downloaded bundle, source version and code-point spans', () => {
  const bundle = completeBundle();
  assert.equal(parseLetterMapBundle(bundle), bundle);
  bundle.surahs['001']['1'].units[0][0][1] = 9999;
  assert.throws(() => parseLetterMapBundle(bundle), /spans/);
  assert.throws(() => parseLetterMapBundle({ ...completeBundle(), version: 'future' }), /Incompatible/);
  assert.throws(() => parseLetterMapBundle({ ...completeBundle(), referenceSha256: 'wrong' }), /Incompatible/);
  const missing = completeBundle(); delete missing.surahs['002']['286'];
  assert.throws(() => parseLetterMapBundle(missing), /Incomplete/);
});

test('localizes a certain substitution despite a separate insertion', () => {
  assert.deepEqual(mismatchedPhones(['b', 's', 'm'], ['b', 'z', 's', 'x']), [2]);
});
test('keeps certain letter errors when another unit cannot be localized', () => {
  const multi = { text: 'بسم', units: [[[0, 1]], [[1, 2], [2, 3]]] };
  const parts = mapWordLetters(multi, 'بسم', [
    { expectedPhonemes: ['b'], recognizedPhonemes: ['b', 'z'] },
    { expectedPhonemes: ['s', 'm'], recognizedPhonemes: ['s', 'x'] },
  ], [0, 1]);
  assert.deepEqual(parts, [{ text: 'ب', wrong: false }, { text: 'س', wrong: false }, { text: 'م', wrong: true }]);
});
test('does not assign an ambiguous deletion to an arbitrary repeated letter', () => {
  assert.equal(mismatchedPhones(['a', 'a'], ['a']), null);
  assert.deepEqual(mismatchedPhones(['a', 'a', 'b'], ['a', 'x']), [2]);
});
