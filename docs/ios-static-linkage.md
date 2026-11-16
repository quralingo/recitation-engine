# iOS static CocoaPods linkage

From beta.5, keep static CocoaPods linkage and Firebase configuration unchanged.
Require `ios/spm.rb` and call `quralingo_recitation_spm(installer)` after
`react_native_post_install`.

The pod retains the Apple SDK 3.1.4 product dependency for module visibility,
build ordering, and sole implementation ownership. Consuming apps link only the
pod; the helper removes beta.3 direct app SDK dependencies and link entries.
Xcode propagates `TajweedFormer_TajweedFormer.bundle` automatically, including
`PrivacyInfo.xcprivacy`. The helper removes every beta.4 copy phase from consumers:
that phase declared the same output as Xcode and prevented fresh builds.
Unrelated targets, settings and linker flags remain unchanged. Repeated installs
must be idempotent. No dynamic-framework switch or duplicate-symbol suppression
is used. Android remains pinned at 3.1.5.

Run `ruby test/spm_test.rb`, `ruby test/spm_static_test.rb`, and the actual native
fixture `ruby test/spm_link_fixture.rb` (also `--official-sdk` and `--device`).
The fixture must verify automatic resource/privacy propagation without a custom
copy phase. A structural test alone does not establish native build success.
See `beta4-validation.md` for earlier cached replay evidence and `beta5-validation.md`
for current checks. Always validate fresh arm64 Debug simulator and Release device
builds, inspect archive/link-map ownership and compare bundle hashes in each app.
