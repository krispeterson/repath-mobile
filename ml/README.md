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
npm run build:benchmark:supported-holdout
npm run check:benchmark:coverage
npm run benchmark:model:resolved
npm run benchmark:model:resolved:supported
npm run analyze:benchmark:results
```

`build:benchmark:supported-holdout` generates local holdout rows for currently supported candidate labels
using the Kaggle household-waste dataset and writes:
- `test/benchmarks/benchmark-manifest.supported-holdout.json`
- `test/benchmarks/images/supported-holdout/*`

For labels not covered by Kaggle folders, it uses
`test/benchmarks/benchmark-supported-holdout-overrides.seed.json` as manual URL fallbacks.
Rows that overlap with retraining sample URLs are automatically excluded from holdout generation.

`build:benchmark:resolved` now runs in `--no-download` mode by default for routine local iteration.
It uses cached/local URLs and marks unresolved remote rows as `todo` instead of blocking on network fetches.

Use `benchmark:model:resolved:supported` when your current model only covers a subset of taxonomy labels.
It evaluates only entries whose expected labels exist in the active model label file.
Use `analyze:benchmark:results` after a benchmark run to generate:
- `test/benchmarks/benchmark-error-analysis.json` (miss/FP/confusion summary)
- `test/benchmarks/benchmark-retraining-priority.csv` (prioritized label action list)
- `npm run build:benchmark:retraining-queue` to convert that priority list into
  `test/benchmarks/benchmark-retraining-queue.csv` placeholders for targeted data collection.
- `npm run merge:benchmark:retraining-queue` to preview importing retraining queue rows into
  `test/benchmarks/benchmark-labeled.csv` (script runs in `--dry-run` mode by default).
- `npm run fill:benchmark:retraining-negatives` to auto-fill unresolved retraining negative rows
  from existing curated negative URLs in the labeled dataset.

One-command loop for supported-model planning:
```bash
npm run benchmark:model:resolved:plan
```

To convert `retrain_*` rows in `benchmark-labeled.csv` into a compact training artifact:
```bash
npm run build:retraining:manifest
```
This writes `ml/artifacts/retraining/retraining-manifest.json` with positive and negative samples.
To auto-add new Kaggle-backed retraining positives for the weakest labels in
`test/benchmarks/latest-results.candidate.priority.csv`:
```bash
npm run expand:retraining:positives
```
You can target labels explicitly:
```bash
npm run expand:retraining:positives -- --labels "Tin Can,Cardboard" --per-label 3
```
The script avoids reusing Kaggle source images already present in retraining rows
and skips overlap with `test/benchmarks/benchmark-manifest.supported-holdout.json` when available.
To cache remote `retrain_positive_*` URLs locally (recommended before local-only bundle builds):
```bash
npm run materialize:retraining:positives
```
This rewrites those rows to repo-relative local paths and appends `source_url=...` in notes so
holdout generation can still exclude overlap with training sources.
To track locally cached retraining positive images in one migration-friendly file:
```bash
npm run build:retraining:image-inventory
```
This writes `test/benchmarks/retraining-positive-image-inventory.json`.
To keep a single audit log of known problematic retraining-positive sources and their current replacements:
```bash
npm run build:retraining:source-issues
```
This writes `test/benchmarks/retraining-positive-source-issues.json` from
`test/benchmarks/retraining-positive-source-issues.seed.json`.

To prepare an annotation-ready YOLO bundle (images, empty label files, class map, task sheet):
```bash
npm run build:annotation:bundle
```
For a local-only bundle build that skips remote URL downloads (recommended for flaky/DNS-limited environments):
```bash
npm run build:annotation:bundle:local
```
Then validate annotation completeness/format before training:
```bash
npm run validate:annotation:bundle
```
To prefill missing positive label files from model detections (optional bootstrap):
```bash
npm run seed:annotation:boxes
```
Use `--allow-fallback` if you want best-effort boxes even when class labels do not match.
If positives are still missing boxes and you need a weak-supervision fallback to unblock training,
fill only empty positive labels with full-frame boxes:
```bash
npm run fill:annotation:fallback-boxes
```
This should be treated as a temporary bootstrap step, not a replacement for real human box annotations.
Use strict mode (non-zero exit on any issue) in pre-training checks:
```bash
npm run validate:annotation:bundle:strict
```
To run the common post-expansion refresh sequence in one command:
```bash
npm run refresh:retraining:bundle
```
This refresh path uses the local-only bundle build so remote-only retraining rows are skipped instead of blocking.
This validator checks:
- positive rows have at least one YOLO box,
- negative rows remain empty,
- box coordinates are normalized and class IDs are valid.

To train a detector candidate from the annotation bundle:
```bash
npm run train:model:annotation:dry-run
```
(`train:model:annotation:dry-run` skips strict validation so you can verify wiring before annotations are complete.)
Then run real training/export after strict validation passes:
```bash
npm run train:model:annotation -- --model yolov8n.pt --epochs 40 --imgsz 640 --batch 8 --nms
```
This writes candidate artifacts into `ml/artifacts/models/candidates/<run-id>/`.

To train and immediately benchmark/compare:
```bash
npm run train:model:annotation:benchmark
```
For a fast pipeline smoke test (1 epoch, skips strict validation):
```bash
npm run train:model:annotation:smoke
```

To export a candidate model vocabulary from that retraining manifest:
```bash
npm run export:model:candidate -- --dry-run
```
Then run a real export (YOLO-World `.pt` source) when ready:
```bash
npm run export:model:candidate -- --model yolov8s-worldv2.pt --imgsz 640 --nms
```
This creates a candidate folder under `ml/artifacts/models/candidates/<run-id>/`.

To benchmark the latest candidate and generate analysis artifacts:
```bash
npm run benchmark:model:candidate
```
This command also refreshes the supported-holdout manifest and resolved benchmark manifest first.
To benchmark and then compare candidate vs current baseline:
```bash
npm run benchmark:model:candidate:compare
```
Comparison output is written to `test/benchmarks/latest-results.compare.json`.
The compare output includes both:
- `comparison`: raw baseline vs candidate summaries (can differ in evaluated rows if label support differs).
- `overlap.comparison`: apples-to-apples metrics on the intersection of rows evaluated by both runs.

To promote the benchmarked candidate into app runtime assets (`assets/models/yolo-repath.tflite` + labels):
```bash
npm run promote:model:candidate
```
By default this prefers the candidate referenced by
`test/benchmarks/latest-results.candidate.analysis.json` and falls back to the newest candidate folder.
Use `-- --candidate-id <run-id>` (or `-- --candidate-dir <path>`) to force a specific candidate.
Dry-run preview:
```bash
npm run promote:model:candidate:dry-run
```
Promotion also writes local metadata to `ml/artifacts/models/active-model.json`.

Important:
- This candidate export flow updates vocabulary from retraining priorities.
- Full detector retraining runs through `train:model:annotation` and needs completed box annotations.
- Training/export helpers default to NMS-enabled TFLite output so benchmark/app decoders receive `[N, 6]` detections.
- Use `--no-nms` only for advanced debugging; benchmark scripts will reject raw YOLO head outputs.

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
