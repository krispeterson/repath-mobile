# ML Workspace

This workspace is for model and dataset work that is optional for most app developers.
Use it when you need to improve scan quality, add benchmark coverage, compare model versions, or retrain/export model assets.

If you are only developing app UI/flows, you usually do not need this folder.

## What This Workspace Is For
- Build and maintain a municipality taxonomy used to define what the model should recognize.
- Build and manage benchmark manifests to measure detection quality consistently over time.
- Prepare datasets and labels from local/online sources.
- Export and evaluate on-device model assets (`.tflite` + labels).

## When You Would Use It
- Detection quality regresses after a model swap.
- A municipality adds/removes item categories.
- You need better coverage for low-performing categories.
- You want repeatable benchmark metrics before/after model changes.

## Layout
- `ml/data/`: taxonomy build + dataset suggestion/normalization scripts.
- `ml/eval/`: benchmark manifest build/sync/audit + benchmark runner/pipeline.
- `ml/training/`: model export/training helper scripts.
- `ml/artifacts/`: local generated ML artifacts (keep untracked).

## Taxonomy: What It Is And Why Regenerate
Taxonomy is the canonical list of items/aliases derived from the selected municipal pack.
It defines the expected label space for benchmark coverage and prioritization.

Regenerate taxonomy when:
- pack content changes (new items, aliases, renamed labels),
- you switch the target municipality pack,
- benchmark coverage reports show label drift.

Command:
```bash
npm run build:taxonomy
```

## Benchmarks: What They Are And Why Run Them
Benchmarks are fixed image manifests with expected labels (and negative examples) used to measure model behavior.
They let you compare model quality across versions with consistent inputs.

Run benchmarks when:
- testing a new model export or threshold,
- validating changes to label mapping logic,
- checking for regressions after data/pack updates.

Core commands:
```bash
npm run build:benchmark:manifest
npm run check:benchmark:coverage
npm run benchmark:model:resolved
```

## Model And Training Helpers
`ml/training/` and related scripts support export and model artifact preparation for mobile use.
Typical usage is exporting YOLOv8/YOLO-World variants to TFLite and keeping labels aligned with model outputs.

Key command:
```bash
npm run fetch:model -- --imgsz 640 --nms --out-dir assets/models
```

For detailed model export/class-list workflows, see `assets/models/README.md`.

## Other Local Generated ML Artifacts
Common generated files include:
- benchmark manifests and reports in `test/benchmarks/` (coverage/audit/progress outputs),
- cached benchmark images in `test/benchmarks/images/`,
- resolved local benchmark manifest (`municipal-benchmark-manifest.resolved.json`),
- local dataset caches under `ml/artifacts/`,
- model binaries and label files in `assets/models/` generated locally.

Most generated files are ignored to keep commits clean.

## Before You Start
- Some steps depend on network access (Kaggle suggestions, Wikimedia suggestions, remote image fetches).
- Network suggestion steps are best-effort by default in the pipeline.
- Use `--strict-network` to fail fast on network errors.
- Optional but recommended: bootstrap a stable local Kaggle dataset path once:
  ```bash
  npm run bootstrap:dataset:kaggle
  ```
- If you plan to use Kaggle suggestions, either:
  - set `KAGGLE_WASTE_DIR=/path/to/.../images/images`, or
  - pass `--kaggle-dir` when running the pipeline script directly.

Kaggle dataset resolution order:
1. `--kaggle-dir` CLI arg
2. `KAGGLE_WASTE_DIR` env var
3. `ml/artifacts/datasets/kaggle-household-waste/images/images`
4. `../Kaggle Household Waste Images/images/images` (sibling folder)

## Manual Steps To Expect
- Review and curate `test/benchmarks/benchmark-labeled.csv` entries.
- Use `test/benchmarks/benchmark-coverage-expansion-template.csv` to fill classes below target ready-count coverage.
- If class depth is too low, seed additional placeholders before ingest:
  ```bash
  npm run seed:benchmark:depth -- --target-ready 3 --max-new 150
  ```
- If negatives are too low, seed additional negative placeholders:
  ```bash
  npm run seed:benchmark:negatives
  ```
- Validate suggested URLs/images for relevance and quality.
- Add/correct labels for difficult classes before retraining.
- Export unresolved rows with search links for fast manual triage:
  ```bash
  npm run export:benchmark:unresolved
  ```
- Decide when to export/swap model binaries (`assets/models/`) based on benchmark results.

## Recommended Workflow
Use these grouped pointer scripts for the common flows:

1. Build taxonomy + benchmark scaffold:
```bash
npm run ml:scaffold
```

2. Build/refresh labeling queue:
```bash
npm run ml:labeling:queue
```
This also generates:
- `test/benchmarks/benchmark-coverage-expansion-report.json`
- `test/benchmarks/benchmark-coverage-expansion-template.csv`
- `test/benchmarks/benchmark-completion-template.csv`

3. Ingest suggestions + normalize + sync progress:
```bash
npm run ml:labeling:ingest
```
This starts by merging `benchmark-coverage-expansion-template.csv` into `benchmark-labeled.csv`
so low-coverage labels enter the active labeling queue automatically.
It also syncs missing `todo` rows from the benchmark manifest into the labeled queue first.
Before sync, duplicate URLs in the labeled CSV are cleared so reused images are forced back to `todo`.
Sync runs with `--clear-empty-url`, so blank URLs in the labeled CSV clear stale manifest URLs.

For a broader online sweep across unresolved rows, use:
```bash
npm run ml:labeling:ingest:deep
```
The deep sweep is adaptive and avoids re-querying rows already marked `no_match`.
Both ingest commands also attempt to fill negative entries via Wikimedia Commons scene queries.

4. Build resolved local manifest and evaluate:
```bash
npm run ml:evaluate
```

5. Optional all-in-one benchmark prep:
```bash
npm run ml:all
```
