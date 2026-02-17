# Model Repo Separation Plan

## Target state

`repath-mobile` is an app/runtime consumer only.
It consumes versioned model releases from `repath-model` and does not run model training/evaluation scripts.

## Phase 1 (implemented)

- Remove model-development npm workflows from `repath-mobile/package.json`.
- Keep only release pull commands (`pull:model:release*`) in mobile.
- Add an explicit handoff command (`npm run ml:workspace`) that points contributors to `repath-model`.
- Update `README.md` and `assets/models/README.md` to reflect consumer-only behavior.

## Phase 2 (next)

- Remove legacy `ml/` training/eval/data wrapper directories from `repath-mobile`.
- Move any remaining benchmark/training-only docs from `repath-mobile/ml/README.md` into `repath-model` docs.
- Keep only runtime model metadata in `repath-mobile/assets/models`.

## Phase 3 (release contract hardening)

- Define and document a stable release artifact contract in `repath-model`:
  - required assets (`*.tflite`, `*.labels.json`, release manifest),
  - checksum validation behavior,
  - optional model metadata fields.
- Add a lightweight verification step in `repath-mobile` after pull (manifest + checksum validation).

## Phase 4 (shared consumer path)

- Extract a reusable release-consumer script/library so non-RePath apps can pull model releases consistently.
- Keep `repath-mobile` as one consumer of that contract.
