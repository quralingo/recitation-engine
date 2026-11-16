# iOS static CocoaPods linkage

Fixed in 0.1.0-beta.4 (beta.3 had duplicate SDK ownership). The Podfile keeps:

```ruby
use_frameworks! :linkage => :static
$RNFirebaseAsStaticFramework = true

require_relative '../node_modules/@quranlingoapp/recitation/ios/spm'

post_install do |installer|
  # Existing react_native_post_install(...) first.
  quralingo_recitation_spm(installer)
end
```

Do not duplicate your existing post_install block or change Firebase linkage.
The helper API is unchanged. Update the npm package, rerun `pod install`, then
resolve SPM dependencies and build the `.xcworkspace`, not only `.xcodeproj`.

## What the helper changes

The official Apple SDK's pinned 3.1.4 Package.swift declares an automatic library
product `TajweedFormer` containing Swift code, the COpus target and resources.
Its TajweedFormerCore XCFramework contains static `.a` slices. Static pod linkage
therefore needs explicit ownership of the final SDK link; allowing the static pod
to archive the SDK and linking it in the app too can duplicate symbols.

For static frameworks or static-library pods:

1. Discover only aggregate targets that actually consume QuralingoRecitation.
2. Keep the SDK product dependency on the pod for compilation, module visibility,
   build ordering AND implementation ownership. Xcode automatically archives the
   SDK objects into this static pod, regardless of a Frameworks phase entry.
3. Remove the SDK product dependency/link entry from consuming user targets. The
   app links QuralingoRecitation only, whose archive already contains the SDK.
   Add one owned resource-copy phase per consumer to copy the whole upstream
   TajweedFormer_TajweedFormer.bundle, including PrivacyInfo.xcprivacy, to the app.
4. Preserve existing linkage, Firebase flags, OTHER_LDFLAGS (including -ObjC),
   unrelated packages and unrelated targets. Do not embed static SDK frameworks.
5. Save changed user projects during post_install. CocoaPods saves its Pods project.

Repeated installs deduplicate package/product/link entries. References are repaired
after React Native cleans old SPM package references. The helper also removes the
beta.3 app SDK dependencies/link entries when migrating to beta.4. Unused host SDK
package references are removed only if no other target/product uses them. Existing
linker flags are untouched. The resource phase has declared inputs/outputs and
fails explicitly if the bundle/privacy manifest has not been built. A setup with
no discoverable consumer fails with an actionable error rather than silently
generating an app with unresolved SDK symbols.

Dynamic-framework pods retain the previous framework-level SDK linkage. The helper
does not change static/dynamic configuration for you. If switching an already
configured app back from static to dynamic, review/remove redundant app-level SDK
link entries left from static setup; don't manually link the SDK twice.

## Verification

```sh
ruby test/spm_test.rb
ruby test/spm_static_test.rb
ruby test/spm_link_fixture.rb
```

The first two tests passed here. They exercise dynamic targets, static frameworks,
plain static libraries, repeated installs, recovery after reference cleanup,
beta.3 migration, multiple consumers, saved user-project changes, an executed
resource-copy phase, unrelated-target isolation and unchanged static/linker settings.

The third normally generates a local SDK stand-in with Swift, C and SPM resources,
then builds a static bridge/app, inspects its archive, and checks that the C symbol
links once and resources/privacy reach the app. --reproduce-beta3 is a negative
control that must fail linking with duplicates. --official-sdk uses the pinned
real SDK (no model/key needed to compile); add --device for Release arm64 device.
These builds could not complete in this execution sandbox:
Xcode/SwiftPM attempted to write its manifest diagnostics to a denied user cache
directory; CoreSimulator service access was also unavailable. It is included in
macOS CI and can run from the user's ordinary Terminal. Do not treat its attempted
execution here as a successful compile/link test. However, the real consuming
app's already-compiled SDK/app objects WERE re-linked here: beta.3 reproduced all
8,725 duplicates; beta.4 ownership linked successfully. ar/link-map/nm checks show
one SDK implementation; executing the new copy script preserved all 15 upstream
bundle files including the privacy manifest. See docs/beta4-validation.md for exact
evidence paths, the limits of cached-object validation, and fresh-build commands.

Before promoting this release, build the real app with its current static
Firebase/GoogleSignIn configuration for simulator and physical iPhone, and archive
a Release build. Verify that Quran Lab's Swift module, Core static library and
COpus link without duplicate/undefined symbols; inspect SDK resource/privacy bundles
in the built app; then test model loading and live recitation on-device. The actual
SDK/App Store archive has not been compiled or validated here.

Upstream sources:

- https://github.com/Quran-Lab/tajweedformer-apple/blob/3.1.4/Package.swift
- https://github.com/Quran-Lab/tajweedformer-apple/blob/3.1.4/TajweedFormerCore.xcframework/Info.plist
- React Native's installed scripts/cocoapods/spm.rb documents the original static
  linkage caveat. This helper uses sole pod ownership and explicit resource copy,
  rather than adding a second host SDK product or suppressing duplicate symbols.
