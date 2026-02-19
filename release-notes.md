# RePath Mobile Release Notes

## Version
- `v0.1.2`

## Summary
- Fixes Android release packaging so installable artifacts no longer depend on Metro.
- Promotes release APK generation as the default mobile release workflow.

## User-Facing Additions
- GitHub release assets now target release-variant Android APKs with embedded JS bundle/assets.
- Keeps existing camera-first scan, local routing, and bundled pack behavior unchanged.

## Developer and Integration Additions
- Added `npm run release:android` and `npm run release:android:publish`.
- Existing debug flow remains available through `npm run release:android:debug`.
- Added `scripts/release-android.js` with explicit `--variant release|debug`.

## Release Artifacts
- Android APK: `app-release-v0.1.2.apk`
- Android APK SHA256: `app-release-v0.1.2.apk.sha256`
- Android output metadata: `output-metadata-release-v0.1.2.json`

## Validation Snapshot
- `npm run smoke` passed.
- `npm test` passed (`187/187`).
- Verified release APK contains `assets/index.android.bundle`.

## Known Limitations
- Release APK signing still uses the debug keystore.
- iOS release artifact (IPA) is not yet included.
