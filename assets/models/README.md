# Models

This folder stores the model assets consumed by the mobile scan flow.

Runtime files used by the app:
- `yolo-repath.tflite`
- `yolo-repath.labels.json`

Preferred workflow (consumer mode):
```bash
npm run pull:model:release
```

This command pulls a published GitHub release from `krispeterson/repath-model` and writes:
- `assets/models/yolo-repath.tflite`
- `assets/models/yolo-repath.labels.json`
- `assets/models/yolo-repath.release-manifest.json` (if present)
- `assets/models/active-model.release.json`

## Version pinning

Configure the default source in `assets/models/model-release.json`.
Example:
```json
{
  "repo": "krispeterson/repath-model",
  "version": "v0.1.0"
}
```

You can also override on demand:
```bash
npm run pull:model:release -- --version v0.1.0
npm run pull:model:release -- --version latest
```

## Training/export location

Model training, benchmarking, export, and release packaging are intentionally out of `repath-mobile`.
Use `repath-model` for all model-development workflows.

## Troubleshooting

- If scan fails with model-load errors, verify `assets/models/yolo-repath.tflite` exists and is non-empty.
- After pulling a new model, restart Metro so assets are re-bundled.
