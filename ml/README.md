# ML Workspace

This folder separates model/data/evaluation tooling from app runtime UI code.

## Layout
- `ml/data/` taxonomy generation + data source suggestion scripts
- `ml/eval/` benchmark build/sync/audit tools + benchmark runner
- `ml/training/` model export and training helpers
- `ml/artifacts/` local generated ML artifacts (recommended: keep untracked)

## Recommended Workflow
1) Build taxonomy:
```bash
npm run build:taxonomy
```

2) Build benchmark manifest and coverage:
```bash
npm run build:benchmark:manifest
npm run check:benchmark:coverage
```

3) Generate/refresh labeling queue:
```bash
npm run plan:benchmark:priority
npm run build:benchmark:batches
npm run build:benchmark:template
```

4) Suggest sources, then sync progress:
```bash
npm run suggest:benchmark:kaggle
npm run suggest:benchmark:online
npm run sync:benchmark:progress -- --completed test/benchmarks/benchmark-labeled.csv
```

Kaggle dataset resolution order:
1. `--kaggle-dir` CLI arg
2. `KAGGLE_WASTE_DIR` env var
3. `ml/artifacts/datasets/kaggle-household-waste/images/images`
4. `../Kaggle Household Waste Images/images/images` (sibling folder)

5) Build resolved local manifest and run offline benchmark:
```bash
npm run build:benchmark:resolved
npm run benchmark:model:resolved
```
