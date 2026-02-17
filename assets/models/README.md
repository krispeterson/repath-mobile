# Models

This folder holds the on-device model assets used by the camera scan flow.
We run YOLOv8 in TFLite format for real-time inference. The app loads:
- `yolo-repath.tflite` (model weights)
- `yolo-repath.labels.json` (array of class labels matching model indices)

Preferred path: pull a semantically versioned model release from `krispeterson/repath-model`:
```bash
npm run pull:model:release
```
To lock/update source version, edit `assets/models/model-release.json`.

You only need to do the export steps below if you want to:
- swap to a different YOLOv8 variant,
- use custom classes, or
- improve accuracy/size with quantization.

Model binaries are not committed to git. You must generate them locally and place
the outputs in this folder.

## Official pretrained models (YOLOv8 `.pt`)

Ultralytics hosts official pretrained YOLOv8 weights. Useful references:
- [Ultralytics assets repository (official weights host)](https://github.com/ultralytics/assets)
- [YOLOv8 models page (variants + metrics)](https://docs.ultralytics.com/models/yolov8/)

The Ultralytics API auto-downloads pretrained weights when you reference the
model name (e.g., `yolov8n.pt`, `yolov8s.pt`).

## Where to get `yolov8.pt`
You can use any YOLOv8 `.pt` weights:
- Official Ultralytics pretrained models (e.g. `yolov8n.pt`, `yolov8s.pt`, etc.).
- Your custom-trained weights from a YOLOv8 training run.

If you download a pretrained model, place the `.pt` file anywhere on your machine;
it does not need to live inside this repo. You'll pass its path to the export script.

## Export YOLOv8 to TFLite

Recommended path (Ultralytics CLI):
1) Install Ultralytics.
   ```bash
   pip install ultralytics
   ```
2) Export your model.
   ```bash
   yolo export model=/path/to/yolov8.pt format=tflite imgsz=640 nms=True
   ```

Optional quantization:
- FP16:
  ```bash
  yolo export model=/path/to/yolov8.pt format=tflite imgsz=640 half=True
  ```
- INT8 (requires dataset yaml):
  ```bash
  yolo export model=/path/to/yolov8.pt format=tflite imgsz=640 int8=True data=/path/to/data.yaml
  ```

## Helper script (recommended)

Python requirement:
- Python 3.11 is required for the export toolchain (`ultralytics[export]`, TensorFlow, onnx2tf).
- `npm` model scripts auto-detect Python in this order: `$PYTHON`, `./.venv/bin/python`, `python3`, `python`, `py -3`.
- Set `PYTHON` if you need to force a specific interpreter:
  ```bash
  export PYTHON=/absolute/path/to/python3.11
  ```

Default model (YOLOv8n):
```bash
npm run fetch:model -- --imgsz 640 --nms --out-dir assets/models
```

Custom model:
```bash
node scripts/run-python.js scripts/fetch-yolov8n-tflite.py \
  --model /path/to/yolov8.pt \
  --imgsz 640 \
  --nms \
  --out-dir assets/models
```

The helper script copies the exported `.tflite` into `assets/models/yolo-repath.tflite` and
writes `assets/models/yolo-repath.labels.json`. Manual copy is not required if you use the helper.

Notes:
- The app assumes a 640x640 input. If you export with a different size, update `src/domain/scan.js`.
- Labels must align with the model's class ordering or detections won't map correctly.

## Class list extraction (local files or URLs)

If you are building a custom class list from an HTML index and item pages, use:
```bash
npm run extract:classes -- --index /path/to/index.html --items-dir /path/to/items --out-dir assets/models
```

You can also point directly at a live URL and optionally fetch each item detail page:
```bash
npm run extract:classes -- --index https://example.com/recycling/ --fetch-items --out-dir assets/models
```

Outputs:
- `assets/models/classes.json` (array of class labels)
- `assets/models/classes.txt` (newline-delimited labels)
- `assets/models/classes.meta.json` (source paths + item metadata)

Tip: add `--download-dir /path/to/save` to archive fetched item pages while using `--fetch-items`.

By default this includes any keywords on the index. To use names only:
```bash
npm run extract:classes -- --index /path/to/index.html --no-keywords --out-dir assets/models
```

If the index file is local but links are relative, provide a base URL:
```bash
npm run extract:classes -- --index /path/to/index.html --base-url https://example.com/recycling/ --fetch-items --out-dir assets/models
```

## Curated "common items" list (recommended for accuracy)

Open-vocabulary models get noisier as the class list grows. Start with a curated
list of common consumer items (120-180 items) and expand over time.

Use the provided allowlist file to filter the extracted index:
```bash
npm run extract:classes -- \
  --index https://apps.fcgov.com/recycling/ \
  --fetch-items \
  --allowlist assets/models/common-classes.txt \
  --out-dir assets/models
```
The `apps.fcgov.com` URL above is only an example source. Replace it with your municipality's index URL.

You can edit `assets/models/common-classes.txt` to adjust the vocabulary.

## Municipal curbside POC subset (40 classes)

Generate a deterministic curbside-only class list and label map from the bundled
municipal pack:
```bash
npm run build:poc:curbside
```

Outputs:
- `assets/models/poc-curbside.classes.json`
- `assets/models/poc-curbside.classes.txt`
- `assets/models/poc-curbside.label-map.json`

Export a YOLO-World model against this subset:
```bash
npm run fetch:model -- \
  --model yolov8s-worldv2.pt \
  --classes assets/models/poc-curbside.classes.json \
  --imgsz 640 \
  --nms \
  --out-dir assets/models
```

The app uses `poc-curbside.label-map.json` to map detected labels directly to
pack item IDs before token heuristics.

## Using a custom class list with YOLO-World

If you are using YOLO-World (exportable v2 variants), you can embed a fixed class
list before export and keep inference fully on-device.

1) Generate a class list (see above), then export:
```bash
npm run fetch:model -- \
  --model /path/to/yolov8s-worldv2.pt \
  --classes assets/models/classes.json \
  --imgsz 640 \
  --nms \
  --out-dir assets/models
```

The `--classes` file is also used to write `assets/models/yolo-repath.labels.json`, so
label ordering stays in sync.

## Label alignment
This app assumes the model uses the standard COCO-80 label order (the default for Ultralytics `yolov8n.pt`).
If labels and model are out of sync, detections will look confident but wrong.
Always regenerate `yolo-repath.labels.json` with the same export script that produced `yolo-repath.tflite`.

## Troubleshooting

- **SSL certificate verification failed when exporting YOLO-World**
  - If you see `SSL: CERTIFICATE_VERIFY_FAILED` while running `fetch:model`, your Python SSL
    store may be missing your network's root certificate. A quick fix is to point Python
    at `certifi`'s CA bundle:
    ```bash
    python3 -m pip install certifi
    export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")
    ```
  - Then re-run the export command.

## Benchmarking model swaps

Run a fixed benchmark manifest (public images, expected labels, and negatives):
```bash
npm run benchmark:model
```

This writes detailed results to `test/benchmarks/latest-results.json` and prints:
- micro precision/recall
- positive-case hit rate (`any_hit_rate`)
- negative clean rate (`negative_clean_rate`)
