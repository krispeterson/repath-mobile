# Agents

This repo is a small Expo prototype that consumes bundled RePath packs.

## Guardrails
- Keep pack assets in sync with `repath-core` outputs.
- Prefer small, readable scripts under `scripts/` over new dependencies.
- Object detection uses VisionCamera + YOLOv8 TFLite; keep inference on-device.
- Classes, functions, methods, statements, etc should all be human readable and maintainable, short and concise to the point of essentially self-documented, and be documented and/or commented when necessary.
- Unit, integration, and acceptance tests will be written in that priority order that ensure functional intent and prevent bug regression.
- `npm test` discovers tests only from:
  - `test/unit/**/*.unit.cjs`
  - `test/integration/**/*.integration.cjs`
  - `test/acceptance/**/*.acceptance.cjs`
- Do not add root-level `test/*.test.cjs` files; they are not executed by the current runner.
- Any change to domain logic (`src/domain/**`) should include or update unit tests; add integration tests when behavior depends on bundled pack/model data.

## Common tasks
```bash
npm run start
npm run smoke
```

## App structure (high level)
- `assets/packs/` (bundled packs + search index)
- `assets/models/` (YOLOv8 TFLite model + labels)
- `src/App.js` (UI + search + scan flow)
