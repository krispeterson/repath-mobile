#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { fileURLToPath } = require("url");

function usage() {
  console.log(
    "Usage: node ml/training/build-annotation-bundle.js [--manifest ml/artifacts/retraining/retraining-manifest.json] [--out-dir ml/artifacts/retraining/annotation-bundle] [--run-id <id>] [--refresh] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("ml", "artifacts", "retraining", "retraining-manifest.json"),
    outDir: path.join("ml", "artifacts", "retraining", "annotation-bundle"),
    runId: "",
    refresh: false,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--out-dir") {
      args.outDir = argv[++i];
    } else if (arg === "--run-id") {
      args.runId = argv[++i];
    } else if (arg === "--refresh") {
      args.refresh = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function sanitize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function extensionFromSource(source) {
  const text = String(source || "");
  const match = text.match(/\.([a-zA-Z0-9]{2,6})(?:$|[?#])/);
  if (!match) return ".jpg";
  return `.${match[1].toLowerCase()}`;
}

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function resolveLocalPath(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^file:\/\//i.test(value)) {
    try {
      return fileURLToPath(value);
    } catch (_error) {
      return null;
    }
  }
  if (/^https?:\/\//i.test(value)) return null;
  return path.resolve(value);
}

function isHttpUrl(raw) {
  return /^https?:\/\//i.test(String(raw || ""));
}

function downloadTo(source, outFile) {
  execFileSync(
    "curl",
    ["-L", "--retry", "3", "--retry-all-errors", "--connect-timeout", "20", "--max-time", "90", "--fail", source, "-o", outFile, "-sS"],
    { stdio: "pipe" }
  );
}

function copyOrDownload(source, outFile) {
  const localPath = resolveLocalPath(source);
  ensureDir(path.dirname(outFile));
  if (localPath && fs.existsSync(localPath)) {
    fs.copyFileSync(localPath, outFile);
    return "copied_local";
  }
  if (isHttpUrl(source)) {
    downloadTo(source, outFile);
    return "downloaded";
  }
  throw new Error(`Unsupported source image path: ${source}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildDatasetYaml(bundleRoot, classes) {
  const normalizedPath = path.resolve(bundleRoot).split(path.sep).join("/");
  const lines = [
    `path: ${normalizedPath}`,
    "train: images",
    "val: images",
    "test: images",
    "",
    `nc: ${classes.length}`,
    `names: [${classes.map((name) => JSON.stringify(name)).join(", ")}]`,
    ""
  ];
  return lines.join("\n");
}

function buildInstructions() {
  return [
    "# Annotation Instructions",
    "",
    "This bundle is generated from `retrain_*` samples in `benchmark-labeled.csv`.",
    "",
    "## Goal",
    "- Draw YOLO bounding boxes for **positive** images.",
    "- Keep **negative** images with empty label files.",
    "",
    "## Label Format",
    "- Each row in `labels/<image>.txt` uses: `class_id x_center y_center width height`.",
    "- Coordinates are normalized to `[0, 1]`.",
    "",
    "## Files",
    "- `annotations-template.csv`: assignment sheet with class IDs and hints.",
    "- `classes.json`: class list and numeric IDs.",
    "- `dataset.yaml`: YOLO dataset config.",
    "- `images/`: local annotation images.",
    "- `labels/`: YOLO label files (empty placeholders generated).",
    "",
    "## Completion Criteria",
    "- All non-negative rows in `annotations-template.csv` have at least one box in corresponding label files.",
    "- Negative rows remain empty.",
    "- Run `npm run validate:annotation:bundle -- --bundle-dir <bundle-dir>` to verify before training.",
    ""
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const rootOutDir = path.resolve(args.outDir);
  const runId = args.runId || new Date().toISOString().replace(/[:.]/g, "-");
  const bundleDir = path.join(rootOutDir, runId);
  const imagesDir = path.join(bundleDir, "images");
  const labelsDir = path.join(bundleDir, "labels");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Retraining manifest not found: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const samples = Array.isArray(manifest.samples) ? manifest.samples : [];
  if (!samples.length) {
    throw new Error("No samples found in retraining manifest.");
  }

  const positives = samples.filter((sample) => !sample.is_negative && sample.label);
  const classes = Array.from(
    new Set(
      positives.map((sample) => String(sample.label || "").trim()).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const classToId = new Map(classes.map((label, idx) => [label, idx]));

  let copiedLocal = 0;
  let downloaded = 0;
  let skippedExisting = 0;
  const tasks = [];

  if (!args.dryRun) {
    if (args.refresh && fs.existsSync(bundleDir)) {
      fs.rmSync(bundleDir, { recursive: true, force: true });
    }
    ensureDir(imagesDir);
    ensureDir(labelsDir);
  }

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const id = sanitize(sample.id || `sample-${i + 1}`);
    const sourceImage = String(sample.image || "").trim();
    if (!sourceImage) continue;

    const ext = extensionFromSource(sourceImage);
    const imageFile = `${id}${ext}`;
    const imageOutPath = path.join(imagesDir, imageFile);
    const labelOutPath = path.join(labelsDir, `${id}.txt`);
    const isNegative = Boolean(sample.is_negative || !sample.label);
    const classLabel = isNegative ? "" : String(sample.label || "").trim();
    const classId = classLabel && classToId.has(classLabel) ? classToId.get(classLabel) : "";

    if (!args.dryRun) {
      if (fs.existsSync(imageOutPath) && !args.refresh) {
        skippedExisting += 1;
      } else {
        const mode = copyOrDownload(sourceImage, imageOutPath);
        if (mode === "copied_local") copiedLocal += 1;
        if (mode === "downloaded") downloaded += 1;
      }
      if (!fs.existsSync(labelOutPath)) {
        fs.writeFileSync(labelOutPath, "", "utf8");
      }
    }

    tasks.push({
      id,
      image_file: path.join("images", imageFile).split(path.sep).join("/"),
      label_file: path.join("labels", `${id}.txt`).split(path.sep).join("/"),
      is_negative: isNegative,
      class_label: classLabel,
      class_id: classId,
      source: sample.source || "",
      notes: sample.notes || ""
    });
  }

  if (!args.dryRun) {
    const templateHeader = [
      "id",
      "image_file",
      "label_file",
      "is_negative",
      "class_label",
      "class_id",
      "status",
      "annotator",
      "notes"
    ];
    const templateLines = [templateHeader.join(",")];
    tasks.forEach((row) => {
      templateLines.push(
        [
          quoteCsv(row.id),
          quoteCsv(row.image_file),
          quoteCsv(row.label_file),
          quoteCsv(row.is_negative ? "true" : "false"),
          quoteCsv(row.class_label),
          quoteCsv(row.class_id),
          quoteCsv("todo"),
          quoteCsv(""),
          quoteCsv(row.notes)
        ].join(",")
      );
    });

    writeJson(path.join(bundleDir, "classes.json"), {
      generated_at: new Date().toISOString(),
      classes: classes.map((label) => ({ id: classToId.get(label), label }))
    });
    fs.writeFileSync(path.join(bundleDir, "dataset.yaml"), buildDatasetYaml(bundleDir, classes), "utf8");
    fs.writeFileSync(path.join(bundleDir, "annotations-template.csv"), `${templateLines.join("\n")}\n`, "utf8");
    fs.writeFileSync(path.join(bundleDir, "INSTRUCTIONS.md"), buildInstructions(), "utf8");
    writeJson(path.join(bundleDir, "bundle-metadata.json"), {
      generated_at: new Date().toISOString(),
      source_manifest: path.relative(process.cwd(), manifestPath),
      classes: classes.length,
      total_samples: tasks.length,
      positives: tasks.filter((row) => !row.is_negative).length,
      negatives: tasks.filter((row) => row.is_negative).length,
      refresh: args.refresh
    });
  }

  console.log("Annotation bundle prepared");
  console.log(
    JSON.stringify(
      {
        manifest: path.relative(process.cwd(), manifestPath),
        bundle_dir: path.relative(process.cwd(), bundleDir),
        samples: tasks.length,
        classes: classes.length,
        positives: tasks.filter((row) => !row.is_negative).length,
        negatives: tasks.filter((row) => row.is_negative).length,
        copied_local: copiedLocal,
        downloaded,
        skipped_existing: skippedExisting,
        dry_run: args.dryRun
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
