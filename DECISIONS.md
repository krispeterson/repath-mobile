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
