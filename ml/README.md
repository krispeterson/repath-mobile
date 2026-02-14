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

## Recommended Workflow
1. Build taxonomy and benchmark scaffold:
```bash
npm run build:taxonomy
npm run build:benchmark:manifest
npm run check:benchmark:coverage
```

2. Build/refresh labeling queue:
```bash
npm run plan:benchmark:priority
npm run build:benchmark:batches
npm run build:benchmark:template
```

3. Add labeled sources, normalize paths, and sync progress:
```bash
npm run suggest:benchmark:kaggle
npm run suggest:benchmark:online
npm run normalize:benchmark:urls
npm run sync:benchmark:progress -- --completed test/benchmarks/benchmark-labeled.csv
```

4. Build resolved local manifest and evaluate:
```bash
npm run build:benchmark:resolved
npm run benchmark:model:resolved
```

5. Optional one-command pipeline:
```bash
npm run run:benchmark:pipeline -- --skip-benchmark
```

Pipeline note:
- Network suggestion steps are best-effort by default.
- Use `--strict-network` to fail fast on network errors.

Kaggle dataset resolution order:
1. `--kaggle-dir` CLI arg
2. `KAGGLE_WASTE_DIR` env var
3. `ml/artifacts/datasets/kaggle-household-waste/images/images`
4. `../Kaggle Household Waste Images/images/images` (sibling folder)
