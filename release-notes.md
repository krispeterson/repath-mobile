# RePath Mobile Release Notes

## Version
- `v0.1.1`

## Summary
- Patch release that formalizes installable Android release artifacts and release automation.
- Keeps the existing camera-first mobile client behavior while improving distribution and release repeatability.

## User-Facing Additions
- GitHub release now ships a downloadable Android APK + checksum for direct install/testing.
- Camera-first scan flow for identifying household items and routing users to ranked disposal options.
- ZIP-based municipality pack routing with local fallback behavior for supported jurisdictions.
- Ranked option card output (reuse, donate/sell, recycle, drop-off, trash) driven by local pack rules.
- On-device model inference pipeline (VisionCamera + TFLite) with label-to-item resolution against bundled search index.
- Bundled/offline-first municipal pack and search assets for instant local decision support.

## Developer and Integration Additions
- `repath-mobile` now operates as a model-release consumer, with training/evaluation workflows moved to `repath-model`.
- Model pull workflow supports release-tag pinning and checksum verification against release manifest by default.
- Added explicit ML workspace handoff command (`npm run ml:workspace`) and separation documentation.
- Added reproducible Android release script (`npm run release:android:debug`) with optional GitHub publish mode.
- Added release artifact contract documentation in `docs/release-contract.md`.

## Release Artifacts
- Android APK: `app-debug-v0.1.1.apk`
- Android APK SHA256: `app-debug-v0.1.1.apk.sha256`
- Android output metadata: `output-metadata-v0.1.1.json`

## Validation Snapshot
- `npm run smoke` passed.
- `npm test` passed (`187/187`).

## Known Limitations
- Android artifact in this release is a debug APK, not a Play-distribution signed release build.
- iOS release artifact (IPA) is not yet included.
- Current UX/data scope is still a focused prototype and should be expanded before broad public rollout.
