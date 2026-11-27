# @quranlingoapp/recitation

Independent, typed React Native wrapper for **Quran Lab TajweedFormer V4**.
Streams phoneme transcription, timing, confidence and raw Tajweed heads on the
device, with conservative expected-word feedback. No application UI, app analytics,
app networking, React hooks or global store. Android and Apple SDKs **4.0.3**.

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
The helper supports static frameworks, plain static-library pods and the existing
dynamic-framework path. Keep your app's current linkage (including Firebase's
static configuration). Add this to `ios/Podfile` (merge into the existing
post_install):

```ruby
require_relative '../node_modules/@quranlingoapp/recitation/ios/spm'

# Keep your existing use_frameworks! configuration, e.g.:
use_frameworks! :linkage => :static
# Keep $RNFirebaseAsStaticFramework = true if your app uses it.

post_install do |installer|
  # Keep your existing react_native_post_install(...) here first.
  quralingo_recitation_spm(installer)
end
```

Run `pod install`, open the app's `.xcworkspace` and let Xcode resolve packages.
With static pods, QuralingoRecitation owns the SDK product dependency and Xcode
archives the SDK implementation into that pod. The helper removes beta.3's direct
SDK product dependencies/link entries from consuming app targets. Beta.5 also
removes beta.4 resource-copy phases; Xcode automatically propagates the upstream
SPM resource bundle, including its privacy manifest. The app links only the
pod; linking the SDK again would duplicate its objects. The helper also adds a
standard Embed Frameworks copy phase for the SDK's dynamic `QuranLabCore.framework`,
using Xcode's platform-selected build product with Code Sign On Copy. This embeds
Core without linking TajweedFormer a second time. It saves those user-project
changes. With
a dynamic pod it keeps linkage on that framework as before. It does not change
Firebase/GoogleSignIn dependencies, global linkage or linker flags. Do not add a
second manually copied SDK or engine binary. Add `NSMicrophoneUsageDescription`
to the host Info.plist. Resolve SPM packages in CI before building the workspace.
The helper's static/dynamic project structure is tested with Xcodeproj. An offline
Swift/C/resource link fixture is provided as `ruby test/spm_link_fixture.rb`; run
it and a real host build to validate linkage in your Xcode environment. See
docs/ios-static-linkage.md for details and remaining verification limits.

Each host needs approved Android/iOS keys for its package/bundle identifiers from
https://sdk.quranlab.ai. Never publish keys in this package. The official Client
handles initial model download, signature checking, storage and access refresh.

Set the host's key once in native app configuration. No per-screen configure call
is required after that:

Android, inside the host manifest's `<application>`:

```xml
<meta-data android:name="com.quralingo.recitation.API_KEY"
           android:value="@string/quran_lab_api_key" />
```

Supply `quran_lab_api_key` through your build configuration. For example, in a
Groovy app build.gradle `defaultConfig` block:

```groovy
resValue 'string', 'quran_lab_api_key', project.findProperty('QURAN_LAB_API_KEY') ?: ''
```

iOS, in the host Info.plist:

```xml
<key>QuranLabApiKey</key>
<string>$(QURAN_LAB_API_KEY)</string>
```

Set `QURAN_LAB_API_KEY` in the host's build settings/xcconfig. Use the appropriate
platform-bound key and keep actual keys out of this repository. Alternatively call
`engine.configure({ apiKey: platformKey })` once at app startup.
Missing keys cause `start()` to reject with a `missing_configuration` message.

## Use

```ts
import { getRecitation } from '@quranlingoapp/recitation';

const engine = getRecitation(); // One per JS runtime/process.

const results = engine.onResult(result => {
  // Replace the preceding snapshot in your UI.
  renderWords(result.words);
  renderPhonemes(result.decoded.text);
  // result.decoded.isFinal, tokens, heads, backend, sessionId, index
});
const events = engine.onEvent(event => handleSessionEvent(event));

await engine.start({ expected: { surah: 1, ayah: 1 } });
const final = await engine.stop(); // Or await natural final via onResult.
results.remove();
events.remove();
```

Hafs references for all 114 surahs ship inside npm and are selected automatically.
`start()` initializes the SDK from native key configuration and loads the model on
first use; later sessions reuse it. The first call can take time for the SDK's
verified model download, so show a loading state while awaiting it. Reference JSON
is already bundled and requires no download. Optionally call `engine.loadModel()`
after the user opts in to warm the model before the first session.
Call `cancel()` when leaving during startup too: it prevents a delayed microphone
start and, if native start is already in progress, cancels that session before
resolving. Cancellation waits for an in-flight SDK load/start operation to finish;
it does not abort the SDK's model download.

Apps can offer an explicit offline setup flow without changing the recitation API:

```ts
// Cache inspection configures the client but does not download/open the model.
const storage = await engine.getModelStorage();
const progress = engine.onModelDownloadProgress(({ downloadedBytes, totalBytes }) => {
  // totalBytes may be zero while the SDK discovers the download size.
  updateDownloadProgress(downloadedBytes, totalBytes);
});
try {
  await engine.loadModel(); // Resolves only after download and model preparation.
  saveOfflinePreference(true);
} finally {
  progress.remove();
}
```

Storage consent, free-space checks, persisted engine preferences, and online fallback
belong to the consuming app. Cached loads may complete without download progress.
Switching to online mode does not cancel an in-flight SDK download or delete its cache.

The existing explicit-phoneme route remains available:

```ts
await engine.start({ expected: verifiedWords });
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

The default uses the package's pinned Hafs reference. Current upstream
The bundled reference is available independently of the served model build.
`loadModel()` exposes the
vocabulary, blank/bar IDs, calibration JSON/hash and reference availability.

## Built-in Hafs reference and educator exercises

The source repository now includes `mobile-reference/`: deterministic precomputed
data for all 114 surahs / 6,236 ayat, generated from Quran Lab's pinned `quran-g2p`
revision and its official **tj3** renderer. There is no handwritten letter mapping.
The 114 phoneme JSON files total about 1.6 MB and ship inside the npm package.
Metro discovers the static require paths inside the package. Only the requested
surah is loaded/validated by the provider on demand; applications need no JSON
imports, copied assets, reference registration or filesystem/network loading code.

An alternative reference provider can be selected on the first singleton call:

```ts
const engine = getRecitation({ referenceProvider: myReferenceProvider });
```

Default is `referenceProvider: 'bundled-hafs'`. Use `'sdk'` to rely only on the
SDK's optional table (missing table then rejects explicitly). Further calls to
`getRecitation()` return the same engine; passing options after creation rejects
to avoid silently changing another screen's engine. Use `setReferenceProvider()`
between sessions to change it. An explicit provider takes precedence over the SDK
table. Existing `createHafsReferenceProvider(bundleOrBundles)` remains available
for callers with their own data-loading needs, but is not needed for normal use.

The bundled provider checks the entire
runtime model vocabulary, blank/bar IDs and V4 generation before returning phones;
it rejects incompatibility instead of silently remapping sounds. It checks schema,
provenance fields and token IDs, but does not cryptographically authenticate imported
JSON at runtime. Export/package tests verify manifest hashes before release.

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

For microphone sessions, `onEvent()` emits `captureReady` after native startup
completes, before `start()` resolves. Use it to show the Stop/ready state; do not
wait for `speechStarted` or a decoded result to invite the learner to speak.
It is not emitted for external-input sessions: those hosts must wait for their
own microphone's first audio buffer before displaying readiness. Subscribe before
calling `start()` and filter events by session ID. Startup failures/cancellation
do not emit readiness. This signal confirms startup, not recognition accuracy.

At a VAD speech end, settled trailing phones can close the last word even when
earlier SDK word separators are present. No extra silence delay is added by the
wrapper; unsettled phones and silence alone still cannot produce a correct word.

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

No wrapper-level analytics, uploads or app networking are added. SDK 4.0 always
sends anonymous aggregate counts/durations and diagnostic reports; it exposes no
analytics or audience option. Recognition runs on device. The SDK handles its
recording-sharing consent sheet; the wrapper never opts anyone in. Add a settings action
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

## Downloadable letter feedback

Arabic letter feedback is available through `mapWordLetters()` using source spans
from a separately downloaded, versioned JSON asset. `LETTER_MAP_ASSET` pins its
location, size, reference version, and checksum. The bulk maps are not bundled
with the package. See [letter map generation, upload, and host setup](docs/letter-maps.md).

## SDK 4.0 host requirements

- First SDK 4 setup needs an internet connection and downloads the encrypted model again.
  Later recognition is local; if the SDK returns `needs_connection`, connect and retry.
- Android runs on CPU. Register the production app signing and upload certificate
  SHA-256 fingerprints in Quran Lab's app/key Setup page. Development emulators
  require a development key. Do not modify the shipped Core binary.
- Apple hosts must enable App Attest on their App ID/provisioning and set
  `com.apple.developer.devicecheck.appattest-environment` (`development` for debug,
  `production` for distribution). Simulators require a development key.
- Review store privacy disclosures against the SDK's privacy manifest: anonymous
  usage, performance and crash diagnostics are mandatory; audio sharing stays optional.
- `loadModel()` installs/prepares `c16_l64` and `c24_l72` on CPU without microphone
  access before returning, so normal and correction sessions can start offline.

See [SDK upgrade notes](docs/upgrades.md) and the
[official migration guide](https://sdk.quranlab.ai/docs/upgrade).

### Focused contextual retries

Pass `focusWordId` with `expected` containing the target and optional previous/next
words. The returned `words` array contains only the target, so callers must merge
it by ID, not its position in `expected`. The learner may say the target alone or
include its neighbours. Neighbour results never determine success. Equal best
matches abstain; recognition is based on bounded word candidates, not arbitrary
phoneme substrings. Keep failed/uncertain results unchanged in the host and finish
a retry on speech end. The host owns attempt limits and contextual audio playback.
