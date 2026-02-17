#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/eval/build-supported-holdout-manifest.js [--labels ml/artifacts/models/candidates/<run-id>/yolo-repath.labels.json] [--candidates-root ml/artifacts/models/candidates] [--kaggle-dir /path/to/kaggle/images/images] [--input-csv test/benchmarks/benchmark-labeled.csv] [--manual-seed test/benchmarks/benchmark-supported-holdout-overrides.seed.json] [--retraining-manifest ml/artifacts/retraining/retraining-manifest.json] [--cache-dir test/benchmarks/images/supported-holdout] [--per-label 3] [--no-download] [--out test/benchmarks/benchmark-manifest.supported-holdout.json]"
  );
}

function parseArgs(argv) {
  const args = {
    labels: "",
    candidatesRoot: path.join("ml", "artifacts", "models", "candidates"),
    kaggleDir: process.env.KAGGLE_WASTE_DIR || "",
    inputCsv: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    manualSeed: path.join("test", "benchmarks", "benchmark-supported-holdout-overrides.seed.json"),
    retrainingManifest: path.join("ml", "artifacts", "retraining", "retraining-manifest.json"),
    cacheDir: path.join("test", "benchmarks", "images", "supported-holdout"),
    perLabel: 3,
    download: true,
    out: path.join("test", "benchmarks", "benchmark-manifest.supported-holdout.json"),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--labels") {
      args.labels = argv[++i];
    } else if (arg === "--candidates-root") {
      args.candidatesRoot = argv[++i];
    } else if (arg === "--kaggle-dir") {
      args.kaggleDir = argv[++i];
    } else if (arg === "--input-csv") {
      args.inputCsv = argv[++i];
    } else if (arg === "--manual-seed") {
      args.manualSeed = argv[++i];
    } else if (arg === "--retraining-manifest") {
      args.retrainingManifest = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
    } else if (arg === "--per-label") {
      args.perLabel = Number(argv[++i]);
    } else if (arg === "--no-download") {
      args.download = false;
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.perLabel) || args.perLabel < 1) {
    args.perLabel = 3;
  }

  return args;
}

function resolveKaggleDir(inputValue) {
  if (inputValue) return path.resolve(inputValue);
  const candidates = [
    path.join("ml", "artifacts", "datasets", "kaggle-household-waste", "images", "images"),
    path.join("..", "Kaggle Household Waste Images", "images", "images"),
  ];
  for (const candidate of candidates) {
    const full = path.resolve(candidate);
    if (fs.existsSync(full)) return full;
  }
  return "";
}

function resolveLatestCandidateLabels(candidatesRoot) {
  const root = path.resolve(candidatesRoot);
  if (!fs.existsSync(root)) return "";
  const dirs = fs
    .readdirSync(root)
    .map((name) => path.join(root, name))
    .filter((fullPath) => {
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch (_error) {
        return false;
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  for (const dir of dirs) {
    const preferred = path.join(dir, "yolo-repath.labels.json");
    const legacy = path.join(dir, "yolov8.labels.json");
    if (fs.existsSync(preferred)) return preferred;
    if (fs.existsSync(legacy)) return legacy;
  }
  return "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionForFile(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return ext || ".jpg";
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

function readExcludedKaggleKeys(csvPath) {
  const keys = new Set();
  if (!csvPath || !fs.existsSync(csvPath)) return keys;
  const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return keys;
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const source = String(cols[4] || "").trim();
    const notes = String(cols[5] || "").trim();
    if (source !== "kaggle_household_waste_images") continue;
    const folderMatch = notes.match(/(?:^|;\s*)folder=([^;]+)/i);
    const imageMatch = notes.match(/(?:^|;\s*)source_image=([^;]+)/i);
    if (!folderMatch || !imageMatch) continue;
    const folder = String(folderMatch[1] || "").trim();
    const image = String(imageMatch[1] || "").trim();
    if (!folder || !image) continue;
    keys.add(`${folder}/${image}`);
  }
  return keys;
}

function loadManualSeed(seedPath) {
  const fullPath = path.resolve(seedPath);
  if (!fs.existsSync(fullPath)) {
    return { seedPath: fullPath, labels: {} };
  }
  const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const labels = payload && typeof payload === "object" && payload.labels && typeof payload.labels === "object"
    ? payload.labels
    : {};
  return { seedPath: fullPath, labels };
}

function normalizeUrlForCompare(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function loadExcludedTrainingUrls(manifestPath) {
  const fullPath = path.resolve(manifestPath);
  const urls = new Set();
  if (!fs.existsSync(fullPath)) return { manifestPath: fullPath, urls };
  const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const samples = Array.isArray(payload && payload.samples) ? payload.samples : [];
  samples.forEach((sample) => {
    const image = normalizeUrlForCompare(sample && sample.image);
    if (image) urls.add(image);
    const notes = String(sample && sample.notes ? sample.notes : "");
    const sourceUrlMatch = notes.match(/(?:^|;\s*)source_url=([^;]+)/i);
    if (sourceUrlMatch && sourceUrlMatch[1]) {
      const sourceUrl = normalizeUrlForCompare(sourceUrlMatch[1]);
      if (sourceUrl) urls.add(sourceUrl);
    }
  });
  return { manifestPath: fullPath, urls };
}

function listImages(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const walk = (current) => {
    const entries = fs.readdirSync(current);
    for (const name of entries) {
      const full = path.join(current, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (_error) {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
      out.push(full);
    }
  };
  walk(rootDir);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function toRepoRelative(targetPath) {
  return path.relative(process.cwd(), targetPath).split(path.sep).join("/");
}

function getKaggleFolderMapping() {
  return {
    "Aluminum Can": ["aluminum_soda_cans", "aluminum_food_cans"],
    "Tin Can": ["steel_food_cans", "aluminum_food_cans"],
    Cardboard: ["cardboard_boxes", "cardboard_packaging"],
    Paperboard: ["cardboard_packaging", "cardboard_boxes"],
    "Vitamin or Prescription Bottle": ["plastic_water_bottles", "plastic_soda_bottles", "plastic_detergent_bottles"],
    "Aluminum Foil": [],
    "Paper Egg Carton": [],
    "Pizza Box": [],
  };
}

function buildImagePool(kaggleDir, labels, mapping) {
  const pool = new Map();
  for (const label of labels) {
    const folders = Array.isArray(mapping[label]) ? mapping[label] : [];
    const images = [];
    for (const folder of folders) {
      const folderPath = path.join(kaggleDir, folder);
      for (const fullPath of listImages(folderPath)) {
        const rel = path.relative(kaggleDir, fullPath).split(path.sep).join("/");
        const parts = rel.split("/");
        const folderKey = parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts[0];
        const sourceImage = parts[parts.length - 1];
        images.push({
          fullPath,
          folder: folderKey,
          sourceImage,
          key: `${folderKey}/${sourceImage}`,
        });
      }
    }
    pool.set(label, images);
  }
  return pool;
}

function extensionFromUrl(value) {
  const match = String(value || "").match(/\.([a-zA-Z0-9]{2,6})(?:[?#].*)?$/);
  if (!match) return ".jpg";
  return `.${match[1].toLowerCase()}`;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function downloadUrl(url, outFile) {
  const { execFileSync } = require("child_process");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  execFileSync(
    "curl",
    [
      "-L",
      "--retry",
      "3",
      "--retry-all-errors",
      "--connect-timeout",
      "20",
      "--max-time",
      "90",
      "--fail",
      url,
      "-o",
      outFile,
      "-sS",
    ],
    { stdio: "pipe" }
  );
}

function copyLocal(localPath, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.copyFileSync(localPath, outFile);
}

function main() {
  const args = parseArgs(process.argv);
  const labelsPath = args.labels
    ? path.resolve(args.labels)
    : resolveLatestCandidateLabels(args.candidatesRoot);
  const kaggleDir = resolveKaggleDir(args.kaggleDir);
  const csvPath = path.resolve(args.inputCsv);
  const manualSeed = loadManualSeed(args.manualSeed);
  const trainingExclusions = loadExcludedTrainingUrls(args.retrainingManifest);
  const cacheDir = path.resolve(args.cacheDir);
  const outPath = path.resolve(args.out);

  if (!labelsPath || !fs.existsSync(labelsPath)) {
    throw new Error("Labels file not found. Pass --labels or create candidate labels first.");
  }

  const labels = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
  if (!Array.isArray(labels)) {
    throw new Error("Labels file must be a JSON array.");
  }

  const mapping = getKaggleFolderMapping();
  const excluded = readExcludedKaggleKeys(csvPath);
  const excludedTrainingUrls = trainingExclusions.urls;
  const selectedKeys = new Set();
  const selectedManualUrls = new Set();
  const unsupported = [];
  const rows = [];

  if (!kaggleDir || !fs.existsSync(kaggleDir)) {
    unsupported.push({
      reason: "kaggle_dir_not_found",
      detail: "Set KAGGLE_WASTE_DIR or pass --kaggle-dir to build supported holdout entries.",
    });
  }

  const pool = kaggleDir && fs.existsSync(kaggleDir)
    ? buildImagePool(kaggleDir, labels, mapping)
    : new Map();

  fs.mkdirSync(cacheDir, { recursive: true });

  for (const rawLabel of labels) {
    const label = String(rawLabel || "").trim();
    if (!label) continue;

    const candidates = pool.get(label) || [];
    const manualUrls = Array.isArray(manualSeed.labels[label]) ? manualSeed.labels[label] : [];
    let selectedCount = 0;
    for (const candidate of candidates) {
      if (selectedCount >= args.perLabel) break;
      if (excluded.has(candidate.key)) continue;
      if (selectedKeys.has(candidate.key)) continue;

      const idx = selectedCount + 1;
      const slug = slugify(label);
      const entryName = `holdout_${slug}_kaggle_v${idx}`;
      const outFile = path.join(cacheDir, `${entryName}${extensionForFile(candidate.fullPath)}`);
      if (!fs.existsSync(outFile)) {
        fs.copyFileSync(candidate.fullPath, outFile);
      }

      rows.push({
        name: entryName,
        url: toRepoRelative(outFile),
        expected_any: [label],
        expected_all: [],
        item_id: `holdout-${slug}-v${idx}`,
        required: false,
        status: "ready",
        notes: `supported-holdout; source=kaggle_household_waste_images; folder=${candidate.folder}; source_image=${candidate.sourceImage}`,
      });

      selectedKeys.add(candidate.key);
      selectedCount += 1;
    }

    if (selectedCount < args.perLabel && manualUrls.length) {
      let manualIndex = 1;
      for (const rawUrl of manualUrls) {
        if (selectedCount >= args.perLabel) break;
        const url = String(rawUrl || "").trim();
        if (!url) continue;
        if (selectedManualUrls.has(url)) continue;
        if (excludedTrainingUrls.has(normalizeUrlForCompare(url))) continue;

        const slug = slugify(label);
        const entryName = `holdout_${slug}_manual_v${manualIndex}`;
        const ext = isHttpUrl(url) ? extensionFromUrl(url) : extensionForFile(url);
        const outFile = path.join(cacheDir, `${entryName}${ext}`);

        try {
          if (!fs.existsSync(outFile)) {
            if (isHttpUrl(url)) {
              if (!args.download) continue;
              downloadUrl(url, outFile);
            } else {
              const localPath = path.resolve(url);
              if (!fs.existsSync(localPath)) continue;
              copyLocal(localPath, outFile);
            }
          }

          rows.push({
            name: entryName,
            url: toRepoRelative(outFile),
            expected_any: [label],
            expected_all: [],
            item_id: `holdout-${slug}-manual-v${manualIndex}`,
            required: false,
            status: "ready",
            notes: `supported-holdout; source=manual_seed; source_url=${url}`,
          });

          selectedManualUrls.add(url);
          selectedCount += 1;
          manualIndex += 1;
        } catch (_error) {
          continue;
        }
      }
    }

    if (selectedCount < args.perLabel) {
      unsupported.push({
        label,
        reason: "insufficient_unique_images",
        selected: selectedCount,
        requested: args.perLabel,
      });
    }
  }

  rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const out = {
    name: "municipal-supported-holdout-v1",
    generated_at: new Date().toISOString(),
    source: {
      labels: toRepoRelative(labelsPath),
      kaggle_dir: kaggleDir ? toRepoRelative(kaggleDir) : null,
      excluded_csv: fs.existsSync(csvPath) ? toRepoRelative(csvPath) : null,
      manual_seed: fs.existsSync(manualSeed.seedPath) ? toRepoRelative(manualSeed.seedPath) : null,
      retraining_manifest: fs.existsSync(trainingExclusions.manifestPath)
        ? toRepoRelative(trainingExclusions.manifestPath)
        : null,
      download_enabled: args.download,
      per_label: args.perLabel,
    },
    summary: {
      rows: rows.length,
      labels_requested: labels.length,
      labels_with_rows: new Set(rows.map((row) => row.expected_any && row.expected_any[0])).size,
      unsupported_labels: unsupported.length,
    },
    unsupported,
    images: rows,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log("Supported holdout manifest generated");
  console.log(
    JSON.stringify(
      {
        labels: toRepoRelative(labelsPath),
        kaggle_dir: kaggleDir ? toRepoRelative(kaggleDir) : null,
        output: toRepoRelative(outPath),
        rows: out.summary.rows,
        labels_with_rows: out.summary.labels_with_rows,
        unsupported_labels: out.summary.unsupported_labels,
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
