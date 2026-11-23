# Downloadable Arabic letter maps

The package exports `mapWordLetters`, `mismatchedPhones`, `parseLetterMapBundle`,
`LetterMap`, `LetterPart`, `LetterMapBundle`, and `LETTER_MAP_ASSET`.
The functions contain no React, storage, networking, or application state logic.

The 6,236 ayah maps are one external JSON file, not a bundled npm asset.
Keep the existing phoneme reference in the package: the maps only add provenance
for letter feedback; they do not replace the model or its expected phonemes.

## Generate

Use a checkout of the pinned quran-g2p revision in `tools/recitation-g2p-pin.json`:

```sh
python3 tools/export-reader-letter-maps.py /path/to/quran-g2p
```

The exporter verifies all pinned source blobs and every ayah's exact phoneme IDs
against `mobile-reference/surahs`. It generates:

- `artifacts/letter-maps/hafs-tj3-7eeba120-v1/letter-maps.json` (upload artifact).
- `artifacts/letter-maps/hafs-tj3-7eeba120-v1/manifest.json` (optional upload metadata).
- `src/letter-map-asset.ts` (small, published version/size/checksum metadata).

The JSON includes the original license and source notice. Keep those fields when
storing or redistributing it. Generated bulk artifacts are ignored by Git and are
excluded from the npm package. Commit the exporter, pin, metadata, mapping code,
and tests. Regenerate the artifact from the same commit before uploading it.

## Upload

Upload the plain JSON as **one object**, without ZIP or gzip content encoding:

```sh
aws s3 cp artifacts/letter-maps/hafs-tj3-7eeba120-v1/letter-maps.json \
  s3://quralingo/recitation/letter-maps/hafs-tj3-7eeba120-v1/letter-maps.json \
  --region eu-north-1 \
  --content-type application/json \
  --cache-control 'public,max-age=31536000,immutable'
```

Expected CDN URL, after upload:

```text
https://d1mwnyqs1hx561.cloudfront.net/recitation/letter-maps/hafs-tj3-7eeba120-v1/letter-maps.json
```

The manifest need not be downloaded separately: `LETTER_MAP_ASSET` already pins
its values in the package. Never overwrite this versioned key with changed data;
change the version/path and regenerate the metadata when the artifact changes.
HTTP compression can be configured separately later; plain JSON avoids a new
archive extraction dependency in React Native.

## Host setup flow

1. Download the model through the existing engine setup method.
2. Download `${CDN_URL}/${LETTER_MAP_ASSET.path}` to a temporary file, showing
   byte progress along with model progress.
3. Check the file byte size and SHA-256 against `LETTER_MAP_ASSET`.
4. Parse it using `parseLetterMapBundle(JSON.parse(raw))`. This rejects a different
   reference/version, incomplete ayah coverage, and invalid character spans.
5. Write `bundle.surahs` into per-surah files in a versioned app document directory,
   then publish a local ready marker only after every write succeeds. Retain the
   source license and notice. Load only the current surah into memory during use.
6. Enable offline recitation in app state only when **both** model and maps are ready.
   If setup fails, retain verified downloads for retry and keep setup incomplete.

The package does not download files or set the application's offline-enabled flag.
Do not use cache storage for these installed maps, since the OS may evict it.
Avoid loading the full bundle during each recitation: parse/split it at setup.

```ts
import { mapWordLetters } from '@quranlingoapp/recitation';

// surahMaps is the current surah read from local app storage.
const parts = mapWordLetters(
  surahMaps[String(ayah)],
  displayedWord,
  feedback.units,
  feedback.unitIndices,
);
```

Unit indices are zero-based **reference units within the ayah**, not global
surah word positions. Multiple units may belong to one displayed word.
A non-null result preserves the display word and marks its Arabic letter groups
with `wrong`; rendering and color choices belong to the host. `null` means no
reliable letter-level explanation (including ambiguous alignment, mismatched
spelling, absent maps, or no mapped error); the host should retain word-level
feedback without guessing which letter is wrong.

Release the package with these exports before changing the mobile dependency.
No mobile patch, local package override, or backward-compatibility migration is
needed for the unreleased mobile offline reciter.
