import { alignWords, thresholds } from './alignment';
import { createBundledHafsReferenceProvider } from './bundled-reference';
import type { AyahReferenceProvider, Configuration, ExpectedExercise, ExpectedWord, ModelInfo, NativeBridge, NativeChunk, RecitationResult,
  RecitationEngineOptions, SessionEvent, SessionOptions, Subscription, ModelDownloadProgress, ModelStorage } from './types';

export class RecitationEngine {
  private model?: ModelInfo;
  private referenceProvider?: AyahReferenceProvider;
  private configured = false;
  private pendingStart?: { cancelled: boolean; finished: Promise<void>; finish(): void };
  private session?: { id: string; words: ExpectedWord[]; options: SessionOptions; active: boolean; final?: RecitationResult;
    exercise?: RecitationResult['exercise']; lastChunk?: NativeChunk; speechEndedAt?: number };
  private sequence = 0;
  private busy = false;
  private resultListeners = new Set<(r: RecitationResult) => void>();
  private eventListeners = new Set<(e: SessionEvent) => void>();
  private downloadListeners = new Set<(progress: ModelDownloadProgress) => void>();
  private pendingAudio = 0;
  private audioTail: Promise<void> = Promise.resolve();
  constructor(private readonly bridge: NativeBridge, options: RecitationEngineOptions = {}) {
    this.referenceProvider = options.referenceProvider === 'sdk' ? undefined
      : !options.referenceProvider || options.referenceProvider === 'bundled-hafs'
        ? createBundledHafsReferenceProvider() : options.referenceProvider;
  }

  private async ensureConfigured(): Promise<void> {
    if (!this.configured) {
      await this.bridge.configure({ audience: 'children' });
      this.configured = true;
    }
  }
  private async ensureModel(): Promise<ModelInfo> {
    await this.ensureConfigured();
    return this.model ??= await this.bridge.loadModel();
  }

  /** Register app-bundled reference data without adding runtime networking to this package. */
  setReferenceProvider(provider?: AyahReferenceProvider): void {
    if (this.busy || this.session?.active) throw new Error('Set reference provider between sessions');
    this.referenceProvider = provider;
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('A lifecycle operation is already in progress');
    this.busy = true;
    try { return await action(); } finally { this.busy = false; }
  }
  configure(config: Configuration = {}): Promise<void> {
    return this.exclusive(async () => {
      if (this.session?.active) throw new Error('Stop the session before configuring');
      if (config.apiKey !== undefined && !config.apiKey.trim()) throw new Error('apiKey must be nonempty when supplied');
      await this.bridge.configure({ ...config, audience: config.audience ?? 'children' });
      this.configured = true;
      this.model = undefined; this.session = undefined;
    });
  }
  loadModel(): Promise<ModelInfo> {
    return this.exclusive(async () => {
      if (this.session?.active) throw new Error('Stop the session before loading a model');
      return this.ensureModel();
    });
  }
  getModelStorage(): Promise<ModelStorage> {
    return this.exclusive(async () => {
      await this.ensureConfigured();
      if (!this.bridge.getModelStorage) throw new Error('Rebuild the app to enable offline recitation setup.');
      return this.bridge.getModelStorage();
    });
  }
  onModelDownloadProgress(listener: (progress: ModelDownloadProgress) => void): Subscription {
    this.downloadListeners.add(listener);
    return { remove: () => { this.downloadListeners.delete(listener); } };
  }
  acceptModelDownloadProgress(progress: ModelDownloadProgress): void {
    if (!Number.isFinite(progress.downloadedBytes) || !Number.isFinite(progress.totalBytes) ||
        progress.downloadedBytes < 0 || progress.totalBytes < 0) return;
    for (const listener of this.downloadListeners) listener(progress);
  }
  start(options: SessionOptions): Promise<string> {
    return this.exclusive(async () => {
      if (this.session?.active) throw new Error('A session is already running');
      let finish!: () => void;
      const request = { cancelled: false, finished: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish() };
      this.pendingStart = request;
      try {
        const model = await this.ensureModel();
        if (request.cancelled) throw new Error('cancelled: session start was cancelled');
        thresholds(options.thresholds);
        const sampleRate = options.sampleRate ?? 16000;
        if (![8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate)) throw new Error('Unsupported SDK sampleRate');
        const endOnSilenceMs = options.endOnSilenceMs ?? 1500;
        if (!Number.isInteger(endOnSilenceMs) || (endOnSilenceMs !== 0 && (endOnSilenceMs < 500 || endOnSilenceMs > 60000))) throw new Error('endOnSilenceMs must be 0 or 500..60000');
        let words: ExpectedWord[];
        if (Array.isArray(options.expected)) {
          words = options.expected.map(w => ({ ...w, phonemes: [...w.phonemes] }));
        } else if ('kind' in options.expected && options.expected.kind === 'exercise') {
          if (!options.expected.id?.trim()) throw new Error('Exercise id is required');
          const exercise = options.expected as ExpectedExercise;
          if (exercise.focus?.some(f => !['ghunna', 'gemination', 'qalqalah', 'madd', 'phonemes'].includes(f))) throw new Error('Unknown exercise focus');
          words = exercise.words.map(w => ({ ...w, phonemes: [...w.phonemes] }));
        } else {
          const ayah = options.expected as import('./types').ExpectedAyah;
          if (!Number.isInteger(ayah.surah) || !Number.isInteger(ayah.ayah) || ayah.surah < 1 || ayah.surah > 114 || ayah.ayah < 1) throw new Error('Invalid ayah');
          if (ayah.reading && ayah.reading !== 'ayah-end') throw new Error('Unsupported reading context');
          if (this.referenceProvider) {
            const resolved = await this.referenceProvider.resolveAyah(ayah, model);
            words = resolved.map(w => ({ ...w, phonemes: [...w.phonemes] }));
          } else {
            if (!model.referenceAvailable) throw new Error('reference_missing: register bundled Hafs data or supply verified phonemes');
            const phones = await this.bridge.reference(ayah.surah, ayah.ayah);
            if (ayah.words && ayah.words.length !== phones.length) throw new Error('Display word count differs from SDK reference');
            words = phones.map((phonemes, i) => ({ id: ayah.words?.[i]?.id ?? `${ayah.surah}:${ayah.ayah}:${i + 1}`,
              text: ayah.words?.[i]?.text, phonemes }));
          }
        }
        if (!words.length || words.length > 256 || words.reduce((n, w) => n + w.phonemes.length, 0) > 2048) throw new Error('Expected sequence must have 1..256 words and at most 2048 phonemes');
        const ids = new Set<string>();
        const vocabulary = new Set(model.tokens.filter((_, i) => i !== model.blank && i !== model.wordBar));
        for (const w of words) {
          if (!w.id || ids.has(w.id) || !w.phonemes.length || w.phonemes.some(p => !vocabulary.has(p))) throw new Error('Words need unique ids and nonempty phonemes from the model vocabulary (no blank or word bars)');
          ids.add(w.id);
        }
        const id = `recitation-${++this.sequence}`;
        if (request.cancelled) throw new Error('cancelled: session start was cancelled');
        const expected = options.expected;
        const exercise = !Array.isArray(expected) && 'kind' in expected && expected.kind === 'exercise'
          ? { id: expected.id, text: expected.text, focus: expected.focus ? [...expected.focus] : undefined } : undefined;
        this.session = { id, words, options: { ...options, thresholds: thresholds(options.thresholds) }, exercise, active: true };
        try {
          await this.bridge.start(id, { source: options.source ?? 'microphone', sampleRate,
            context: options.context ?? 'c16_l64', backend: options.backend ?? 'auto', endOnSilenceMs,
            allHeads: options.allHeads ?? true });
          if (request.cancelled) {
            await this.bridge.cancel(id);
            throw new Error('cancelled: session start was cancelled');
          }
        } catch (error) { this.session = undefined; throw error; }
        return id;
      } finally { this.pendingStart = undefined; request.finish(); }
    });
  }
  /** Float32 mono -1..1. Await each call; chunks are limited to one second. */
  pushAudio(samples: readonly number[] | Float32Array): Promise<void> {
    const s = this.session;
    if (!s?.active || s.options.source !== 'external' || this.busy) return Promise.reject(new Error('No external session accepting audio'));
    if (!samples.length || samples.length > (s.options.sampleRate ?? 16000) || Array.from(samples).some(v => !Number.isFinite(v) || Math.abs(v) > 1)) return Promise.reject(new Error('Supply at most one second of finite mono samples in -1..1'));
    if (this.pendingAudio >= 4) return Promise.reject(new Error('audio_backpressure: await pushAudio before sending more'));
    const data = Array.from(samples);
    this.pendingAudio++;
    const task = this.audioTail.then(() => this.bridge.pushAudio(s.id, data));
    this.audioTail = task.catch(() => {}).finally(() => { this.pendingAudio--; });
    return task;
  }
  stop(): Promise<RecitationResult> {
    return this.exclusive(async () => {
      const s = this.session;
      if (!s) throw new Error('No session');
      if (s.final) return s.final;
      s.active = false;
      await this.audioTail;
      const chunk = await this.bridge.stop(s.id);
      this.acceptChunk(chunk);
      if (!s.final) throw new Error('SDK did not return final output');
      return s.final;
    });
  }
  cancel(): Promise<void> {
    if (this.pendingStart) {
      this.pendingStart.cancelled = true;
      return this.pendingStart.finished;
    }
    return this.exclusive(async () => {
      const s = this.session;
      if (!s) return;
      s.active = false;
      await this.audioTail;
      this.session = undefined;
      await this.bridge.cancel(s.id);
    });
  }
  showSharingSettings(): Promise<void> { return this.bridge.showSharingSettings(); }
  onResult(listener: (result: RecitationResult) => void): Subscription {
    this.resultListeners.add(listener); return { remove: () => { this.resultListeners.delete(listener); } };
  }
  onEvent(listener: (event: SessionEvent) => void): Subscription {
    this.eventListeners.add(listener); return { remove: () => { this.eventListeners.delete(listener); } };
  }
  /** Bridge entry point. Session ids discard late events from previous takes. */
  acceptChunk(chunk: NativeChunk): void {
    if (this.pendingStart?.cancelled) return;
    const s = this.session;
    if (!s || chunk.sessionId !== s.id || s.final) return;
    s.lastChunk = chunk;
    // Bound alignment memory/work for long or unrelated recitations; keep raw output intact.
    const words = chunk.decoded.tokens.length <= 4096
      ? alignWords(s.words, chunk.decoded, this.model?.wordBar ?? null, thresholds(s.options.thresholds), s.speechEndedAt)
      : s.words.map(w => ({ id: w.id, text: w.text, state: 'uncertain' as const, committed: false,
          confidence: null, startMs: null, endMs: null, expectedPhonemes: w.phonemes,
          recognizedPhonemes: [], reason: 'alignment_ambiguous' as const }));
    const exercise = s.exercise ? { ...s.exercise, focus: s.exercise.focus ? [...s.exercise.focus] : undefined } : undefined;
    const result = { ...chunk, words, exercise, matchedText: words.filter(w => w.state === 'correct').map(w => w.text ?? '').filter(Boolean).join(' ') };
    if (chunk.decoded.isFinal) { s.final = result; s.active = false; }
    for (const listener of this.resultListeners) listener(result);
  }
  acceptEvent(event: SessionEvent): void {
    if (this.pendingStart?.cancelled) return;
    if (event.sessionId !== this.session?.id) return;
    if (event.type === 'speechStarted') this.session.speechEndedAt = undefined;
    if (event.type === 'speechEnded' && event.atMs !== undefined) {
      this.session.speechEndedAt = event.atMs + (event.silenceMs ?? 0);
      // Re-evaluate the last settled word without ending microphone capture.
      if (this.session.lastChunk) this.acceptChunk(this.session.lastChunk);
    }
    if (event.type === 'error' || event.type === 'ended') this.session.active = false;
    for (const listener of this.eventListeners) listener(event);
  }
}

/** Convert existing signed 16-bit little-endian PCM buffers to the SDK's float samples. */
export function pcm16leToFloat32(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 2) throw new Error('PCM16 buffer must have an even byte length');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({length: bytes.byteLength / 2}, (_, i) => view.getInt16(i * 2, true) / 32768);
}
