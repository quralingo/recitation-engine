# Changelog

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
