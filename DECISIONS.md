# Decisions

Record significant decisions and rationale here.

## 2026-02-04 - Bundled packs + search index
- Use bundled pack JSON + search index for offline prototype flow.
- Map ZIP codes to packs via `assets/packs/manifest.json`.

## 2026-02-04 - Real-time object detection with YOLOv8 (TFLite)
- Use VisionCamera frame processors for real-time detection.
- Use YOLOv8 exported to TFLite for on-device inference.
- Use `react-native-fast-tflite` with the resize plugin for performance.

## 2026-02-04 - Export helper uses Python + Node wrapper
- YOLOv8 TFLite export relies on Ultralytics, which is Python-based.
- Keep a Python script as the source of truth and add a Node wrapper for convenience.
- Avoid adding a heavy Node ML export dependency just for model conversion.

## 2026-02-04 - Default model: yolov8n.pt
- Start with `yolov8n.pt` for best real-time performance on mobile.
- Revisit `yolov8s.pt` if accuracy is insufficient.

## 2026-02-13 - Auto-discovered test suites with ordered execution
- `npm test` uses `test/run-tests.cjs` to auto-discover tests by suffix and directory.
- Execution order is fixed to: unit, then integration, then acceptance.
- Old root `test/domain-*.test.cjs` tests were migrated/removed to avoid dead or duplicate test coverage.

## 2026-02-13 - Test harness uses CommonJS; app/domain remains ESM
- The custom Node test runner and test files use `*.cjs` for deterministic direct Node execution without adding Babel/Jest.
- This avoids module-system conflicts with Expo/Metro and `package.json` module-type settings.
- Scope is test infrastructure only; `src/**` app/domain modules remain ESM-style modules.

## 2026-02-13 - Domain modules must remain compatible with test runtime
- The custom Node test runner imports `src/domain/**` modules directly.
- Keep syntax in those modules compatible with the project's Node runtime baseline used by CI/local test commands.
- Prefer explicit property access patterns if newer syntax support is uncertain in the active runtime.
