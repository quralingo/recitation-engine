# SDK upgrades and publication

Versions reviewed 2026-11-16:

| Platform | SDK pin | Upstream source reviewed |
| --- | --- | --- |
| Android | ai.quranlab:tajweedformer:3.1.5 | main 990758d434bc05ca695d13622dc31aee40aec24f |
| Apple | TajweedFormer 3.1.4 | main 5000afb6f932ad98e090ea55b67cc1e2db2e1d15 |

V4 is the model generation; 3.x is the SDK version. They are different version
numbers. The Client chooses/downloads the verified model build from Quran Lab;
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

Before initial publication, create/push the source to quralingo/recitation and
verify ownership of the @quralingo npm scope. This workspace could not initialize
git because .git creation was denied by the execution environment. No remote was
created, commit made or npm package published here.

From an authenticated environment after native validation:

```sh
npm install
npm test
npm pack --dry-run
npm publish --access public
```

Keep LICENSE and NOTICE in the tarball, inspect its file list, exclude keys/model
files/build caches, and tag the published source version. There is intentionally
no automatic publish-on-push workflow and no embedded platform SDK key.
