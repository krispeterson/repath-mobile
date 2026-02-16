#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/training/fill-missing-positive-boxes.js [--bundle-dir ml/artifacts/retraining/annotation-bundle/<run-id>] [--bundle-root ml/artifacts/retraining/annotation-bundle] [--x-center 0.5] [--y-center 0.5] [--width 1] [--height 1] [--overwrite] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    bundleDir: "",
    bundleRoot: path.join("ml", "artifacts", "retraining", "annotation-bundle"),
    xCenter: 0.5,
    yCenter: 0.5,
    width: 1,
    height: 1,
    overwrite: false,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--bundle-dir") {
      args.bundleDir = argv[++i];
    } else if (arg === "--bundle-root") {
      args.bundleRoot = argv[++i];
    } else if (arg === "--x-center") {
      args.xCenter = Number(argv[++i]);
    } else if (arg === "--y-center") {
      args.yCenter = Number(argv[++i]);
    } else if (arg === "--width") {
      args.width = Number(argv[++i]);
    } else if (arg === "--height") {
      args.height = Number(argv[++i]);
    } else if (arg === "--overwrite") {
      args.overwrite = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${arg}`);
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
      isNegative: String(cols[idx.is_negative] || "").trim().toLowerCase() === "true",
      classId: String(cols[idx.class_id] || "").trim(),
      labelFile: String(cols[idx.label_file] || "").trim()
    };
  });
}

function validateBoxArgs(args) {
  const values = [args.xCenter, args.yCenter, args.width, args.height];
  if (!values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new Error("--x-center, --y-center, --width, and --height must all be in [0, 1].");
  }
  if (args.width <= 0 || args.height <= 0) {
    throw new Error("--width and --height must be greater than 0.");
  }
}

function main() {
  const args = parseArgs(process.argv);
  validateBoxArgs(args);

  const bundleDir = args.bundleDir
    ? path.resolve(args.bundleDir)
    : resolveLatestBundle(path.resolve(args.bundleRoot));

  if (!bundleDir || !fs.existsSync(bundleDir)) {
    throw new Error("Bundle directory not found. Build an annotation bundle first.");
  }

  const rows = readTemplateRows(bundleDir);
  const box = `${args.xCenter} ${args.yCenter} ${args.width} ${args.height}`;
  let positivesTotal = 0;
  let positivesAlreadyLabeled = 0;
  let positivesFilled = 0;
  let positivesSkippedMissingClass = 0;

  rows.forEach((row) => {
    if (row.isNegative) return;
    positivesTotal += 1;

    if (!row.classId) {
      positivesSkippedMissingClass += 1;
      return;
    }

    const labelPath = path.join(bundleDir, row.labelFile);
    const current = fs.existsSync(labelPath) ? fs.readFileSync(labelPath, "utf8").trim() : "";
    if (current && !args.overwrite) {
      positivesAlreadyLabeled += 1;
      return;
    }

    if (!args.dryRun) {
      fs.mkdirSync(path.dirname(labelPath), { recursive: true });
      fs.writeFileSync(labelPath, `${row.classId} ${box}\n`, "utf8");
    }
    positivesFilled += 1;
  });

  const summary = {
    bundle_dir: path.relative(process.cwd(), bundleDir).split(path.sep).join("/"),
    box: {
      x_center: args.xCenter,
      y_center: args.yCenter,
      width: args.width,
      height: args.height
    },
    positives_total: positivesTotal,
    positives_already_labeled: positivesAlreadyLabeled,
    positives_filled: positivesFilled,
    positives_skipped_missing_class: positivesSkippedMissingClass,
    overwrite: args.overwrite,
    dry_run: args.dryRun
  };

  console.log("Fallback fill complete");
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
