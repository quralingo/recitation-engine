# Offline Hafs reference for @quranlingoapp/recitation

Generated from pinned Quran Lab quran-g2p source using its official 38-token tj3
renderer. See manifest.json for revision, input hashes, configuration and file hashes.

From beta.2, `surahs/*.json` ships inside npm and is used automatically by
getRecitation(). No app-side copies, imports or registration are required. Beta.1
required manual registration; that older setup is now optional for custom providers.
Reference data is local; the SDK still downloads its model on first use.

All 6,236 ayat are covered. Readings are full-ayah start through ayah-end waqf,
with connected interior words. Do not crop for isolated words or cross-ayah joins.
Source word positions must be reconciled with the app's Quran display edition.

The optional `attributes/` sidecar contains prescriptions, not measured Tajweed
scores. `rulings.json` retains their source citations. `word-spans.jsonl` and the
original text support auditing/mapping. See repository docs/reference-data.md for
the complete integration guide, schema, limitations and regeneration instructions.

Preserve LICENSE, SOURCE-NOTICE.md and upstream text notices when redistributing.
Do not charge for this data, access to it, or model-powered features/outputs.
