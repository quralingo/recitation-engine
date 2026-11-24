## SDK 4.0.3 migration — 2026-11-24

- Package beta.8: 55 Node tests and TypeScript checks pass.
- Android bridge compiled against the published SDK 4.0.3 AAR and React Native 0.84.1
  in an isolated Gradle host (compileSdk 36, Java 17, Kotlin 2.1.20).
- Apple exact-version pin and static/dynamic project-ownership Ruby tests pass.
- Swift bridge syntax parse passes; no iOS typecheck, link, or distribution archive
  was built for this migration.
- No emulator or device tests run, at the user's explicit request.
- Host follow-up: publish/install beta.8, reinstall pods and resolve SwiftPM, rebuild
  native apps, enable App Attest provisioning and register signing fingerprints.
  Test fresh encrypted setup, cached startup, corrections offline, and real iOS/Android capture.

The older validation records below describe earlier releases, not SDK 4.0.3.

# Validation and remaining checks

Implementation is a first integration candidate, not a proven production native
release. No QuranLingo app repository was modified.

## Checks performed in this workspace

- TypeScript 5.9.2 strict typecheck against real React Native 0.84.1 declarations.
- TypeScript declaration/JavaScript build.
- 37 Node tests: provisional/settled boundaries, confidence abstention, substitutions,
  unrelated audio, omissions, repeated-sequence ambiguity, late provisional evidence,
  PCM16 conversion, lifecycle failures, reference fallback, replay, stale/final events,
  external input validation/order/backpressure and SDK rate validation. New checks
  validate every generated artifact hash, all 6,236 ayah lookups, vocabulary/context
  rejection, reference provenance, offline fallback and educator-exercise behavior.
  Default-start tests cover bundled lookup of all ayat, automatic native configure
  and model reuse, missing-key/download recovery, singleton options and the unchanged
  explicit word/phoneme route. Pack inspection verifies all 114 JSON modules ship.
- 10 official Quran Lab tj3 renderer tests passed against the pinned source and
  its original text. The generator verifies all pinned input Git blob hashes,
  validates the text/vocabulary SHA-256, and checks full-ayah vs per-word rendered
  sequence equality for every ayah. These are data/export checks, not device tests.
- Ruby syntax of podspec and SPM helper; Xcodeproj test constructs, saves/reopens
  project, verifies exact SDK pin/link product, recovery from RN package-reference
  cleanup, module include paths and idempotence. Static-helper tests also pass for
  static frameworks/libraries, sole pod SDK ownership, beta.3 host-link migration,
  executed resource-copy phases, multiple consumers and unchanged unrelated
  targets/settings. See docs/ios-static-linkage.md. The offline
  compile/link fixture was attempted but blocked by Xcode/SwiftPM sandbox cache
  permissions, so native static linkage is not yet build-proven here.
- Beta.4 actual cached-object link regression: reproduced the consuming app's
  8,725 duplicate symbols, then successfully re-linked its arm64 Debug simulator
  image using the unchanged pod archive as sole SDK owner. Archive/link-map/nm checks
  confirm one implementation; the copy script preserves all 15 real SDK resource
  files, including PrivacyInfo.xcprivacy. This is not a fresh workspace build or
  device run. Both fresh target configurations were attempted but blocked by
  Xcode workspace/SwiftPM/CoreSimulator sandbox access; see beta4-validation.md.
- Swift frontend syntax parse (not typecheck/link against the SDK).

## Environmental limits

The shell has no network DNS access and no Android SDK/Gradle installation was
available. Full npm dependency installation stopped on an uncached React Native
transitive dependency. The actual TypeScript, React Native and React declaration
tarballs were available in the local npm cache and used for the checks above;
no synthetic React Native types were used. A package-lock.json was subsequently
created in the user's local publication workflow. This update uses the installed
TypeScript/RN dependencies and preserves that lockfile while bumping to beta.2.

Native SDK artifacts could not be resolved, and no app-specific approved SDK keys
were supplied. Therefore Android/iOS compilation, native linkage, runtime microphone
behavior, model download, real audio recognition and latency are **unverified**.
Swift syntax parsing and bridge fixture tests do not prove native functionality.
The Apple SPM+CocoaPods integration must be exercised in a clean host workspace.

## Required device validation before publishing

1. Build an isolated native RN host app (not QuranLingo/mobile), link this package
   locally, resolve CocoaPods/SPM and Maven dependencies. Validate the intended RN
   versions including new-architecture module interop. Use Apple silicon simulator
   and physical iPhone, plus physical API 26+/modern Android devices.
2. Configure separate identifier-bound development keys. Load the real model and
   inspect vocabulary/calibration/reference metadata. Test first download/progress,
   network refusal, offline cached use and revoked/invalid keys.
3. Use official sample clips in an SDK test harness to compare streamed raw output
   to upstream; use reviewed expected phonemes from the model vocabulary. This
   package does not synthesize canonical test Quran text or claim model conformance
   from mocked bridge results.
4. Test capture denial/retry, native microphone start/stop, silence, breath pauses,
   held vowels, long takes, background/foreground, calls, headphones/route changes,
   repeated takes and JS runtime reload cleanup. Stop must release capture.
5. Feed 16 kHz PCM16LE converted to mono float; compare to the same clip with native
   SDK session.push. Check no drops/reordering at 20/100 ms buffers, awaited pushes,
   backpressure, cancellation and stop during pending input.
6. Trigger CPU/accelerator replay if available. Replace per-index head data and
   full feedback snapshots, including formerly settled judgments. Ensure final and
   ended event ordering does not lose results.
7. With learner/guardian consent only, test the SDK sharing sheet and settings,
   opt-out/deletion. Display the automatic-feedback notice and ensure all
   model-powered recitation reports remain free.
8. Measure end-to-end latency/memory on low-end hardware and teacher-review child,
   noisy, missing/repeated/skipped/wrong-word recitations. Tune thresholds on held-out
   recordings before using incorrect states as learner-facing assessments.
