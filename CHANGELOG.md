# Changelog

## 0.1.0-beta.10

- Add focusWordId for single-word retries surrounded by optional context.
- Return only focused feedback, retaining confidence, settlement and ambiguity checks.


## 0.1.0-beta.9

- Emit microphone `captureReady` after successful native startup without waiting for speech; external capture remains host-owned.
- Close settled final words on VAD speech-end evidence, including streams containing earlier SDK word separators, without an additional silence threshold.
- Preserve unambiguous letter substitutions/deletions across otherwise ambiguous edits or insertions; never guess which repeated letter was wrong.
- Keep precise letter mapping nullable when evidence or display mapping is insufficient; hosts still own whole-word fallback styling.
- Add regression coverage for readiness, settled tails, stale VAD evidence and partial letter localization. Mobile wiring and device validation remain separate.

## 0.1.0-beta.8

- Upgrade Android and Apple native SDKs to TajweedFormer 4.0.3.
- Remove SDK 3-only analytics/audience options, including Configuration.audience.
- Prepare streaming and correction CPU contexts before model setup finishes.
- Document encrypted first installation, App Attest, signing registration, and mandatory anonymous SDK diagnostics.
- No emulator/device tests run; host rebuild and device validation are required.

## 0.1.0-beta.7

- Add pure Arabic letter-feedback mapping and downloaded bundle validation.
- Export a pinned letter-map asset descriptor; keep bulk JSON outside the package.
- Add reproducible provenance export tooling and S3/host setup instructions.

## 0.1.0-beta.6

- Expose model download byte progress through `onModelDownloadProgress()` on Android and iOS.
- Add `getModelStorage()` to inspect the SDK cache without downloading or opening a model.
- Improve barless streaming word alignment and preserve exact anchors across pauses.
- Use speech-ended events to finalize streaming words without treating sustained vowels as silence.
- Android debug native compilation and cached-model setup validated. Fresh-download progress
  and iOS device behavior still require validation.

## 0.1.0-beta.5

- Download/cache the Android model with SDK prefetch before opening it on fresh installs.
- Align exact barless phoneme streams against expected word boundaries, retaining
  confidence checks and provisional streaming feedback.
- Validate CPU/auto external-audio replay and the Android microphone/UI path on
  Android 36 arm64. Auto selected CPU; this does not validate GPU or iOS recognition.

- Remove beta.4's redundant SDK resource-copy phases, including duplicates on migration.
  Xcode owns the automatic SPM bundle copy; this avoids duplicate bundle outputs.
- Preserve sole implementation ownership in the static pod, SDK dependency/build
  ordering, unrelated targets/linker flags and SDK pins (Apple 3.1.4, Android 3.1.5).
- Read the foreground Activity from ReactApplicationContext for RN 0.84 compatibility.
- Extend migration tests for duplicate legacy phases and unrelated target isolation.
- Android debug/release builds and official-SDK static iOS fixtures validated;
  physical-device and iOS microphone recitation still require validation.

## 0.1.0-beta.4 (unpublished)

- Fix beta.3's actual 8,725-duplicate-symbol failure. Xcode archives SPM objects into
  a static pod even without a Frameworks phase entry; the pod is now the sole SDK
  owner and consuming apps no longer have a direct SDK product dependency/link.
- Retain the pod's SDK dependency for proven module visibility/build ordering;
  copy the complete upstream SDK resource bundle/privacy manifest into each app.
- Migrate beta.3 app links idempotently without changing Firebase/static linkage,
  existing linker flags, unrelated targets, SDK pins or recognition behavior.
- Add actual archive/final-image/link-map/resource inspection and cached-object
  replay tools. Reproduced 8,725 failures with beta.3 ownership; corrected real
  arm64 simulator relink passes with one SDK implementation and 15 resources intact.
- Full fresh Debug simulator/Release device builds remain unverified in this
  sandbox; see docs/beta4-validation.md for evidence and exact host commands.

## 0.1.0-beta.3

- Support static-framework/static-library CocoaPods configurations: compile against
  the SDK from the pod and link its SPM product once in each consuming user target.
- Preserve Firebase static configuration, global linkage and ObjC linker flags.
- Deduplicate/repair project references and remove old static-pod SDK link entries.
- Add static/dynamic project tests and an offline Swift/C/resource link fixture.
  Project tests pass; the fixture and actual SDK builds still need a normal Xcode
  environment because this sandbox blocks SwiftPM manifest-cache writes.

## 0.1.0-beta.2

- Bundle all 114 Hafs surah phoneme references with npm and load requested surahs
  lazily using Metro-compatible static paths. No app-side JSON imports required.
- Automatically configure from host native metadata and load/reuse the model on
  start. Keep explicit configure/loadModel available for overrides and prewarming.
- Add getRecitation first-call reference options; preserve custom word/phoneme
  and educator-exercise routes, which bypass Quran lookup.
- Add tests for default startup, all bundled ayah lookups, client/model reuse,
  failure recovery, cancellation during loading/start and independent custom exercises.
  Native key lookup is syntax
  checked but still requires actual Android/iOS build and device verification.

## 0.1.0-beta.1

- Add app-bundled Hafs reference providers, with complete runtime tj3 vocabulary
  checks and ayah-end reading context validation.
- Add explicit educator exercises with optional text/focus metadata and caller
  phonemes. Existing ExpectedWord[] remains supported; no automatic rule scorer.
- Generate all 6,236 ayat from pinned Quran Lab quran-g2p source. Standalone
  mobile-reference data is separate from the lightweight npm tarball.
- Include source/manifest hashes, word-span reconciliation data, optional symbolic
  Tajweed attributes and reproducible export tooling. See docs/reference-data.md.
- Add reference/export coverage tests. Native build/device verification remains
  outstanding from beta.0; no native bridge behavior changed in this release.

## 0.1.0-beta.0

- Initial React Native Android/Apple SDK bridge, streaming results, external audio
  support, conservative expected-word comparison and lifecycle handling.
