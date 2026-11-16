# Beta.5 validation

Fixes the fresh beta.4 duplicate resource output by removing its copy phase;
Xcode retains sole resource ownership. The pod retains sole SDK implementation
ownership. Also fixes Android RN 0.84 foreground Activity access.

Regression checks: `npm test`, `ruby test/spm_test.rb`,
`ruby test/spm_static_test.rb`. Actual native fixture:
`ruby test/spm_link_fixture.rb --official-sdk` and add `--device` for Release.

The official SDK static-link fixtures cover Debug arm64 simulator and unsigned
Release arm64 device builds. Checks inspect the final Debug dylib as well as the
executable and use a retained Opus symbol for Release dead stripping. Android APK
builds were tested separately. These fixtures do not establish physical-device
microphone behavior.

## Android recitation fixes validated 2026-11-16

Android 36 arm64 emulator: SDK model 4.0.0 build
b6ae4d8b73d85c576a8821b7d3df7a01ec0f68cd.
The SDK download is now explicitly prefetched before opening on fresh installs.
Exact barless output is segmented only when it matches the expected prefix;
mismatched barless sequences still require a fuller error-alignment solution.

Whole-ayah Shuraym 1:1 and 1:2 replay: 4/4 correct words for each in CPU/auto
modes, with words 1–3 committed during streaming. Silence: zero tokens and zero
correct words. All actual backends were CPU. First result 260–311 ms;
stop processing 44–64 ms.
Normal Android debug UI with microphone injection of Shuraym 97:1: 5/5 correct.
Half-second screenshot sampling showed first highlight by about 2 s after
injection launch and automatic finish by about 6 s, including injected silence.
These are screen observations, not pure inference latency. One concurrent
screen-recording attempt crashed the host emulator; screenshot-only retry passed.

40 engine tests and SPM wiring/migration tests pass. Android debug/release builds
pass (Sentry upload skipped for local builds). iOS microphone behavior and GPU
recognition remain unverified.
