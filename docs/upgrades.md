# SDK upgrades and publication

Versions reviewed 2026-11-24:

| Platform | SDK pin | Upstream source reviewed |
| --- | --- | --- |
| Android | ai.quranlab:tajweedformer:4.0.3 | tag 4.0.3, 04cbd5e3d83f96344015a1252e5cc83bc2349485 |
| Apple | TajweedFormer 4.0.3 | tag 4.0.3, 73b0d3d18a8ca6fdf12891ca8901c88c8d8b4976 |

V4 is the model generation; 4.0.3 is the SDK release. These are independent
version numbers. The Client chooses/downloads the verified model build from Quran Lab;
the wrapper does not copy weights or bypass their access system.

To upgrade:

1. Read the official changelogs, current public API/source, license and access
   terms. Check https://sdk.quranlab.ai/docs/changelog and both official GitHub
   repositories. An upstream required update can stop model access on old SDKs.
2. Update the exact Android dependency in android/build.gradle and the exact Apple
   requirement in ios/spm.rb. Update README, this table, tests and native mappings
   together. Do not use floating SDK versions for release builds.
3. Check reference availability/schema, vocabulary IDs/names, calibration hashes,
   sample rates, token confidence semantics, settled/replay semantics, head names,
   platforms and privacy/consent changes. Never reuse a V3 lexicon automatically.
4. Run TypeScript/tests/package checks, build clean RN host apps for both platforms
   with the intended RN versions, resolve SPM, and run the device checks below.
   Test a first download, offline subsequent use, refused key, cancelled download,
   microphone denial, auto/manual end, app backgrounding and accelerator replay.
5. Record measured latency and teacher-reviewed alignment behavior. Defaults are
   heuristic and cannot substitute for learner validation. Bump this package's
   version using semver; document breaking contract changes.

The source repository is quralingo/recitation-engine. Publish the npm package as
@quranlingoapp/recitation using the existing quranlingoapp organization (verified
in npm settings on 2026-11-16). The authenticated personal account is quranlingo;
it needs publishing rights in that organization. GitHub and npm names are separate.
The initial beta version is 0.1.0-beta.0; failed publication under the old,
nonexistent @quralingo scope did not publish that version.

From an authenticated environment after native validation:

```sh
npm install
npm test
npm pack --dry-run
npm publish --access public --tag beta
```

Keep LICENSE and NOTICE in the tarball, inspect its file list, exclude keys/model
files/build caches, and tag the published source version. There is intentionally
no automatic publish-on-push workflow and no embedded platform SDK key.

## beta.8 migration

Removed `Configuration.audience` and both native analytics/audience arguments.
SDK 4.0's mandatory anonymous aggregates and diagnostics replace the former
analytics-off behavior. The existing learner-controlled sharing settings remain.
SDK 3.x loses model access on 15 January 2027, 00:00 UTC.

The first SDK 4 model open needs connectivity and a fresh encrypted install.
Cached file presence does not guarantee a lease is available: pass through
`needs_connection` and allow retry without deleting the cached model or letter maps.
`loadModel()` prepares the two contexts used by QuranLingo before setup completes.
Letter maps/reference vocabulary are unchanged by this SDK-only upgrade.

Android signing fingerprints must be registered in the portal. Apple App Attest
must be enabled for the host's App ID/provisioning as well as its entitlements.
The Core is a dynamic SwiftPM binary dependency; retain normal Xcode embedding and
signing, and include upstream privacy/resources. Validate a distribution archive.
No emulator/device tests were run for this migration, at the user's request.
