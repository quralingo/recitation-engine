# How word feedback is derived

The SDK is inference-only. These are Quralingo wrapper heuristics, not Quran Lab's
scorer, not empirically calibrated verdicts, and not religious rulings.

1. Read the SDK's cumulative decoded tokens. Split at its vocabulary's word-bar
   ID. Timing is copied from the first/last token (lastMs is the start of the last
   SDK frame, not an independently measured acoustic end).
2. Align heard words to the expected sequence with dynamic programming. Pair cost
   is normalized phoneme Levenshtein distance, insertion/deletion cost is 1, and
   an unrecited expected suffix is free. It assumes recitation starts at the first
   expected word; choose the expected range accordingly. Tied best paths suppress
   judgments globally. Repetition, missing word bars, joins and pauses can confuse
   this heuristic. Extra recognized words remain visible in raw output; no invented
   expected word is added for them.
3. A word is settled only after its closing word bar is inside `decoded.settled`,
   or on `isFinal`. Partial word tails remain pending with a provisionalState.
   Run committed alignment on settled, closed words alone so provisional phones
   cannot affect committed judgments. Recompute each snapshot; later settled
   evidence may resolve/reassign an alignment. `committed` means based on settled
   acoustic output, not an immutable assertion about the expected-word mapping.
   Backend failover can replay tokens/chunks, so consumers must replace snapshots.
4. Take minimum token confidence. Missing/nonfinite confidence suppresses confident
   judgments. Confidence is the SDK's display quantity, NOT a calibrated probability
   of recitation correctness; the two SDKs derive it differently.
5. Exact phoneme match with confidence >= .90 -> correct. A nonzero edit ratio
   <= .34 and confidence >= .95 -> incorrect. Everything else -> uncertain.
   Missing words/audio -> uncertain, never automatically incorrect. Words beyond
   the recited prefix -> pending until final. Very different words remain uncertain
   to avoid calling unrelated/noisy audio a definite pronunciation error.

Configure `thresholds: { correctConfidence, incorrectConfidence,
maxIncorrectEditRatio }` per session. Values must be finite in 0..1 and the incorrect
confidence threshold cannot be below the correct threshold. These defaults favor
abstention but need calibration with real learners (especially children), devices,
noise, dialects and teacher-reviewed mistakes before production judgment claims.

Raw gemination, madd/lengthening, ghunna, qalqalah and other heads are returned
unchanged. They are NOT incorporated into the word correctness heuristic. Thus an
exact token match does not certify every Tajweed rule. Model calibration JSON and
SHA-256 are exposed as data, not blindly applied: its class thresholds use site
scores/units different from these word confidence thresholds. Any future tajweed
scorer must respect class status (off/experimental vs validated), model/token hash,
context and score units; never substitute a probability threshold for a nats score.

Reference phonemes must match the exact model vocabulary and recitation context.
Do not transcribe Quran phonemes from memory or use an old V3 lexicon with V4.
Ayah-only mode uses SDK verified reference if present and fails if absent. On the
current model build a caller-supplied, reviewed reference is required.
