export type WordState = 'pending' | 'correct' | 'incorrect' | 'uncertain';
export interface ExpectedWord {
  id: string;
  /** Display text only; never used to guess phonemes. */
  text?: string;
  /** Exact token names from this model's vocabulary, in recitation order. */
  phonemes: readonly string[];
}
export interface ExpectedAyah {
  surah: number;
  ayah: number;
  /** Optional display labels, in reference word order. */
  words?: readonly { id: string; text?: string }[];
  /** Precomputed data currently supports a fresh start and stop at the ayah end. */
  reading?: 'ayah-end';
}
/** Educators author the expected pronunciation; display text never drives recognition. */
export interface ExpectedExercise {
  kind: 'exercise';
  id: string;
  text?: string;
  words: readonly ExpectedWord[];
  /** Instructional intent only. Raw heads are returned; no rule scorer is implied. */
  focus?: readonly ('ghunna' | 'gemination' | 'qalqalah' | 'madd' | 'phonemes')[];
}
export interface AyahReferenceProvider {
  resolveAyah(request: ExpectedAyah, model: ModelInfo): Promise<readonly ExpectedWord[]> | readonly ExpectedWord[];
}
export interface RecitationEngineOptions {
  /** Bundled Hafs by default. Use sdk to rely only on the SDK's optional reference. */
  referenceProvider?: AyahReferenceProvider | 'bundled-hafs' | 'sdk';
}
export interface Token {
  id: number; name: string; firstMs: number; peakMs: number; lastMs: number;
  confidence: number | null;
}
export interface Head {
  name: string; kind: string; frameMs: number; frames: number; classes: number;
  /** Row major SDK output, unscored. Nonfinite values cross the bridge as null. */
  values: (number | null)[];
}
export interface Decoded {
  /** Phoneme transcription, NOT Arabic orthographic ASR text. */
  text: string; tokens: Token[]; settled: number; isFinal: boolean;
}
export interface NativeChunk {
  sessionId: string; index: number; startMs: number; endMs: number;
  backend: string; decoded: Decoded; heads: Head[];
}
export interface WordFeedback {
  id: string; text?: string; state: WordState;
  /** Provisional may revise. Settled judgments can still revise after SDK backend replay. */
  committed: boolean;
  provisionalState?: Exclude<WordState, 'pending'>;
  confidence: number | null; startMs: number | null; endMs: number | null;
  expectedPhonemes: readonly string[]; recognizedPhonemes: string[];
  reason: 'not_reached' | 'provisional' | 'match' | 'substitution' | 'low_confidence' | 'alignment_ambiguous' | 'missing_audio';
}
export interface RecitationResult extends NativeChunk {
  words: WordFeedback[];
  /** Exercise metadata, not a measured Tajweed rule score. */
  exercise?: { id: string; text?: string; focus?: ExpectedExercise['focus'] };
  /** Expected labels for matching words only; not an unconstrained Arabic transcript. */
  matchedText: string;
}
export interface Thresholds {
  /** Minimum token confidence for exact matches. Default .90. */
  correctConfidence: number;
  /** Minimum token confidence for a substitution. Default .95. */
  incorrectConfidence: number;
  /** Max edit distance / expected word length for a substitution. Default .34. */
  maxIncorrectEditRatio: number;
}
export interface Configuration {
  /** Optional when the host has configured its platform key in native app metadata. */
  apiKey?: string;
}
export interface SessionOptions {
  expected: readonly ExpectedWord[] | ExpectedAyah | ExpectedExercise;
  source?: 'microphone' | 'external';
  /** External float samples only: supported SDK rate; default 16000. */
  sampleRate?: number;
  context?: 'c8_l64' | 'c16_l64' | 'c24_l72' | 'c24_l256';
  backend?: 'auto' | 'cpu';
  /** 0 disables auto stop. Default 1500. */
  endOnSilenceMs?: number;
  /** Return all twelve heads instead of the default six. */
  allHeads?: boolean;
  thresholds?: Partial<Thresholds>;
}
export interface ModelInfo {
  version: string; build: string; tokens: string[]; blank: number; wordBar: number | null;
  referenceAvailable: boolean;
  calibration: { json: string; sha256: string } | null;
}
export interface SessionEvent {
  sessionId: string;
  type: 'speechStarted' | 'speechEnded' | 'interrupted' | 'resumed' | 'backendChanged' | 'ended' | 'error';
  atMs?: number; silenceMs?: number; cause?: string; fromChunk?: number;
  backend?: string; reason?: string; code?: string; message?: string;
}
export interface Subscription { remove(): void }
export interface NativeOptions {
  source: 'microphone' | 'external'; sampleRate: number; context: string;
  backend: 'auto' | 'cpu'; endOnSilenceMs: number; allHeads: boolean;
}
/** Injectable only for bridge tests; applications should use recitation. */
export interface NativeBridge {
  configure(config: Configuration): Promise<void>;
  loadModel(): Promise<ModelInfo>;
  getModelStorage?(): Promise<ModelStorage>;
  reference(surah: number, ayah: number): Promise<string[][]>;
  start(sessionId: string, options: NativeOptions): Promise<void>;
  pushAudio(sessionId: string, samples: number[]): Promise<void>;
  stop(sessionId: string): Promise<NativeChunk>;
  cancel(sessionId: string): Promise<void>;
  showSharingSettings(): Promise<void>;
}

export interface ModelDownloadProgress { downloadedBytes: number; totalBytes: number; }
export interface ModelStorage { models: { version: string; build: string; bytes: number }[]; }
