#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
import tensorflow as tf


def parse_args():
    parser = argparse.ArgumentParser(description="Benchmark a TFLite detection model against a fixed image manifest.")
    parser.add_argument("--model", default="assets/models/yolov8.tflite", help="Path to .tflite model")
    parser.add_argument("--labels", default="assets/models/yolov8.labels.json", help="Path to label JSON array")
    parser.add_argument("--manifest", default="test/benchmarks/fc-curbside-manifest.json", help="Benchmark manifest JSON")
    parser.add_argument("--cache-dir", default="test/benchmarks/images", help="Where benchmark images are cached")
    parser.add_argument("--out", default="test/benchmarks/latest-results.json", help="Where to write benchmark results")
    parser.add_argument("--threshold", type=float, default=0.35, help="Minimum score threshold")
    parser.add_argument("--topk", type=int, default=5, help="Max labels per image")
    return parser.parse_args()


def run_curl_download(url, out_file):
    out_file.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["curl", "-L", url, "-o", str(out_file), "-sS"]
    subprocess.run(cmd, check=True)


def load_manifest(manifest_path):
    data = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("images"), list):
        raise ValueError("Manifest must be an object with an images array.")
    return data


def unique_in_order(values):
    seen = set()
    out = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def infer_labels(interpreter, input_info, output_info, labels, image_path, threshold, topk):
    image = Image.open(image_path).convert("RGB").resize((640, 640))
    arr = np.asarray(image, dtype=np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)

    interpreter.set_tensor(input_info["index"], arr)
    interpreter.invoke()
    output = interpreter.get_tensor(output_info["index"])[0]
    keep = output[output[:, 4] >= threshold]
    keep = keep[np.argsort(-keep[:, 4])]

    detections = []
    predicted_labels = []
    for row in keep:
        class_id = int(round(float(row[5])))
        if class_id < 0 or class_id >= len(labels):
            continue
        score = float(row[4])
        label = labels[class_id]
        detections.append({"label": label, "score": round(score, 4)})
        predicted_labels.append(label)

    predicted_labels = unique_in_order(predicted_labels)[:topk]
    return detections[:topk], predicted_labels


def pr_stats(predicted_labels, expected_labels):
    pred = set(predicted_labels)
    exp = set(expected_labels)
    if not pred and not exp:
        return {"tp": 0, "fp": 0, "fn": 0, "precision": 1.0, "recall": 1.0}
    tp = len(pred & exp)
    fp = len(pred - exp)
    fn = len(exp - pred)
    precision = tp / (tp + fp) if tp + fp > 0 else 0.0
    recall = tp / (tp + fn) if tp + fn > 0 else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": precision, "recall": recall}


def main():
    args = parse_args()
    labels = json.loads(Path(args.labels).read_text(encoding="utf-8"))
    if not isinstance(labels, list):
        raise ValueError("Labels file must be a JSON array.")

    manifest = load_manifest(args.manifest)
    image_entries = manifest.get("images", [])

    interpreter = tf.lite.Interpreter(model_path=args.model)
    interpreter.allocate_tensors()
    input_info = interpreter.get_input_details()[0]
    output_info = interpreter.get_output_details()[0]

    results = []
    micro_tp = micro_fp = micro_fn = 0
    any_cases = 0
    any_hits = 0
    negative_cases = 0
    negative_clean = 0

    for entry in image_entries:
        name = str(entry.get("name") or "").strip()
        url = str(entry.get("url") or "").strip()
        expected_any = [str(v).strip() for v in entry.get("expected_any", []) if str(v).strip()]
        expected_all = [str(v).strip() for v in entry.get("expected_all", []) if str(v).strip()]
        if not name or not url:
            continue

        out_file = Path(args.cache_dir) / f"{name}.jpg"
        if not out_file.exists():
            run_curl_download(url, out_file)

        detections, predicted_labels = infer_labels(
            interpreter=interpreter,
            input_info=input_info,
            output_info=output_info,
            labels=labels,
            image_path=out_file,
            threshold=args.threshold,
            topk=args.topk,
        )

        expected_set = expected_all if expected_all else expected_any
        stats = pr_stats(predicted_labels, expected_set)
        micro_tp += stats["tp"]
        micro_fp += stats["fp"]
        micro_fn += stats["fn"]

        any_hit = None
        if expected_any:
            any_cases += 1
            any_hit = bool(set(predicted_labels) & set(expected_any))
            if any_hit:
                any_hits += 1
        else:
            negative_cases += 1
            if not predicted_labels:
                negative_clean += 1

        results.append(
            {
                "name": name,
                "url": url,
                "expected_any": expected_any,
                "expected_all": expected_all,
                "predicted_labels": predicted_labels,
                "detections": detections,
                "precision": round(stats["precision"], 4),
                "recall": round(stats["recall"], 4),
                "any_hit": any_hit,
            }
        )

    micro_precision = micro_tp / (micro_tp + micro_fp) if (micro_tp + micro_fp) > 0 else 0.0
    micro_recall = micro_tp / (micro_tp + micro_fn) if (micro_tp + micro_fn) > 0 else 0.0
    any_hit_rate = any_hits / any_cases if any_cases > 0 else 0.0
    negative_clean_rate = negative_clean / negative_cases if negative_cases > 0 else 0.0

    summary = {
        "model": args.model,
        "labels": args.labels,
        "manifest": args.manifest,
        "threshold": args.threshold,
        "topk": args.topk,
        "images_evaluated": len(results),
        "micro_precision": round(micro_precision, 4),
        "micro_recall": round(micro_recall, 4),
        "any_hit_rate": round(any_hit_rate, 4),
        "negative_clean_rate": round(negative_clean_rate, 4),
        "tp": micro_tp,
        "fp": micro_fp,
        "fn": micro_fn,
    }

    payload = {"summary": summary, "results": results}
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print("Benchmark summary")
    print(json.dumps(summary, indent=2))
    print(f"Saved detailed results to {out_path}")


if __name__ == "__main__":
    main()
