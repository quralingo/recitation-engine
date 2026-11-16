import { getRecitation } from '@quranlingoapp/recitation';
import type { ExpectedWord } from '@quranlingoapp/recitation';

// The host supplies its SDK key once through native configuration (see README).
export async function practiceAyah(surah: number, ayah: number) {
  const engine = getRecitation();
  return engine.start({ expected: {surah, ayah} });
}

export async function practiceEducatorPhrase(text: string, words: ExpectedWord[]) {
  const engine = getRecitation();
  // Phonemes come from the educator or a reviewed authoring pipeline, not from the label.
  return engine.start({ expected: {kind: 'exercise', id: 'teacher-phrase-1', text,
    words, focus: ['ghunna']} });
}
