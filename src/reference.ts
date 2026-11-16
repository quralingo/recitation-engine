import type { AyahReferenceProvider, ExpectedAyah, ExpectedWord, ModelInfo } from './types';

/** One surah, generated with the pinned official Quran Lab quran-g2p tj3 renderer. */
export interface HafsReferenceBundle {
  format: 'quralingo.hafs-tj3/1';
  reading: 'ayah-end';
  surah: number;
  vocabulary: readonly string[];
  source: { repository: string; revision: string; textSha256: string; vocabularySha256: string };
  /** Ayah number -> source word order -> tj3 token IDs. */
  ayahs: Readonly<Record<string, readonly (readonly number[])[]>>;
}

/** No files or network requests: the host loads/bundles the surahs it needs. */
export function createHafsReferenceProvider(input: HafsReferenceBundle | readonly HafsReferenceBundle[]): AyahReferenceProvider {
  const bundles = new Map<number, HafsReferenceBundle>();
  const inputs: readonly HafsReferenceBundle[] = Array.isArray(input) ? input : [input as HafsReferenceBundle];
  let vocabulary: readonly string[] | undefined;
  let revision: string | undefined;
  let textHash: string | undefined;
  let vocabularyHash: string | undefined;
  for (const bundle of inputs) {
    if (bundle.format !== 'quralingo.hafs-tj3/1' || bundle.reading !== 'ayah-end' ||
        !Number.isInteger(bundle.surah) || bundle.surah < 1 || bundle.surah > 114 || bundles.has(bundle.surah)) throw new Error('Invalid or duplicate Hafs reference bundle');
    if (!/^[0-9a-f]{40}$/.test(bundle.source.revision) || !/^[0-9a-f]{64}$/.test(bundle.source.textSha256) ||
        !/^[0-9a-f]{64}$/.test(bundle.source.vocabularySha256)) throw new Error('Missing reference provenance');
    if (bundle.vocabulary.length !== 38 || bundle.vocabulary[0] !== '<blk>' || bundle.vocabulary[1] !== '|' ||
        new Set(bundle.vocabulary).size !== 38) throw new Error('Invalid tj3 vocabulary');
    if (vocabulary && (JSON.stringify(vocabulary) !== JSON.stringify(bundle.vocabulary) || revision !== bundle.source.revision ||
        textHash !== bundle.source.textSha256 || vocabularyHash !== bundle.source.vocabularySha256)) throw new Error('Mixed reference revisions/vocabularies');
    vocabulary = [...bundle.vocabulary]; revision = bundle.source.revision;
    textHash = bundle.source.textSha256; vocabularyHash = bundle.source.vocabularySha256;
    const copy: Record<string, number[][]> = {};
    for (const [ayah, words] of Object.entries(bundle.ayahs)) {
      if (!/^[1-9][0-9]*$/.test(ayah) || !Array.isArray(words) || !words.length) throw new Error('Invalid reference ayah');
      copy[ayah] = words.map(word => {
        if (!Array.isArray(word) || !word.length || word.some(id => !Number.isInteger(id) || id < 2 || id >= 37)) throw new Error('Invalid reference phoneme ID');
        return [...word];
      });
    }
    bundles.set(bundle.surah, { ...bundle, vocabulary: [...bundle.vocabulary], source: { ...bundle.source }, ayahs: copy });
  }
  return {
    resolveAyah(request: ExpectedAyah, model: ModelInfo): ExpectedWord[] {
      const bundle = bundles.get(request.surah);
      if (!bundle) throw new Error(`reference_missing: surah ${request.surah} is not loaded`);
      if (request.reading && request.reading !== bundle.reading) throw new Error('Reference reading context mismatch');
      // Match the complete runtime vocabulary, not merely an inferred model-generation label.
      if (!model.version.startsWith('4.') || model.blank !== 0 || model.wordBar !== 1 ||
          JSON.stringify(model.tokens) !== JSON.stringify(bundle.vocabulary)) throw new Error('reference_incompatible: runtime model does not match this tj3 vocabulary');
      const words = bundle.ayahs[String(request.ayah)];
      if (!words) throw new Error(`reference_missing: ayah ${request.surah}:${request.ayah}`);
      if (request.words && request.words.length !== words.length) throw new Error('Display word count differs from source reference; reconcile word IDs before using feedback');
      return words.map((ids, index) => ({ id: request.words?.[index]?.id ?? `${request.surah}:${request.ayah}:${index + 1}`,
        text: request.words?.[index]?.text, phonemes: ids.map(id => bundle.vocabulary[id]!) }));
    },
  };
}
