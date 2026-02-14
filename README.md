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

## Object detection
The scan flow uses VisionCamera frame processors with a YOLOv8 TFLite model for single-shot detection (POC), then maps
labels to pack items via the bundled search index.

Requirements:
- Development build (VisionCamera + TFLite are native modules; not supported in Expo Go).
- Generate `assets/models/yolov8.tflite` and `assets/models/yolov8.labels.json` locally (see `assets/models/README.md`).
  - For YOLO-World custom vocab, see the class list extraction + export steps in `assets/models/README.md`.

Dependencies used:
- `react-native-vision-camera`
- `react-native-fast-tflite`
- `react-native-worklets-core`

Install guidance (network required):
- `npm install`

## Development setup (macOS)

1) Ensure **Python 3.11** is installed.
   - Reason: Ultralytics TFLite export depends on TensorFlow + onnx2tf, and those packages
     currently do not provide compatible wheels for Python 3.12+ or 3.14.
   - Verify:
     ```bash
     python3 --version
     which python3
     ```
   - If this does not show `Python 3.11.x`, update your PATH or version manager.
   - Python script commands in `package.json` auto-detect in this order:
     - `$PYTHON` (if set)
     - `./.venv/bin/python`
     - `python3`
     - `python`
     - `py -3` (Windows launcher)
   - You can pin the interpreter explicitly:
     ```bash
     export PYTHON=/absolute/path/to/python3.11
     ```
2) Create and activate a virtual environment (recommended to isolate deps):
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3) Install Ultralytics export deps:
   ```bash
   pip install --upgrade pip
   pip install "ultralytics[export]"
   ```
4) Install project dependencies:
   ```bash
   npm install
   ```
5) (Optional) Export a YOLOv8 TFLite model and labels if you need to swap models, use custom classes,
   or improve accuracy. See `assets/models/README.md` for when and why this is needed.
   Note: TACO classes require a custom-trained `.pt` checkpoint; the default Ultralytics weights are
   COCO-based.

   Quick start (default `yolov8s.pt`):
   ```bash
   npm run fetch:model -- --imgsz 640 --nms --out-dir assets/models
   ```

6) Create a development build (required for VisionCamera + TFLite):
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

7) Start the dev server:
   ```bash
   npm run start
   ```



Notes:
- The camera pipeline requires a development build (custom native modules). Expo Go will not work.
- `android/` and `ios/` are generated by Expo prebuild and are intentionally ignored. If you upgrade
  Expo/RN, re-run `npm run prebuild` and confirm the patch script still applies cleanly.
- Model binaries in `assets/models/` are generated locally and ignored by git. See
  `assets/models/README.md` for model export details and quantization options.

## Optional ML Workspace (Advanced)

Most developers can skip this and focus on app behavior.
Use this only when improving model quality, benchmark coverage, or dataset/training workflows.

- ML workflows live in `ml/README.md`.
- Model export details live in `assets/models/README.md`.

Common advanced commands:
```bash
npm run ml:scaffold
npm run ml:labeling:queue
npm run ml:evaluate
```

One-command benchmark data prep pipeline:
```bash
npm run ml:all
```

Network suggestion steps are best-effort by default.
Use `--strict-network` to fail fast on network errors.

## Troubleshooting

- **Expo Go shows a blank camera / scan button fails**
  - Use a development build; VisionCamera + TFLite are native modules and do not run in Expo Go.

- **`Model not loaded` error**
  - Ensure `assets/models/yolov8.tflite` exists and is not empty.
  - Restart Metro after adding the model so it gets bundled.

- **`python3` still points to Python 3.9**
  - Set `PYTHON` to a Python 3.11 binary:
    ```bash
    export PYTHON=/absolute/path/to/python3.11
    ```
  - Or update your PATH/version manager so `python3` resolves to Python 3.11.
  - Verify with `which python3` and `python3 --version`.

- **`ultralytics[export]` install fails**
  - Confirm you are using Python 3.11 inside the venv.

- **Poor detection accuracy**
  - Confirm your labels in `yolov8.labels.json` match the model classes.
  - Verify the model input size in `src/App.js` matches your exported model size.

- **Metro doesn't bundle .tflite**
  - Ensure `metro.config.js` includes `tflite` in `assetExts`.
