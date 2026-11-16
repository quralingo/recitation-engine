# Beta.4 static-linkage fix and validation

## Root cause and fix

The beta.3 "compile-only pod dependency" assumption was wrong. Xcode includes the
SPM product implementation in the static pod's Libtool archive even without a
Frameworks phase entry. The observed archive already held TajweedFormer.o,
COpus.o, and the Core engine objects. The app's separate SPM dependency caused
those same objects to be passed directly to its linker again (8,725 duplicates).

Beta.4 preserves the known-working pod compilation/archive dependency graph, with
Apple SDK pinned at 3.1.4. It removes ONLY the SDK's direct product dependency and
link entries from consuming app targets. The app links the pod's archive as the
single implementation owner. A generated build phase copies the SDK's complete
resource bundle into the app, including PrivacyInfo.xcprivacy. No duplicate-symbol
suppression flags, global linkage changes or recognition changes are used. Android
remains pinned at 3.1.5. Firebase static configuration and existing linker flags
are preserved. Repeated installs migrate beta.3 and deduplicate resource phases.

## Passed in this session

| Check | Result |
| --- | --- |
| Original archive inspection | TajweedFormer.o, COpus.o and Core members each occur once |
| Real arm64 simulator negative link replay | Reproduced exactly 8,725 duplicates with beta.3 ownership |
| Corrected cached-object simulator link | Passed, using unchanged real SDK 3.1.4/app objects and pod archive |
| Final link-map/nm verification | SDK modules/Core originate once from the pod; checked Opus symbols defined once |
| Real SDK resource-copy script | All 15 files match source hashes; privacy manifest preserved |
| Ruby project/phase tests | Static/dynamic graphs, beta.3 migration, unrelated target/settings isolation, idempotence, actual generated copy-phase execution |

Evidence on this machine:

- Original: /tmp/quralingo-beta3-native-validation/simulator-build.log
- Negative: /tmp/quralingo-beta4-link-negative/link.log
- Corrected: /tmp/quralingo-beta4-link-replay/link.log
- Final map: /tmp/quralingo-beta4-link-replay/Quralingo-LinkMap.txt
- Final image: /tmp/quralingo-beta4-link-replay/Quralingo.debug.dylib
- Copied resources: /tmp/quralingo-beta4-link-replay/Quralingo.app/TajweedFormer_TajweedFormer.bundle

Reproduce the actual-object regression (no source/project edits):

```sh
python3 tools/replay_beta3_link.py \
  --log /tmp/quralingo-beta3-native-validation/simulator-build.log \
  --output /tmp/quralingo-beta4-link-negative --reproduce-beta3

python3 tools/replay_beta3_link.py \
  --log /tmp/quralingo-beta3-native-validation/simulator-build.log \
  --output /tmp/quralingo-beta4-link-replay

BUILT_PRODUCTS_DIR=/tmp/quralingo-beta3-native-validation/DerivedData/Build/Products/Debug-iphonesimulator \
TARGET_BUILD_DIR=/tmp/quralingo-beta4-link-replay \
UNLOCALIZED_RESOURCES_FOLDER_PATH=Quralingo.app sh ios/copy_sdk_resources.sh

python3 tools/verify_ios_linkage.py \
  --archive /tmp/quralingo-beta3-native-validation/DerivedData/Build/Products/Debug-iphonesimulator/QuralingoRecitation/QuralingoRecitation.framework/QuralingoRecitation \
  --binary /tmp/quralingo-beta4-link-replay/Quralingo.debug.dylib \
  --link-map /tmp/quralingo-beta4-link-replay/Quralingo-LinkMap.txt \
  --app /tmp/quralingo-beta4-link-replay/Quralingo.app \
  --sdk-bundle /tmp/quralingo-beta3-native-validation/DerivedData/Build/Products/Debug-iphonesimulator/TajweedFormer_TajweedFormer.bundle
```

The replay preserves all non-SDK input objects and original linker flags. It removes
the direct TajweedFormer.o/COpus.o app inputs and -lTajweedFormerCore, redirects
output paths, and adds link-map instrumentation. It does not remove SDK code from
the pod, weaken the linker, compile fresh sources, produce a complete runnable app
or establish a successful Release build. The resource output directory is a copy
test, not a newly built/signed .app. Logs and DerivedData must still exist to replay.

## Native execution limits

The real ../mobile/ios/Quralingo.xcworkspace is readable. Its source repository was
not edited or upgraded in place. Both Debug arm64 simulator and Release arm64
device xcodebuild commands were attempted, as were corrected project-metadata
copies under /tmp/quralingo-beta4-consumer using the real sources read-only.
The corrected copy has one pod SDK dependency and zero direct app SDK dependencies.

Xcode failed before compiling: it reported the valid/readable workspace as "not a
workspace file" alongside denied cache/log access and unavailable CoreSimulator
services. The standalone SPM fixture was also blocked writing SwiftPM manifest
diagnostics to a user cache. These are NOT successful fresh builds or evidence of
device compatibility. Logs are under /tmp/quralingo-beta4-native-validation/.
Physical-device recitation and an App Store archive remain unverified.

## Exact local mobile upgrade and fresh validation

This version is prepared, not published or committed. From the wrapper repository:

```sh
npm pack
```

Then, in the consuming mobile repository, install the local tarball for testing
(temporary file dependency; do not commit a machine-specific path):

```sh
cd /Volumes/Secondary/StudioProjects/mobile
npm install --save-exact /Volumes/Secondary/StudioProjects/recitation-engine/quranlingoapp-recitation-0.1.0-beta.4.tgz --ignore-scripts --no-audit --no-fund
cd ios
USE_FRAMEWORKS=static pod install --no-repo-update
```

Keep $RNFirebaseAsStaticFramework=true and the helper AFTER react_native_post_install.
Review generated project changes: pod SDK product retained, app SDK product/link
removed, one resource-copy phase added, unrelated targets/linker settings unchanged.
Do not manually add the SDK back to the app. Do not change Firebase to SPM/dynamic.

Run from the mobile repository's ios directory, in ordinary Terminal:

```sh
validation=/tmp/quralingo-beta4-fresh-validation
mkdir -p "$validation"
xcodebuild -resolvePackageDependencies \
  -workspace Quralingo.xcworkspace -scheme Quralingo \
  -derivedDataPath "$validation/DerivedData" \
  -clonedSourcePackagesDirPath "$validation/SourcePackages"

xcodebuild -workspace Quralingo.xcworkspace -scheme Quralingo \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO LD_GENERATE_MAP_FILE=YES \
  -derivedDataPath "$validation/DerivedData" \
  -clonedSourcePackagesDirPath "$validation/SourcePackages" \
  build > "$validation/simulator-build.log" 2>&1

xcodebuild -workspace Quralingo.xcworkspace -scheme Quralingo \
  -configuration Release -destination 'generic/platform=iOS' \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO LD_GENERATE_MAP_FILE=YES \
  -derivedDataPath "$validation/DerivedData" \
  -clonedSourcePackagesDirPath "$validation/SourcePackages" \
  build > "$validation/device-build.log" 2>&1
```

Inspect both new archives with xcrun ar -t, inspect their app Mach-O images/link maps
for a single SDK owner, and compare the copied SDK bundle/privacy manifest to each
configuration's built SPM bundle. With Xcode's debug-dylib layout, inspect the
Quralingo.debug.dylib map/image containing SDK symbols, not just the launcher stub.
Never build x86_64: the official Apple SDK lacks that simulator slice. After native
validation and publication, replace the temporary tarball dependency with exactly
@quranlingoapp/recitation@0.1.0-beta.4. No publish/commit was performed here.
