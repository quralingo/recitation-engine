import { getRecitation, createHafsReferenceProvider } from '@quranlingoapp/recitation';
import type { HafsReferenceBundle, ExpectedWord } from '@quranlingoapp/recitation';

// Copy mobile-reference/surahs/001.json into your app first. Use a static Metro require.
// const surah1 = require('./assets/recitation/001.json') as HafsReferenceBundle;
export async function practiceAyah(surah1: HafsReferenceBundle) {
  const engine = getRecitation(); // Already configured and model loaded by the app.
  engine.setReferenceProvider(createHafsReferenceProvider(surah1));
  return engine.start({ expected: {surah: 1, ayah: 1} });
}

export async function practiceEducatorPhrase(text: string, words: ExpectedWord[]) {
  const engine = getRecitation();
  // Phonemes come from the educator or a reviewed authoring pipeline, not from the label.
  return engine.start({ expected: {kind: 'exercise', id: 'teacher-phrase-1', text,
    words, focus: ['ghunna']} });
}
