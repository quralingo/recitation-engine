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

/** Reject ambiguous alignments and insertions rather than guessing Arabic letters. */
export function mismatchedPhones(expected: readonly string[], heard: readonly string[]): number[] | null {
  type Cell = { cost: number; ways: number; op: 'delete' | 'insert' | 'pair' | '' };
  const columns = heard.length + 1;
  const cells: Cell[] = Array.from({ length: (expected.length + 1) * columns }, () => ({ cost: 0, ways: 1, op: '' }));
  const at = (i: number, j: number): Cell => cells[i * columns + j]!;
  for (let i = 0; i <= expected.length; i++) for (let j = 0; j <= heard.length; j++) {
    if (!i && !j) continue;
    const choices: Cell[] = [];
    if (i) choices.push({ cost: at(i - 1, j).cost + 1, ways: at(i - 1, j).ways, op: 'delete' });
    if (j) choices.push({ cost: at(i, j - 1).cost + 1, ways: at(i, j - 1).ways, op: 'insert' });
    if (i && j) choices.push({ cost: at(i - 1, j - 1).cost + (expected[i - 1] === heard[j - 1] ? 0 : 1), ways: at(i - 1, j - 1).ways, op: 'pair' });
    const best = Math.min(...choices.map(choice => choice.cost));
    const winners = choices.filter(choice => choice.cost === best);
    cells[i * columns + j] = { cost: best, ways: Math.min(2, winners.reduce((sum, choice) => sum + choice.ways, 0)), op: winners[0]!.op };
  }
  let i = expected.length, j = heard.length;
  if (!heard.length || at(i, j).ways !== 1) return null;
  const wrong: number[] = [];
  while (i || j) {
    const op = at(i, j).op;
    if (op === 'insert') return null;
    if (op === 'delete') { wrong.push(--i); continue; }
    if (expected[i - 1] !== heard[j - 1]) wrong.push(i - 1);
    i--; j--;
  }
  return wrong;
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
    if (!wrong) return null;
    const mapping = map.units[unitIndices[index]!];
    if (!mapping || mapping.length !== unit.expectedPhonemes.length) return null;
    wrong.forEach(phone => spans.push(mapping[phone]!));
  }
  if (!spans.length) return null;
  return displayed.map((group, index) => ({ text: group.text,
    wrong: spans.some(span => span[0] < start + canonical[index]!.end && span[1] > start + canonical[index]!.start),
  }));
}
