# RePath Mobile Release Notes

## Version
- `v0.1.3`

## Summary
- Hardens Android release builds for production signing and Play Store packaging.
- Extends release artifacts to include both installable APK and Play-ready AAB.

## User-Facing Additions
- Android releases now include:
  - direct-install APK (`.apk`)
  - Play upload bundle (`.aab`)

## Developer and Integration Additions
- `scripts/release-android.js` now supports `--artifact auto|apk|aab|all`.
- Release builds enforce signing credentials by default:
  - `REPATH_UPLOAD_STORE_FILE`
  - `REPATH_UPLOAD_STORE_PASSWORD`
  - `REPATH_UPLOAD_KEY_ALIAS`
  - `REPATH_UPLOAD_KEY_PASSWORD`
- Local-only fallback remains available via `--allow-debug-signing`.
- Android versioning is now injected from release tag into Gradle properties:
  - `REPATH_ANDROID_VERSION_NAME`
  - `REPATH_ANDROID_VERSION_CODE`

## Release Artifacts
- Android APK: `app-release-v0.1.3.apk`
- Android APK SHA256: `app-release-v0.1.3.apk.sha256`
- Android AAB: `app-release-v0.1.3.aab`
- Android AAB SHA256: `app-release-v0.1.3.aab.sha256`
- Android output metadata: `output-metadata-release-v0.1.3.json`

## Validation Snapshot
- `npm run smoke` passed.
- `npm test` passed (`187/187`).
- Release APK contains `assets/index.android.bundle`.

## Known Limitations
- iOS release artifact (IPA) is not included in this release.
