#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import tempfile

try:
    from ultralytics import YOLO
except Exception as exc:
    raise SystemExit(
        "Ultralytics is required. Install with: pip install ultralytics"
    ) from exc


def parse_args():
    parser = argparse.ArgumentParser(
        description="Download a YOLOv8 .pt via Ultralytics and export to TFLite."
    )
    parser.add_argument(
        "--model",
        default="yolov8n.pt",
        help="Ultralytics model name or path to a .pt file",
    )
    parser.add_argument("--imgsz", type=int, default=640, help="Input image size")
    parser.add_argument("--half", action="store_true", help="Enable FP16 quantization")
    parser.add_argument("--int8", action="store_true", help="Enable INT8 quantization")
    parser.add_argument("--nms", action="store_true", help="Enable NMS in export")
    parser.add_argument("--data", default=None, help="Dataset yaml (required for int8)")
    parser.add_argument("--fraction", type=float, default=None, help="Dataset fraction for int8")
    parser.add_argument("--device", default=None, help="Export device (e.g. cpu, mps)")
    parser.add_argument(
        "--out-dir",
        default=os.path.join("assets", "models"),
        help="Output directory for yolov8.tflite and labels",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.int8 and not args.data:
        raise SystemExit("--data is required when using --int8")

    cwd = os.getcwd()
    with tempfile.TemporaryDirectory(prefix="repath-yolo-") as tmpdir:
        os.chdir(tmpdir)
        try:
            model = YOLO(args.model)

            export_kwargs = {
                "format": "tflite",
                "imgsz": args.imgsz,
                "half": bool(args.half),
                "int8": bool(args.int8),
                "nms": bool(args.nms),
            }
            if args.data:
                export_kwargs["data"] = args.data
            if args.fraction is not None:
                export_kwargs["fraction"] = args.fraction
            if args.device:
                export_kwargs["device"] = args.device

            exported = model.export(**export_kwargs)

            if isinstance(exported, (list, tuple)):
                export_path = exported[0]
            else:
                export_path = exported

            if not export_path or not os.path.exists(export_path):
                raise SystemExit("Export failed or output not found.")

            os.makedirs(args.out_dir, exist_ok=True)
            tflite_out = os.path.join(args.out_dir, "yolov8.tflite")
            shutil.copy2(export_path, tflite_out)

            labels = model.names if hasattr(model, "names") else {}
            if isinstance(labels, dict):
                label_list = [labels[i] for i in sorted(labels.keys())]
            else:
                label_list = list(labels)

            labels_out = os.path.join(args.out_dir, "yolov8.labels.json")
            with open(labels_out, "w", encoding="utf-8") as handle:
                json.dump(label_list, handle, indent=2)
                handle.write("\n")

            print("Exported:", tflite_out)
            print("Labels:", labels_out)
        finally:
            os.chdir(cwd)


if __name__ == "__main__":
    main()
