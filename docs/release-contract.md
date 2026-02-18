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
- `app-debug-vX.Y.Z.apk`
- `app-debug-vX.Y.Z.apk.sha256`
- `output-metadata-vX.Y.Z.json`

Notes:
- Current workflow publishes a debug APK for installation/testing.
- Production Play distribution should use a signed release build (`.aab` or release APK) in a later hardening phase.

## Reproducible release command

Use:
```bash
npm run release:android:debug -- --tag vX.Y.Z
```

To publish to GitHub Releases (and sync notes body):
```bash
npm run release:android:debug:publish -- --tag vX.Y.Z
```

The command:
1. Builds Android debug APK (`./gradlew assembleDebug`)
2. Copies artifacts into `dist/releases/<tag>/`
3. Generates APK SHA-256 file
4. Optionally uploads assets to GitHub Release and sets release body from `release-notes.md`
