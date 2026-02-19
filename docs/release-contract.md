# RePath Mobile Release Contract

This document defines the release artifacts and publishing workflow for `repath-mobile`.

## Required release notes

- `release-notes.md` is the source of truth for user-facing release notes.
- Each tagged release should update `release-notes.md` with:
  - version,
  - user-facing additions,
  - shipped artifacts,
  - known limitations.

## Required Android artifacts

Each tagged release should publish:
- `app-release-vX.Y.Z.apk`
- `app-release-vX.Y.Z.apk.sha256`
- `app-release-vX.Y.Z.aab`
- `app-release-vX.Y.Z.aab.sha256`
- `output-metadata-release-vX.Y.Z.json`

Notes:
- Release workflow builds both a release APK (direct install/testing) and release AAB (Play upload).
- Release signing keys are required by default; debug-signing fallback is local-only (`--allow-debug-signing`).
- Signing vars (env): `REPATH_UPLOAD_STORE_FILE`, `REPATH_UPLOAD_STORE_PASSWORD`, `REPATH_UPLOAD_KEY_ALIAS`, `REPATH_UPLOAD_KEY_PASSWORD`

## Reproducible release command

Use:
```bash
npm run release:android -- --tag vX.Y.Z
```

To publish to GitHub Releases (and sync notes body):
```bash
npm run release:android:publish -- --tag vX.Y.Z
```

Build AAB-only:
```bash
npm run release:android:aab -- --tag vX.Y.Z
```

The command:
1. Builds Android release APK + AAB (`./gradlew assembleRelease bundleRelease`)
2. Copies artifacts into `dist/releases/<tag>/`
3. Generates SHA-256 files for each artifact
4. Optionally uploads assets to GitHub Release and sets release body from `release-notes.md`
