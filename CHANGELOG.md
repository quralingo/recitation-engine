# Changelog

## 0.1.0-beta.1 (unpublished)

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
