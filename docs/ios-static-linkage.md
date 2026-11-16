# iOS static CocoaPods linkage

Available from 0.1.0-beta.3. The Podfile can keep:

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
2. Keep the SDK product dependency on the pod for compilation/module visibility,
   but remove this product's Link Binary With Libraries entry on that static pod.
3. Add the exact SDK package/product and link entry to each consuming user target.
   Xcode/SPM owns the final SDK link, its binary dependencies and resource bundles.
4. Preserve existing linkage, Firebase flags, OTHER_LDFLAGS (including -ObjC),
   unrelated packages and unrelated targets. Do not embed static SDK frameworks.
5. Save changed user projects during post_install. CocoaPods saves its Pods project.

Repeated installs deduplicate package/product/link entries. References are repaired
after React Native cleans old SPM package references. The helper also removes the
old pod link entry when migrating from beta.2 to static linkage. A static setup with
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
migration from old pod linkage, multiple consumers, saved user-project changes,
unrelated-target isolation and preservation of static/linker settings.

The third generates a local SDK stand-in with Swift, a C symbol and an SPM resource,
then builds a static bridge/app and checks that the C symbol links once and the
resource reaches the app. It does NOT use Quran Lab's SDK or establish device
recognition compatibility. Its build could not complete in this execution sandbox:
Xcode/SwiftPM attempted to write its manifest diagnostics to a denied user cache
directory; CoreSimulator service access was also unavailable. It is included in
macOS CI and can run from the user's ordinary Terminal. Do not treat its attempted
execution here as a successful compile/link test.

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
  linkage caveat; this helper adds explicit host linkage rather than suppressing it.
