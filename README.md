# @quranlingoapp/recitation

Independent, typed React Native wrapper for **Quran Lab TajweedFormer V4**.
Streams phoneme transcription, timing, confidence and raw Tajweed heads on the
device, with conservative expected-word feedback. No application UI, app analytics,
app networking, React hooks or global store. Android SDK **3.1.5**, Apple SDK **3.1.4**.

Automatic tajweed feedback can be wrong and does not replace a qualified teacher.
`correct` means a confident phoneme-sequence match under this wrapper's heuristic;
it is not a tajweed certification or a religious ruling.

## Install

```sh
npm install @quranlingoapp/recitation
```

Use a native React Native app or Expo development build; Expo Go cannot load this
module. React Native >=0.79 <0.86 is the intended peer range (native compatibility
needs device validation; see docs/validation.md). Uses native-module interop,
not a codegen TurboModule. Requires JDK 17, Android API 26+, compile SDK 35, and
Xcode 16+ on Apple silicon. iOS minimum is max(15.1, your React Native minimum).
Intel iOS simulators are unsupported by the upstream SDK.

Android: autolinking adds the module and Maven Central dependency. Ensure the host
resolves `google()` and `mavenCentral()` (including settings-level repositories).
The upstream manifest declares microphone/network and background-worker permissions.

iOS: CocoaPods links the bridge, and Swift Package Manager links the official SDK.
The supported initial integration uses **dynamic frameworks**; static linkage is
not supported by this package's SPM helper. Check compatibility with other native
dependencies before integration. Add this to your `ios/Podfile` (merge into the
existing post_install):

```ruby
require_relative '../node_modules/@quranlingoapp/recitation/ios/spm'

use_frameworks! :linkage => :dynamic

post_install do |installer|
  # Keep your existing react_native_post_install(...) here first.
  quralingo_recitation_spm(installer)
end
```

Run `pod install`, open the app's `.xcworkspace` and let Xcode resolve packages.
This helper pins the SDK product on the QuralingoRecitation pod target; do not add
a second manually copied SDK or engine binary. Add `NSMicrophoneUsageDescription`
to the host Info.plist. Resolve SPM packages in CI before building the workspace.
The pod helper has been structurally tested with Xcodeproj; an actual app build
remains necessary.

Each host needs approved Android/iOS keys for its package/bundle identifiers from
https://sdk.quranlab.ai. Never publish keys in this package. The official Client
handles initial model download, signature checking, storage and access refresh.

## Use

```ts
import { getRecitation } from '@quranlingoapp/recitation';

const engine = getRecitation(); // One per JS runtime/process.
await engine.configure({ apiKey: platformKey, audience: 'children' });
const model = await engine.loadModel();

const results = engine.onResult(result => {
  // Replace the preceding snapshot in your UI.
  renderWords(result.words);
  renderPhonemes(result.decoded.text);
  // result.decoded.isFinal, tokens, heads, backend, sessionId, index
});
const events = engine.onEvent(event => handleSessionEvent(event));

await engine.start({ expected: verifiedWords });
const final = await engine.stop(); // Or await natural final via onResult.
results.remove();
events.remove();
```

`verifiedWords` is an array of `{ id, text?, phonemes: string[] }`. `text` is a display
label; `phonemes` must use the loaded model's token names and reviewed recitation
context (joining/pausing matters). Blanks and word bars are rejected in individual
words. Never fabricate phonemes from Arabic spelling. Limits: 256 words and 2048
expected phonemes per session. Long/unaligned takes beyond 4096 recognized tokens
continue returning raw results but suppress word judgments to bound alignment work.

Alternatively:

```ts
await engine.start({ expected: { surah: 1, ayah: 1, words: displayLabels } });
```

This downloads/verifies the SDK reference on demand **if available**, and maps its
units to words (Android word bars; Apple explicit word starts). Current upstream
3.1.5/3.1.4 model builds expose no reference. Register an app-bundled Hafs reference
provider as shown below, or supply reviewed word phonemes. Without either, the
request fails explicitly with `reference_missing`. `loadModel()` exposes the
vocabulary, blank/bar IDs, calibration JSON/hash and reference availability.

## Offline Hafs reference and educator exercises (beta.1)

The source repository now includes `mobile-reference/`: deterministic precomputed
data for all 114 surahs / 6,236 ayat, generated from Quran Lab's pinned `quran-g2p`
revision and its official **tj3** renderer. There is no handwritten letter mapping.
The 114 phoneme JSON files total about 1.6 MB and are intentionally distributed
separately from npm so apps can bundle only what they need.

Copy `mobile-reference/surahs/` into the app's assets. For example:

```ts
import { getRecitation, createHafsReferenceProvider } from '@quranlingoapp/recitation';
import type { HafsReferenceBundle } from '@quranlingoapp/recitation';

const fatiha = require('./assets/recitation/surahs/001.json') as HafsReferenceBundle;
const engine = getRecitation();
engine.setReferenceProvider(createHafsReferenceProvider(fatiha));
// Configure and load the native model as usual, then:
await engine.start({ expected: { surah: 1, ayah: 1 } });
```

Pass an array of bundles to support several surahs. The provider checks the entire
runtime model vocabulary, blank/bar IDs and V4 generation before returning phones;
it rejects incompatibility instead of silently remapping sounds. It checks schema,
provenance fields and token IDs, but does not cryptographically authenticate imported
JSON at runtime. Verify manifest hashes during asset preparation. Register/swap
providers between sessions; native SDK reference takes precedence when available.

These files describe **full-ayah ibtida to ayah-end waqf**, with connected words
inside each ayah, Hafs/Shatibiyyah and upstream default choices. They cannot be
cropped to invent isolated-word pronunciation, arbitrary mid-ayah starts/stops or
cross-ayah wasl. Word positions are the source engine's indices; reconcile them
with your app's display edition before highlighting. See `docs/reference-data.md`.

Educators can also provide free text as a display label with explicit expected
word phonemes, without any Quran reference lookup:

```ts
await engine.start({
  expected: {
    kind: 'exercise',
    id: 'teacher-exercise-42',
    text: teacherText,
    focus: ['ghunna'],
    words: teacherWords, // [{ id, text?, phonemes: exactModelTokenNames }]
  },
});
```

The result includes `exercise` metadata. `focus` records instructional intent only;
it does not enable a calibrated ghunna/gemination/qalqalah/madd scorer. Those raw
heads are already available separately. No automatic free-text phonemizer is added
to the phone runtime, and the acoustic model remains trained for Quranic recitation;
accepting custom references does not make it a universal language recognizer.

`decoded.text` is what the SDK heard **as phoneme names**, not an unconstrained
Arabic transcript. `matchedText` concatenates caller labels for confidently matching
words only; it must not be described as an independent Arabic ASR transcript.

## Audio and latency

The default `source: 'microphone'` uses `model.listen()` inside Kotlin/Swift.
SDK capture handles permission, native hardware rate, mono normalization, route
changes, interruption and its own model resampler. No PCM crosses JS in this mode.
Typical capture rates are 44.1/48 kHz; the SDK's engine converts as needed for its
16 kHz acoustic frontend. Do not run another microphone capture concurrently.

For QuranLingo's existing **16 kHz mono** stream, use `source: 'external'`:

```ts
import { pcm16leToFloat32 } from '@quranlingoapp/recitation';
await engine.start({ expected: verifiedWords, source: 'external', sampleRate: 16000 });
await engine.pushAudio(pcm16leToFloat32(pcmBytes));
```

The push API takes mono float samples in `[-1,1]`, not bytes, WAV headers, base64,
Opus or interleaved stereo. Signed PCM16LE converts by `sample / 32768`; float PCM
already normalized needs no conversion. 16 kHz is supported directly, so no wrapper
resampling is needed. Supported common rates: 8000, 11025, 16000, 22050, 24000,
32000, 44100, 48000 Hz. Fix the rate for the take. The SDK owns resampling; stereo
downmixing and compressed-file decoding belong to the caller.

Prefer 20–100 ms external buffers; await every push. Each push is limited to one
second and at most four promises may wait: excess rejects `audio_backpressure`
rather than silently dropping audio. Stop drains accepted pushes. This bridge path
is for compatibility, not a zero-copy/JSI audio transport.

The default `c16_l64` model context produces ~320 ms chunks, plus capture, compute
and bridge delay. Choose `c8_l64` for ~160 ms chunks after measuring CPU cost on
target devices (upstream accelerators use the 320 ms context). Instantaneous or
guaranteed end-to-end latency is not promised. Other exposed contexts are
`c24_l72`/`c24_l256` (~480 ms); the SDK checks build availability.

`endOnSilenceMs` defaults to 1500; set 0 to stop manually. Silence can auto-end a
take, noisy audio can prevent it, and the SDK enforces a 20-minute limit. Keep a
Stop control. SDK microphone sessions end on backgrounding; start a fresh session
on return. A final snapshot and ended event travel on separate native streams;
do not assume cross-stream ordering. `stop()` returns final output. `cancel()`
discards the take. Permission/SDK failures reject promises or arrive as ended/error
events; compare upstream error codes rather than human-readable messages.

## Word judgments

See docs/judgments.md. Each result is a replaceable snapshot, with per-word state,
`committed`, optional `provisionalState`, phonemes, reason, timings and confidence.
Always keep uncertain distinct from incorrect. Raw heads (all twelve by default;
`allHeads: false` selects the SDK default six) are unscored network outputs. They
must not be displayed as religious verdicts. Head values are row major with frame
length and class count; nonfinite values become null across the native bridge.
Per-chunk heads cover that chunk, while decoded tokens cover the whole take so far.
The final result carries the last chunk's heads, not a concatenated full-take tensor;
retain per-index heads from streaming if the application needs the full sequence.
Do not append replayed chunks: replace by index after `backendChanged`.

## Privacy, terms and attribution

Quran Lab develops the model and official SDKs; Quralingo develops this independent
wrapper. See NOTICE, LICENSE and docs/permission-and-terms.md. The wrapper and all
model-powered features/outputs must remain free. The public QuranLingo permission
includes the condition that model-derived recitation progress in the parent
dashboard is also free; unrelated paid curriculum customization is separate.

No wrapper-level analytics, uploads or app networking are added. SDK analytics are
configured off. SDK downloads/key validation/diagnostics still occur. The upstream
SDK may offer its consent sheet for recording contributions; the wrapper never
opts anyone in. Children/guardian wording is the default. Add a settings action
calling `engine.showSharingSettings()` so the learner can turn sharing off or delete
contributions. Review the SDK's current privacy disclosures for your app listing.
Display the automatic-feedback notice from NOTICE in the host app.

## Development and releases

```sh
npm install
npm run typecheck
npm test
ruby test/spm_test.rb
npm pack --dry-run
```

See example/usage.ts for microphone and existing-stream integration. Native
validation and publishing steps are in docs/validation.md and docs/upgrades.md.
This workspace contains the source package; no npm release or GitHub push has been
performed. Publish only after real host builds and device validation pass.
