# Hafs reference data and custom exercises

## Provenance and generation

The primary reference comes from Quran Lab's official `quran-g2p` source, pinned to
`7eeba1206146e0b4a81bbd12b59671042b1ba3f0`. The generator verifies the Git blob
hash of each pinned file, including all imported source, the original Tanzil text,
the official tj3 vocabulary and source notices. `TextBank.load('tanzil')` additionally
verifies the text's SHA-256 and handles basmala/ayah numbering. Export uses
`phonemize(..., ref=AyahRef(...))` and `phones_to_tj3`; it does not reproduce their
religious rules or invent Quran phones. Each ayah is phonemized in full context,
then split by source word index; the export asserts that rejoining the words gives
exactly the official full-ayah tj3 sequence.

Regenerate in a network-connected environment:

```sh
git clone https://github.com/Quran-Lab/quran-g2p /tmp/quran-g2p
git -C /tmp/quran-g2p checkout 7eeba1206146e0b4a81bbd12b59671042b1ba3f0
python3 tools/export_hafs_reference.py --g2p /tmp/quran-g2p --output mobile-reference
npm test
```

Python >=3.10; upstream runtime requires no external pip packages. Preserve the
upstream LICENSE/SOURCE-NOTICE files and original text notice in redistributed data.
Generated phonemes and attributes remain under NPL-1.2. The original text retains
Tanzil's own terms. No SDK model or credentials are included.

## Files to use in the app

| File | Use |
| --- | --- |
| `surahs/001.json` … `114.json` | Required phoneme bundles, ~1.6 MB total; can load selected surahs |
| `manifest.json` | Pinned provenance, upstream configuration, counts, file sizes and SHA-256 |
| `attributes/*.json` | Optional symbolic ghunna, gemination, qalqalah and length prescriptions; ~12.5 MB |
| `rulings.json` | Source rule names and classical citations for the attribute sidecar |
| `word-spans.jsonl` | Source character spans for reconciling source word positions with an app's edition |
| `tanzil-uthmani-source.txt` | Original source text, verbatim, including its notice; for audit/reproduction |
| `LICENSE`, `SOURCE-NOTICE.md` | Redistribution terms/attribution |

Keep provenance/license information with the app's bundled data. Runtime matching
needs only the relevant surah JSON; Python and the source text need not run on the
device. Static Metro require() paths are simplest; a host may implement its own
asset-loading provider through `AyahReferenceProvider`. No app networking is added.

## Word indices and reading context

Generated coverage: 6,236 ayat, **77,481 source-word positions**, 471,080 tj3 tokens
excluding word bars, from 522,475 attributed source phones. Do not assume this word
segmentation equals a Quran Foundation/Mushaf SVG dataset's numbering. In particular,
the published KFGQPC audit count is 77,429, so a cross-edition ID mapping needs explicit
validation. Optional `ExpectedAyah.words` lets the app supply its IDs only after
reconciling the order/count. The provider rejects count mismatches; equal counts
alone do not establish identical segmentation. No app repository was changed here.

`word-spans.jsonl` spans are Python Unicode code-point offsets into the source ayah
after the official TextBank basmala handling, not JavaScript UTF-16 indexes or SVG
coordinates. `textSha256` identifies that ayah string. Synthetic/merged phones can
share source spans. This sidecar helps inspect/match positions, not certify a
one-letter/one-sound relationship. Preserve host display words independently.

The first dataset supports one reading policy: start at the ayah's beginning,
connect its interior words, stop at its end. It uses the default upstream Hafs
configuration recorded in the manifest. Alternate transmitted choices, arbitrary
stops, rawm/ishmam forms, isolated-word prompts and cross-ayah joins need separately
generated references. In particular, slicing these word arrays does not regenerate
ibtida/waqf effects at the new boundaries. The provider deliberately has no range
or crop option. Longer ayat may exceed the engine's existing 256-word / 2048-phone
session bounds; raise limits only after profiling or use properly generated segments.

## Educator-authored material

The generic `ExpectedWord[]` API is preserved. `ExpectedExercise` adds an optional
phrase label, exercise ID and instructional focus around those explicit phonemes.
No surah/ayah lookup runs for this mode. Every expected token still must exist in
the loaded acoustic model's vocabulary, and word IDs must be unique.

An educator can type a phrase and supply/review its expected phonemes, which the
app stores as exercise content. A future authoring-side text-to-phoneme service can
produce the same contract without changing audio inference. Text is a label,
not an inference prompt and not a substitute for phonemes. Non-Quran/custom Arabic
is experimental for this Quran-trained model; general multilingual recognition is
outside its supported claims. Do not use another recognizer's output as unquestioned
ground-truth pronunciation.

## Ghunnah and other Tajweed attributes

tj3 intentionally keeps many qualities outside the token axis. A matching phoneme
sequence cannot prove a learner sustained ghunna, shadda or a madd correctly. The
optional sidecars preserve the upstream symbolic expectations with rule citations;
these are not observations or measurements. Each site carries `wordIndex` (0-based)
and `tokenIndex` into the full ayah tj3 stream including word bars. Several source
phones may map to the same long-vowel token. Length `allowed`, `scoring`, `canonical`
are prescriptions/choices, not recorded timing ground truth. Do not turn a canonical
choice into the only correct performance.

The wrapper continues returning raw heads. Rule-specific judgments require a future
scorer validated for the exact model/calibration, rule class, alignment and legal
variants. `focus: ['ghunna']` records the lesson's aim; it never fabricates a score.
Automatic feedback remains fallible and does not replace a qualified teacher.
