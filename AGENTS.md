# Agents

This repo is a small Expo prototype that consumes bundled RePath packs.

## Guardrails
- Keep pack assets in sync with `repath-core` outputs.
- Prefer small, readable scripts under `scripts/` over new dependencies.
- Avoid network calls in scripts; operate on local files only.
- Object detection uses VisionCamera + YOLOv8 TFLite; keep inference on-device.

## Common tasks
```bash
npm run start
npm run smoke
```

## App structure (high level)
- `assets/packs/` (bundled packs + search index)
- `assets/models/` (YOLOv8 TFLite model + labels)
- `src/App.js` (UI + search + scan flow)
