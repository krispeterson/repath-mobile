# RePath Mobile
[![Tests And Coverage](https://github.com/krispeterson/repath-mobile/actions/workflows/tests-and-coverage.yml/badge.svg)](https://github.com/krispeterson/repath-mobile/actions/workflows/tests-and-coverage.yml)
[![codecov](https://codecov.io/gh/krispeterson/repath-mobile/branch/main/graph/badge.svg)](https://codecov.io/gh/krispeterson/repath-mobile)

## Why RePath Mobile exists

Recycling is confusing not because people don’t care, and not because municipalities aren’t trying — but because the system is inherently complex. Rules vary by city, by hauler, by material, by housing type, and by market conditions that change faster than public guidance can realistically keep up.

People are expected to make correct, context-dependent decisions in real time, often with incomplete or outdated information. Municipal recycling programs know this tension well.

**RePath Mobile exists to reduce that friction.**

This app is a camera-first, offline-capable guide that helps people decide what to do with the thing in their hand *right now*: reuse it, give it away, sell it, recycle it, take it to a drop-off location, or trash it as a last resort — based on local rules and real-world constraints.

I am building RePath Mobile because:
- Recycling is an **information-routing problem**, not an education or motivation problem
- “Is this recyclable?” is the wrong question, but it’s the question people have
- Clear, **ranked options** reduce contamination more effectively than yes/no answers
- Reuse, resale, and proper disposal are as important as recycling itself
- Tools that lower cognitive load outperform tools that rely on perfect behavior

This repository contains a thin mobile client that consumes **RePath Core** decision logic and municipal data packs. It is designed to complement — not replace — existing municipal guidance by making that guidance more accessible at the moment decisions are made.

For municipalities and recycling professionals, RePath is intended to be a **force multiplier**:
- a way to extend local rules into people’s pockets
- a mechanism to reduce wishcycling without increasing enforcement or outreach burden
- a shared, updatable interface between complex programs and everyday behavior

RePath is not about assigning blame. It’s about acknowledging complexity — and giving people a better path through it.

## What it is

Minimal React Native (Expo) prototype that:
- asks for location (or ZIP)
- loads a municipality pack
- renders up to 5 ranked Option Cards
- uses a bundled search index (`assets/packs/search.json`) for lookup
- supports camera detection (YOLOv8 TFLite, single-shot frame processor for POC stability)

This is a thin proof-of-concept. Replace bundled packs with remote manifest + cached downloads.

## Testing

Run tests locally:
```bash
npm test
npm run test:coverage
```

`npm test` discovers suites in this order:
- `test/unit/**/*.unit.cjs`
- `test/integration/**/*.integration.cjs`
- `test/acceptance/**/*.acceptance.cjs`

Notes:
- Root-level `test/*.test.cjs` files are not executed by the current runner.
- For pull requests, CI publishes coverage summary/artifacts and posts coverage delta comments.
- Set `CODECOV_TOKEN` in GitHub Actions secrets (required for private repositories).

## Release workflow

Release notes source-of-truth:
- `release-notes.md`

Android artifact build (local):
```bash
npm run release:android -- --tag vX.Y.Z
```

Android artifact build + GitHub release upload:
```bash
npm run release:android:publish -- --tag vX.Y.Z
```

The release script produces:
- `app-release-vX.Y.Z.apk`
- `app-release-vX.Y.Z.apk.sha256`
- `app-release-vX.Y.Z.aab`
- `app-release-vX.Y.Z.aab.sha256`
- `output-metadata-release-vX.Y.Z.json`

The release command also verifies:
- checksums match generated artifacts
- APK contains `assets/index.android.bundle`
- metadata `versionName`/`versionCode` match the tag

Debug build command is still available for local Metro-connected testing:
```bash
npm run release:android:debug -- --tag vX.Y.Z
```

Production signing inputs (environment variables):
- `REPATH_UPLOAD_STORE_FILE`
- `REPATH_UPLOAD_STORE_PASSWORD`
- `REPATH_UPLOAD_KEY_ALIAS`
- `REPATH_UPLOAD_KEY_PASSWORD`

For local non-production testing only, you can bypass signing enforcement with:
```bash
npm run release:android -- --tag vX.Y.Z --allow-debug-signing
```

Manual verification for an already-built release directory:
```bash
npm run verify:release:android -- --tag vX.Y.Z
```

Optional CI guardrail:
- Run the `Android Release Guardrails` workflow manually to validate release packaging on GitHub-hosted runners.

See `docs/release-contract.md` for artifact contract details.

## Object detection
The scan flow uses VisionCamera frame processors with a YOLOv8 TFLite model for single-shot detection (POC), then maps
labels to pack items via the bundled search index.

Requirements:
- Development build (VisionCamera + TFLite are native modules; not supported in Expo Go).
- Pull a released model from `krispeterson/repath-model`:
  ```bash
  npm run pull:model:release
  ```
  - Pinned/default source is configured in `assets/models/model-release.json`.
  - Model training/export lives in `repath-model` (not this repo).
- Detection boxes are hidden by default. For local debugging, set:
  - `EXPO_PUBLIC_SHOW_DETECTION_BOXES=1`

Dependencies used:
- `react-native-vision-camera`
- `react-native-fast-tflite`
- `react-native-worklets-core`

Install guidance (network required):
- `npm install`

## Development setup (macOS)

1) Install project dependencies:
   ```bash
   npm install
   ```
2) Pull the currently configured model release:
   ```bash
   npm run pull:model:release
   ```
   This verifies model checksums against the release manifest by default.
3) Create a development build (required for VisionCamera + TFLite):
   ```bash
   npm run prebuild
   npm run android
   ```
   Note: This POC uses `Frame.toArrayBuffer()` for resizing, which requires Android `minSdkVersion` 26+ (set via the `expo-build-properties` plugin in `app.json`).
   `npm run prebuild` generates `android/` and `ios/` from Expo and then applies a small patch
   that only bumps Gradle/AGP/Kotlin if the generated versions are below the minimums we need. This
   keeps the workflow reproducible even when the generated template versions change, without
   overriding newer versions. Minimums checked: Gradle 8.6, AGP 8.4.2, Kotlin 1.9.24.

   The POC uses a simple JS resize in the frame processor (pixelFormat `rgb`) to avoid extra native
   dependencies. This is slower than the resize plugin but more stable for a prototype.

   Performance note: this is CPU-heavy and throttled to ~1 FPS for stability. If we move beyond POC,
   we should swap to a dedicated native resize plugin or a GPU-backed preprocessing path.
   This builds a dev client that includes native modules. Expo Go will not work.

4) Start the dev server:
   ```bash
   npm run start
   ```



Notes:
- The camera pipeline requires a development build (custom native modules). Expo Go will not work.
- `android/` and `ios/` are generated by Expo prebuild and are intentionally ignored. If you upgrade
  Expo/RN, re-run `npm run prebuild` and confirm the patch script still applies cleanly.
- Model binaries in `assets/models/` are local files. Labels/config metadata are tracked.
  See `assets/models/README.md` for model release integration details.

Model workspace note:
- Training/evaluation/release workflows are now owned by `repath-model`.
- In this repo, run `npm run ml:workspace` for handoff instructions.
- Separation roadmap: `docs/model-repo-separation-plan.md`.

## Troubleshooting

- **Expo Go shows a blank camera / scan button fails**
  - Use a development build; VisionCamera + TFLite are native modules and do not run in Expo Go.

- **`Model not loaded` error**
  - Ensure `assets/models/yolo-repath.tflite` exists and is not empty.
  - Restart Metro after adding the model so it gets bundled.

- **Poor detection accuracy**
  - Confirm your labels in `yolo-repath.labels.json` match the model classes.
  - Verify the model input size in `src/App.js` matches your exported model size.

- **Metro doesn't bundle .tflite**
  - Ensure `metro.config.js` includes `tflite` in `assetExts`.
