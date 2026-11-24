# Permission and distribution review

## SDK 4.0 update — 2026-11-24

SDK 4.0.3 replaces the older analytics/audience options: anonymous daily aggregate
usage and diagnostic reporting are mandatory. Audio sharing remains an explicit
SDK-managed learner choice. The recommended automatic-feedback notice is optional
under the current upstream migration guide; we retain it in QuranLingo. This
section supersedes the SDK 3.x behavior described in the historical review below.

Sources: https://sdk.quranlab.ai/docs/upgrade and the Android/Apple 4.0.3
README, migration guide, and Apple privacy manifest.

## Historical review — 2026-11-16

Reviewed the public exchange between Dr. Haytham Mones and Quran Lab:
https://community.itqan.dev/d/686 (Quran Lab's reply to Haytham, following the discussion of Tathbeet).

Quran Lab explicitly confirms that QuranLingo's free learning/recitation path
fits the condition and separate school subscriptions for unrelated content do
not affect it. They explain that NPL-1.2 attaches to the work, not the entity.
They add a specific condition: any paid parent-dashboard functionality showing
model-powered recitation progress must be made available without charge.

Haytham confirmed in this session that recitation features are public/free and
the paid products are parent/school curriculum customization. On that stated
scope, no mismatch prevents implementing this wrapper. This is not a blanket
commercial waiver. Keep model-derived feedback, reports and progress free too.
No app repository was inspected or changed to verify its paywall behavior.

The forum response addresses application use; it does not explicitly name npm
distribution. Free wrapper distribution rests on NPL-1.2's derivative/share-alike
terms (sections 2, 6, 7), rather than an inferred personal exception. This package
therefore includes the unmodified upstream LICENSE, uses the same license, and
does not bundle keys, weights, decrypted engine files or reference datasets.
Each consuming app needs its own approved platform-bound SDK keys.

Sources reviewed:

- Android SDK 3.1.5 README, AGENTS.md, docs/api.md, options, reference and output sources:
  https://github.com/Quran-Lab/tajweedformer-android
- Apple SDK 3.1.4 README, AGENTS.md, docs/api.md, model, audio input and output sources:
  https://github.com/Quran-Lab/tajweedformer-apple
- NPL-1.2 retained verbatim from Android LICENSE:
  https://github.com/Quran-Lab/tajweedformer-android/blob/main/LICENSE
- Access terms: https://sdk.quranlab.ai/licence

Access terms additionally require an on-screen notice that automatic feedback
can be wrong and does not replace a qualified teacher, and prohibit authoritative
religious rulings. The package supplies that notice in NOTICE; the app must display
it. General app UI stays outside the wrapper.

SDK recognition is local after the initial verified download. SDK model download,
key validation, diagnostics, and optional learner-consented recording sharing are
upstream behavior. This wrapper turns SDK analytics off and never opts a learner
into sharing. The SDK may offer its own consent sheet after a take. Children are
the default audience, so its guardian wording applies. Expose showSharingSettings()
in the consuming app so learners can stop sharing and delete contributions.

This implementation review is a record of the sources and stated product scope,
not a determination about every downstream app's compliance.
