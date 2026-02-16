#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/training/expand-retraining-positives-from-kaggle.js [--input test/benchmarks/benchmark-labeled.csv] [--priority-csv test/benchmarks/latest-results.candidate.priority.csv] [--kaggle-dir /path/to/kaggle/images/images] [--cache-dir test/benchmarks/images/retraining-positives] [--per-label 2] [--top-labels 6] [--labels \"Tin Can,Cardboard\"] [--holdout-manifest test/benchmarks/benchmark-manifest.supported-holdout.json] [--out test/benchmarks/benchmark-labeled.csv] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    priorityCsv: path.join("test", "benchmarks", "latest-results.candidate.priority.csv"),
    kaggleDir: process.env.KAGGLE_WASTE_DIR || "",
    cacheDir: path.join("test", "benchmarks", "images", "retraining-positives"),
    perLabel: 2,
    topLabels: 6,
    labels: [],
    holdoutManifest: path.join("test", "benchmarks", "benchmark-manifest.supported-holdout.json"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--priority-csv") {
      args.priorityCsv = argv[++i];
    } else if (arg === "--kaggle-dir") {
      args.kaggleDir = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
    } else if (arg === "--per-label") {
      args.perLabel = Number(argv[++i]);
    } else if (arg === "--top-labels") {
      args.topLabels = Number(argv[++i]);
    } else if (arg === "--labels") {
      args.labels = String(argv[++i] || "")
        .split(",")
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    } else if (arg === "--holdout-manifest") {
      args.holdoutManifest = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.perLabel) || args.perLabel < 1) {
    args.perLabel = 2;
  }
  if (!Number.isFinite(args.topLabels) || args.topLabels < 1) {
    args.topLabels = 6;
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

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  const header = ["name", "url", "item_id", "canonical_label", "source", "notes"];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        quoteCsv(row.name),
        quoteCsv(row.url),
        quoteCsv(row.item_id),
        quoteCsv(row.canonical_label),
        quoteCsv(row.source),
        quoteCsv(row.notes),
      ].join(",")
    );
  });
  return `${lines.join("\n")}\n`;
}

function readCsvRows(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    rows.push({
      name: String(cols[0] || "").trim(),
      url: String(cols[1] || "").trim(),
      item_id: String(cols[2] || "").trim(),
      canonical_label: String(cols[3] || "").trim(),
      source: String(cols[4] || "").trim(),
      notes: String(cols[5] || "").trim(),
    });
  }
  return rows;
}

function readPriorityLabels(priorityPath, topLabels) {
  if (!fs.existsSync(priorityPath)) return [];
  const lines = fs.readFileSync(priorityPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = {};
  header.forEach((key, i) => {
    idx[key] = i;
  });

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const label = String(cols[idx.label] || "").trim();
    if (!label) continue;
    rows.push({
      rank: Number(cols[idx.rank] || 0),
      label,
      priorityScore: Number(cols[idx.priority_score] || 0),
      missCount: Number(cols[idx.miss_count] || 0),
      recommendedAction: String(cols[idx.recommended_action] || "").trim(),
    });
  }

  return rows
    .filter((row) => row.recommendedAction === "collect_more_positives" && row.missCount > 0)
    .sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      return b.priorityScore - a.priorityScore;
    })
    .slice(0, topLabels)
    .map((row) => row.label);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getKaggleFolderMapping() {
  return {
    "Aluminum Can": ["aluminum_soda_cans", "aluminum_food_cans"],
    "Tin Can": ["steel_food_cans", "aluminum_food_cans"],
    Cardboard: ["cardboard_boxes", "cardboard_packaging"],
    Paperboard: ["cardboard_packaging", "cardboard_boxes"],
    "Vitamin or Prescription Bottle": [
      "plastic_water_bottles",
      "plastic_soda_bottles",
      "plastic_detergent_bottles",
    ],
    "Aluminum Foil": ["aluminum_foil"],
    "Paper Egg Carton": ["egg_cartons"],
    "Pizza Box": ["pizza_boxes"],
  };
}

function resolveKaggleDir(inputValue) {
  if (inputValue) {
    return path.resolve(inputValue);
  }
  const candidates = [
    path.join("ml", "artifacts", "datasets", "kaggle-household-waste", "images", "images"),
    path.join("..", "Kaggle Household Waste Images", "images", "images"),
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = path.resolve(candidates[i]);
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function listImages(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];

  function walk(current) {
    const entries = fs.readdirSync(current);
    entries.forEach((name) => {
      const full = path.join(current, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (_error) {
        return;
      }
      if (stat.isDirectory()) {
        walk(full);
        return;
      }
      if (/\.(jpg|jpeg|png|webp)$/i.test(name)) {
        out.push(full);
      }
    });
  }

  walk(rootDir);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function readUsedSourceKeys(rows) {
  const keys = new Set();
  rows.forEach((row) => {
    const source = String(row.source || "").trim();
    if (source !== "kaggle_household_waste_images") return;
    const notes = String(row.notes || "");
    const folderMatch = notes.match(/(?:^|;\s*)folder=([^;]+)/i);
    const imageMatch = notes.match(/(?:^|;\s*)source_image=([^;]+)/i);
    if (!folderMatch || !imageMatch) return;
    const folder = String(folderMatch[1] || "").trim();
    const image = String(imageMatch[1] || "").trim();
    if (!folder || !image) return;
    keys.add(`${folder}/${image}`);
  });
  return keys;
}

function readHoldoutKeys(manifestPath) {
  const keys = new Set();
  if (!manifestPath || !fs.existsSync(manifestPath)) return keys;
  const payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const images = Array.isArray(payload && payload.images) ? payload.images : [];
  images.forEach((row) => {
    const notes = String((row && row.notes) || "");
    const folderMatch = notes.match(/(?:^|;\s*)folder=([^;]+)/i);
    const imageMatch = notes.match(/(?:^|;\s*)source_image=([^;]+)/i);
    if (!folderMatch || !imageMatch) return;
    const folder = String(folderMatch[1] || "").trim();
    const image = String(imageMatch[1] || "").trim();
    if (!folder || !image) return;
    keys.add(`${folder}/${image}`);
  });
  return keys;
}

function toRepoRelative(targetPath) {
  return path.relative(process.cwd(), targetPath).split(path.sep).join("/");
}

function extractMaxVariant(rows, slug) {
  const pattern = new RegExp(`^retrain_positive_${slug}_v(\\d+)$`);
  let max = 0;
  rows.forEach((row) => {
    const match = String(row.name || "").match(pattern);
    if (!match) return;
    const value = Number(match[1] || 0);
    if (Number.isFinite(value) && value > max) max = value;
  });
  return max;
}

function extnameFor(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return ext || ".jpg";
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const priorityPath = path.resolve(args.priorityCsv);
  const kaggleDir = resolveKaggleDir(args.kaggleDir);
  const cacheDir = path.resolve(args.cacheDir);
  const holdoutPath = path.resolve(args.holdoutManifest);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${inputPath}`);
  }
  if (!kaggleDir || !fs.existsSync(kaggleDir)) {
    throw new Error(
      "Kaggle image dir not found. Set KAGGLE_WASTE_DIR or pass --kaggle-dir."
    );
  }

  const rows = readCsvRows(inputPath);
  const mapping = getKaggleFolderMapping();
  const holdoutKeys = readHoldoutKeys(holdoutPath);
  const usedSourceKeys = readUsedSourceKeys(rows);
  const labels = args.labels.length
    ? args.labels
    : readPriorityLabels(priorityPath, args.topLabels);

  const addedRows = [];
  const labelSummary = [];
  const skippedLabels = [];

  labels.forEach((label) => {
    const folders = Array.isArray(mapping[label]) ? mapping[label] : [];
    if (!folders.length) {
      skippedLabels.push({ label, reason: "no_kaggle_mapping" });
      return;
    }

    const slug = slugify(label);
    if (!slug) {
      skippedLabels.push({ label, reason: "invalid_slug" });
      return;
    }

    const candidates = [];
    folders.forEach((folder) => {
      const folderPath = path.join(kaggleDir, folder);
      listImages(folderPath).forEach((imagePath) => {
        const imageName = path.basename(imagePath);
        const key = `${folder}/${imageName}`;
        candidates.push({
          folder,
          imageName,
          imagePath,
          key,
        });
      });
    });

    let nextVariant = extractMaxVariant(rows, slug) + 1;
    let added = 0;

    for (let i = 0; i < candidates.length && added < args.perLabel; i += 1) {
      const candidate = candidates[i];
      if (usedSourceKeys.has(candidate.key)) continue;
      if (holdoutKeys.has(candidate.key)) continue;

      const name = `retrain_positive_${slug}_v${nextVariant}`;
      const ext = extnameFor(candidate.imagePath);
      const targetPath = path.join(cacheDir, `${name}${ext}`);
      const url = toRepoRelative(targetPath);
      if (!args.dryRun) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(candidate.imagePath, targetPath);
      }

      const row = {
        name,
        url,
        item_id: `retrain-${slug}-v${nextVariant}`,
        canonical_label: label,
        source: "kaggle_household_waste_images",
        notes: `folder=${candidate.folder}; source_image=${candidate.imageName}; selected_from=retraining_priority`,
      };

      rows.push(row);
      addedRows.push(row);
      usedSourceKeys.add(candidate.key);
      added += 1;
      nextVariant += 1;
    }

    labelSummary.push({
      label,
      requested: args.perLabel,
      added,
      available_candidates: candidates.length,
    });
  });

  rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, toCsv(rows), "utf8");
  }

  console.log("Retraining positive expansion summary");
  console.log(
    JSON.stringify(
      {
        input: path.relative(process.cwd(), inputPath),
        priority_csv: path.relative(process.cwd(), priorityPath),
        kaggle_dir: path.relative(process.cwd(), kaggleDir),
        holdout_manifest_exists: fs.existsSync(holdoutPath),
        labels_selected: labels,
        per_label_requested: args.perLabel,
        rows_added: addedRows.length,
        label_summary: labelSummary,
        skipped_labels: skippedLabels,
        output: path.relative(process.cwd(), outPath),
        dry_run: args.dryRun,
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
