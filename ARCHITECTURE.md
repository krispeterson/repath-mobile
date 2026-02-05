# Architecture

RePath Mobile is a data-first Expo prototype. It loads bundled packs and uses a lightweight
search index to map user input or detections to item option cards.

## Components
- `assets/packs/`: Bundled packs and `search.json` index.
- `assets/models/`: YOLOv8 TFLite model and labels.
- `src/App.js`: UI flow, search, and camera detection pipeline.

## Data flow
1. User selects a ZIP or device location.
2. App resolves the pack via `assets/packs/manifest.json` and loads the bundled pack.
3. Text search maps tokens to items via `assets/packs/search.json`.
4. Camera scan uses VisionCamera frame processors to run YOLOv8 TFLite inference.
5. Detected labels map to items via the same search index and render option cards.

## Object detection pipeline
- VisionCamera frame processor captures frames at a low FPS.
- `vision-camera-resize-plugin` resizes frames to the YOLO input size.
- `react-native-fast-tflite` runs the TFLite model.
- Detected labels map to pack items via the search index.

Notes:
- Requires a development build (custom native modules).
- Model input size and labels must match the bundled YOLOv8 model.
