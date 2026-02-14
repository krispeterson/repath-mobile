#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/training/validate-annotation-bundle.js [--bundle-dir ml/artifacts/retraining/annotation-bundle/<run-id>] [--bundle-root ml/artifacts/retraining/annotation-bundle] [--out ml/artifacts/retraining/annotation-bundle/<run-id>/validation-report.json] [--strict]"
  );
}

function parseArgs(argv) {
  const args = {
    bundleDir: "",
    bundleRoot: path.join("ml", "artifacts", "retraining", "annotation-bundle"),
    out: "",
    strict: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--bundle-dir") {
      args.bundleDir = argv[++i];
    } else if (arg === "--bundle-root") {
      args.bundleRoot = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseYoloLine(line) {
  const parts = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) return null;
  const values = parts.map((part) => Number(part));
  if (!values.every((v) => Number.isFinite(v))) return null;
  return {
    classId: values[0],
    x: values[1],
    y: values[2],
    w: values[3],
    h: values[4]
  };
}

function readClasses(bundleDir) {
  const filePath = path.join(bundleDir, "classes.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const classes = Array.isArray(payload.classes) ? payload.classes : [];
    return classes
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b);
  } catch (_error) {
    return [];
  }
}

function resolveLatestBundle(bundleRoot) {
  if (!fs.existsSync(bundleRoot)) return null;
  const dirs = fs
    .readdirSync(bundleRoot)
    .map((name) => path.join(bundleRoot, name))
    .filter((fullPath) => {
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch (_error) {
        return false;
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] || null;
}

function readTemplateRows(bundleDir) {
  const templatePath = path.join(bundleDir, "annotations-template.csv");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`annotations-template.csv not found in bundle: ${bundleDir}`);
  }

  const lines = fs.readFileSync(templatePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      id: String(cols[idx.id] || "").trim(),
      imageFile: String(cols[idx.image_file] || "").trim(),
      labelFile: String(cols[idx.label_file] || "").trim(),
      isNegative: String(cols[idx.is_negative] || "").trim().toLowerCase() === "true",
      classId: String(cols[idx.class_id] || "").trim(),
      classLabel: String(cols[idx.class_label] || "").trim()
    };
  });
}

function main() {
  const args = parseArgs(process.argv);
  const bundleDir = args.bundleDir
    ? path.resolve(args.bundleDir)
    : resolveLatestBundle(path.resolve(args.bundleRoot));

  if (!bundleDir || !fs.existsSync(bundleDir)) {
    throw new Error("Bundle directory not found. Build an annotation bundle first.");
  }

  const rows = readTemplateRows(bundleDir);
  const validClassIds = new Set(readClasses(bundleDir));
  const maxClassId = validClassIds.size ? Math.max.apply(null, Array.from(validClassIds)) : -1;

  const issues = [];
  let positives = 0;
  let negatives = 0;
  let positivesWithBoxes = 0;
  let negativesWithBoxes = 0;
  let totalBoxes = 0;

  rows.forEach((row) => {
    const imagePath = path.join(bundleDir, row.imageFile);
    const labelPath = path.join(bundleDir, row.labelFile);

    if (!fs.existsSync(imagePath)) {
      issues.push({ id: row.id, issue: "missing_image_file", path: row.imageFile });
      return;
    }
    if (!fs.existsSync(labelPath)) {
      issues.push({ id: row.id, issue: "missing_label_file", path: row.labelFile });
      return;
    }

    const rawLines = fs
      .readFileSync(labelPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed = [];
    for (let i = 0; i < rawLines.length; i += 1) {
      const entry = parseYoloLine(rawLines[i]);
      if (!entry) {
        issues.push({ id: row.id, issue: "invalid_yolo_line", line: rawLines[i], path: row.labelFile });
        continue;
      }
      const inRange =
        entry.x >= 0 &&
        entry.x <= 1 &&
        entry.y >= 0 &&
        entry.y <= 1 &&
        entry.w > 0 &&
        entry.w <= 1 &&
        entry.h > 0 &&
        entry.h <= 1;
      if (!inRange) {
        issues.push({ id: row.id, issue: "bbox_out_of_range", line: rawLines[i], path: row.labelFile });
      }
      if (validClassIds.size && !validClassIds.has(entry.classId)) {
        issues.push({
          id: row.id,
          issue: "unknown_class_id",
          class_id: entry.classId,
          max_class_id: maxClassId,
          path: row.labelFile
        });
      }
      parsed.push(entry);
    }

    totalBoxes += parsed.length;
    if (row.isNegative) {
      negatives += 1;
      if (parsed.length > 0) {
        negativesWithBoxes += 1;
        issues.push({ id: row.id, issue: "negative_has_boxes", path: row.labelFile, boxes: parsed.length });
      }
    } else {
      positives += 1;
      if (parsed.length === 0) {
        issues.push({ id: row.id, issue: "positive_missing_boxes", path: row.labelFile });
      } else {
        positivesWithBoxes += 1;
      }
    }
  });

  const report = {
    generated_at: new Date().toISOString(),
    bundle_dir: path.relative(process.cwd(), bundleDir),
    summary: {
      rows: rows.length,
      positives,
      negatives,
      positives_with_boxes: positivesWithBoxes,
      negatives_with_boxes: negativesWithBoxes,
      total_boxes: totalBoxes,
      issue_count: issues.length
    },
    issues
  };

  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(bundleDir, "validation-report.json");
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Annotation bundle validation complete");
  console.log(
    JSON.stringify(
      {
        bundle_dir: report.bundle_dir,
        output: path.relative(process.cwd(), outPath),
        summary: report.summary
      },
      null,
      2
    )
  );

  if (args.strict && issues.length > 0) {
    process.exit(2);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
