# Changelog

## 0.1.0-beta.2 (unpublished)

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
