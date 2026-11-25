import type { WordFeedback } from './types';
import { LETTER_MAP_ASSET } from './letter-map-asset';

/** Spans use Unicode code-point offsets into the canonical ayah text. */
export interface LetterMap { text: string; units: [number, number][][] }
export interface LetterPart { text: string; wrong: boolean }
export interface LetterMapBundle {
  schemaVersion: 1;
  version: string;
  referenceSha256: string;
  license: string;
  sourceNotice: string;
  surahs: Record<string, Record<string, LetterMap>>;
}

/** Validate after the host verifies the downloaded file's SHA-256 and byte size. */
export function parseLetterMapBundle(value: unknown): LetterMapBundle {
  if (!value || typeof value !== 'object') throw new Error('Invalid letter-map bundle');
  const data = value as Partial<LetterMapBundle>;
  if (data.schemaVersion !== 1 || data.version !== LETTER_MAP_ASSET.version ||
      data.referenceSha256 !== LETTER_MAP_ASSET.referenceSha256 ||
      typeof data.license !== 'string' || !data.license ||
      typeof data.sourceNotice !== 'string' || !data.sourceNotice ||
      !data.surahs || typeof data.surahs !== 'object' || Array.isArray(data.surahs) ||
      Object.keys(data.surahs).length !== 114) throw new Error('Incompatible letter-map bundle');
  let count = 0;
  for (let surah = 1; surah <= 114; surah++) {
    const ayahs = data.surahs[String(surah).padStart(3, '0')];
    if (!ayahs || typeof ayahs !== 'object' || Array.isArray(ayahs)) throw new Error('Missing letter-map surah');
    const total = LETTER_MAP_ASSET.ayahCounts[surah - 1]!;
    if (Object.keys(ayahs).length !== total) throw new Error('Incomplete letter-map surah');
    for (let ayah = 1; ayah <= total; ayah++) {
      const map = ayahs[String(ayah)];
      if (!map || typeof map.text !== 'string' || !map.text || !Array.isArray(map.units) || !map.units.length)
        throw new Error('Invalid letter map');
      const length = Array.from(map.text).length;
      for (const unit of map.units) {
        if (!Array.isArray(unit) || !unit.length || unit.some(span =>
          !Array.isArray(span) || span.length !== 2 || !Number.isInteger(span[0]) ||
          !Number.isInteger(span[1]) || span[0] < 0 || span[0] >= span[1] || span[1] > length
        )) throw new Error('Invalid letter-map spans');
      }
      count++;
    }
  }
  if (count !== 6236) throw new Error('Incomplete letter-map bundle');
  return data as LetterMapBundle;
}

/** Return only wrong expected phones shared by every minimum-edit alignment.
 * Insertions have no Arabic letter of their own; ambiguity must not erase a
 * separate substitution that all alignments agree on. */
export function mismatchedPhones(expected: readonly string[], heard: readonly string[]): number[] | null {
  if (!heard.length) return null;
  const costs = Array.from({ length: expected.length + 1 }, () => new Array<number>(heard.length + 1).fill(0));
  const certain = new Map<string, Set<number>>();
  for (let i = 0; i <= expected.length; i++) for (let j = 0; j <= heard.length; j++) {
    if (!i && !j) { certain.set('0:0', new Set()); continue; }
    const choices: { cost: number; wrong: Set<number> }[] = [];
    const add = (pi: number, pj: number, extra: number, wrongIndex?: number) => {
      const wrong = new Set(certain.get(`${pi}:${pj}`)!);
      if (wrongIndex !== undefined) wrong.add(wrongIndex);
      choices.push({ cost: costs[pi]![pj]! + extra, wrong });
    };
    if (i) add(i - 1, j, 1, i - 1);
    if (j) add(i, j - 1, 1);
    if (i && j) {
      const different = expected[i - 1] !== heard[j - 1];
      add(i - 1, j - 1, different ? 1 : 0, different ? i - 1 : undefined);
    }
    const best = Math.min(...choices.map(choice => choice.cost));
    const winners = choices.filter(choice => choice.cost === best);
    costs[i]![j] = best;
    certain.set(`${i}:${j}`, new Set([...winners[0]!.wrong].filter(index =>
      winners.every(choice => choice.wrong.has(index)))));
  }
  const wrong = [...certain.get(`${expected.length}:${heard.length}`)!].sort((a, b) => a - b);
  return wrong.length || costs[expected.length]![heard.length] === 0 ? wrong : null;
}

function letterGroups(text: string) {
  const groups: { text: string; start: number; end: number }[] = [];
  Array.from(text).forEach((character, index) => {
    const previous = groups[groups.length - 1];
    if ((/\p{M}/u.test(character) || character === '\u0640') && previous) {
      previous.text += character;
      previous.end = index + 1;
    } else groups.push({ text: character, start: index, end: index + 1 });
  });
  return groups;
}
const normalizeGroup = (text: string) => text.replace(/\u0640/g, '').normalize('NFD');

/** Pure mapping; hosts supply the downloaded ayah map and their display-word unit indices. */
export function mapWordLetters(
  map: LetterMap | undefined,
  text: string,
  units: readonly Pick<WordFeedback, 'expectedPhonemes' | 'recognizedPhonemes'>[],
  unitIndices: readonly number[],
): LetterPart[] | null {
  if (!map || !units.length || units.length !== unitIndices.length ||
      unitIndices.some(index => !Number.isInteger(index) || index < 0)) return null;
  const allSpans = unitIndices.flatMap(index => map.units[index] ?? []);
  if (!allSpans.length) return null;
  const source = Array.from(map.text);
  let start = Math.min(...allSpans.map(span => span[0]));
  let end = Math.max(...allSpans.map(span => span[1]));
  while (start > 0 && !/\s/u.test(source[start - 1]!)) start--;
  while (end < source.length && !/\s/u.test(source[end]!)) end++;
  const canonical = letterGroups(source.slice(start, end).join(''));
  const displayed = letterGroups(text);
  if (canonical.length !== displayed.length || canonical.some((group, index) =>
    normalizeGroup(group.text) !== normalizeGroup(displayed[index]!.text))) return null;
  const spans: [number, number][] = [];
  for (let index = 0; index < units.length; index++) {
    const unit = units[index]!;
    const wrong = mismatchedPhones(unit.expectedPhonemes, unit.recognizedPhonemes);
    const mapping = map.units[unitIndices[index]!];
    if (!mapping || mapping.length !== unit.expectedPhonemes.length) return null;
    wrong?.forEach(phone => spans.push(mapping[phone]!));
  }
  if (!spans.length) return null;
  return displayed.map((group, index) => ({ text: group.text,
    wrong: spans.some(span => span[0] < start + canonical[index]!.end && span[1] > start + canonical[index]!.start),
  }));
}
