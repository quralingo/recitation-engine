import type { Decoded, ExpectedWord, Thresholds, Token, WordFeedback } from './types';

export const DEFAULT_THRESHOLDS: Readonly<Thresholds> = Object.freeze({
  correctConfidence: .90, incorrectConfidence: .95, maxIncorrectEditRatio: .34,
});

export function thresholds(input: Partial<Thresholds> = {}): Thresholds {
  const t = { ...DEFAULT_THRESHOLDS, ...input };
  for (const value of Object.values(t)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Thresholds must be in 0..1');
  }
  if (t.incorrectConfidence < t.correctConfidence) throw new Error('incorrectConfidence must be >= correctConfidence');
  return t;
}

interface HeardWord { tokens: Token[]; indexes: number[]; closed: boolean; settled: boolean }
function split(decoded: Decoded, bar: number | null): HeardWord[] {
  const result: HeardWord[] = [];
  let tokens: Token[] = [], indexes: number[] = [];
  const flush = (closed: boolean, boundaryIndex: number) => {
    if (tokens.length) result.push({ tokens, indexes, closed,
      settled: decoded.isFinal || (closed && boundaryIndex < decoded.settled) });
    tokens = []; indexes = [];
  };
  decoded.tokens.forEach((t, i) => {
    if (t.id === bar) flush(true, i);
    else { tokens.push(t); indexes.push(i); }
  });
  flush(decoded.isFinal, decoded.tokens.length - 1);
  return result;
}
export function editDistance(a: readonly string[], b: readonly string[]): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next[j + 1] = Math.min(
      next[j]! + 1, row[j + 1]! + 1, row[j]! + (a[i] === b[j] ? 0 : 1));
    row = next;
  }
  return row[b.length]!;
}

/** Global word alignment with a free unrecited suffix. Equal-cost paths suppress judgments. */
function align(expected: readonly ExpectedWord[], decoded: Decoded,
  bar: number | null, config: Thresholds = DEFAULT_THRESHOLDS): WordFeedback[] {
  const heard = split(decoded, bar);
  const n = expected.length, m = heard.length;
  const costs = Array.from({length: n + 1}, () => new Array<number>(m + 1).fill(Infinity));
  const ways = Array.from({length: n + 1}, () => new Array<number>(m + 1).fill(0));
  const ops = Array.from({length: n + 1}, () => new Array<string>(m + 1).fill(''));
  costs[0]![0] = 0; ways[0]![0] = 1;
  const distance = (i: number, j: number) => editDistance(expected[i]!.phonemes, heard[j]!.tokens.map(t => t.name)) /
    Math.max(expected[i]!.phonemes.length, heard[j]!.tokens.length, 1);
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    if (!i && !j) continue;
    const candidates: [number, string, number][] = [];
    if (i) candidates.push([costs[i - 1]![j]! + 1, 'delete', ways[i - 1]![j]!]);
    if (j) candidates.push([costs[i]![j - 1]! + 1, 'insert', ways[i]![j - 1]!]);
    if (i && j) candidates.push([costs[i - 1]![j - 1]! + distance(i - 1, j - 1), 'pair', ways[i - 1]![j - 1]!]);
    const best = Math.min(...candidates.map(c => c[0]));
    const winners = candidates.filter(c => Math.abs(c[0] - best) < 1e-9);
    costs[i]![j] = best; ops[i]![j] = winners[0]![1];
    ways[i]![j] = Math.min(2, winners.reduce((s, c) => s + c[2], 0));
  }
  const endpoints = Array.from({length: n + 1}, (_, i) => i);
  const best = Math.min(...endpoints.map(i => costs[i]![m]!));
  const winners = endpoints.filter(i => Math.abs(costs[i]![m]! - best) < 1e-9);
  let i = winners[0]!, j = m;
  const ambiguous = winners.length > 1 || ways[i]![j]! > 1;
  const pairs = new Map<number, number>();
  const deleted = new Set<number>();
  while (i || j) {
    const op = ops[i]![j];
    if (op === 'pair') { pairs.set(--i, --j); }
    else if (op === 'delete') deleted.add(--i);
    else if (op === 'insert') --j;
    else break;
  }
  return expected.map((word, wi): WordFeedback => {
    const hi = pairs.get(wi), h = hi === undefined ? undefined : heard[hi];
    const base = { id: word.id, text: word.text, expectedPhonemes: word.phonemes,
      recognizedPhonemes: h?.tokens.map(t => t.name) ?? [],
      startMs: h?.tokens[0]?.firstMs ?? null, endMs: h?.tokens.at(-1)?.lastMs ?? null,
      confidence: h && h.tokens.every(t => t.confidence !== null && Number.isFinite(t.confidence))
        ? Math.min(...h.tokens.map(t => t.confidence!)) : null };
    if (!h) return { ...base, state: deleted.has(wi) || decoded.isFinal ? 'uncertain' : 'pending', committed: false,
      reason: deleted.has(wi) || decoded.isFinal ? 'missing_audio' : 'not_reached' };
    const ratio = editDistance(word.phonemes, base.recognizedPhonemes) / Math.max(word.phonemes.length, 1);
    const exactUnique = ratio === 0 && expected.filter(w =>
      w.phonemes.length === word.phonemes.length && w.phonemes.every((p, i) => p === word.phonemes[i])).length === 1;
    const state = ambiguous && !exactUnique ? 'uncertain' : base.confidence === null ? 'uncertain'
      : ratio === 0 && base.confidence >= config.correctConfidence ? 'correct'
      : ratio > 0 && ratio <= config.maxIncorrectEditRatio && base.confidence >= config.incorrectConfidence ? 'incorrect' : 'uncertain';
    if (!h.settled) return { ...base, state: 'pending', committed: false, provisionalState: state, reason: 'provisional' };
    return { ...base, state, committed: state !== 'uncertain', reason: ambiguous && !exactUnique ? 'alignment_ambiguous'
      : state === 'correct' ? 'match' : state === 'incorrect' ? 'substitution' : 'low_confidence' };
  });
}

/** Recover boundaries from exact reference anchors and actual pauses, never
 * from a guessed Arabic transcription. An error must not disable later anchors.
 * endMs is supplied only after SDK VAD reports an utterance end; CTC token
 * timestamp gaps can be sustained vowels and must never stand in for silence.
 */
function exactBoundaries(expected: readonly ExpectedWord[], decoded: Decoded, bar: number | null, endMs?: number): Decoded {
  if (bar === null || !decoded.tokens.length) return decoded;
  // SDK VAD has already established silence. Do not require a second delay.
  const paused = endMs !== undefined && Number.isFinite(endMs) &&
    endMs >= decoded.tokens.at(-1)!.lastMs && decoded.settled >= decoded.tokens.length;
  if (decoded.tokens.some(t => t.id === bar)) {
    const last = decoded.tokens.at(-1)!;
    if (!paused || last.id === bar) return decoded;
    return { ...decoded, tokens: [...decoded.tokens, { ...last, id: bar, name: '|', confidence: null }],
      settled: decoded.settled + 1 };
  }
  const boundaries = new Set<number>();
  const names = decoded.tokens.map(token => token.name);
  const phones = expected.flatMap(word => word.phonemes);
  const wholePrefix = names.length <= phones.length && names.every((name, i) => name === phones[i]);
  for (const word of expected) {
    if (word.phonemes.length < 2 && !wholePrefix) continue;
    for (let start = 0; start + word.phonemes.length <= names.length; start++) {
      if (!word.phonemes.every((phone, i) => phone === names[start + i])) continue;
      // Do not cut a longer reference word at an embedded shorter word.
      const end = start + word.phonemes.length;
      const embedded = expected.some(other => other.phonemes.length > word.phonemes.length &&
        other.phonemes.some((_, offset) => {
          const outerStart = start - offset;
          return outerStart >= 0 && outerStart + other.phonemes.length <= names.length &&
            other.phonemes.every((phone, i) => phone === names[outerStart + i]);
        }));
      if (!embedded) { if (start > 0) boundaries.add(start); boundaries.add(end); }
    }
  }
  if (paused) boundaries.add(decoded.tokens.length);
  const tokens: Token[] = [];
  let settled = 0;
  decoded.tokens.forEach((token, i) => {
    tokens.push(token);
    if (i < decoded.settled) settled++;
    if (boundaries.has(i + 1) && (i + 1 < decoded.tokens.length || decoded.isFinal || paused)) {
      tokens.push({ ...token, id: bar, name: '|', confidence: null });
      if (i + 1 < decoded.settled || decoded.isFinal || paused) settled++;
    }
  });
  return { ...decoded, tokens, settled };
}

/** Tentative phones cannot influence a committed alignment. */
export function alignWords(expected: readonly ExpectedWord[], decoded: Decoded,
  bar: number | null, config: Thresholds = DEFAULT_THRESHOLDS, endMs?: number): WordFeedback[] {
  decoded = exactBoundaries(expected, decoded, bar, endMs);
  const full = align(expected, decoded, bar, config);
  if (decoded.isFinal) return full;
  let lastBoundary = -1;
  for (let i = 0; i < decoded.settled; i++) if (decoded.tokens[i]?.id === bar) lastBoundary = i;
  const settled = align(expected, { ...decoded, tokens: decoded.tokens.slice(0, lastBoundary + 1),
    settled: lastBoundary + 1 }, bar, config);
  return full.map((word, i) => {
    const stable = settled[i]!;
    if (stable.state !== 'pending') return stable;
    return { ...word, state: 'pending', committed: false, provisionalState: word.provisionalState ??
      (word.state === 'pending' ? undefined : word.state), reason: word.reason === 'not_reached' ? 'not_reached' : 'provisional' };
  });
}
