#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/data/suggest-benchmark-from-kaggle.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--kaggle-dir /path/to/kaggle/images/images] [--cache-dir test/benchmarks/images] [--out test/benchmarks/benchmark-labeled.kaggle.csv] [--merge-into test/benchmarks/benchmark-labeled.csv]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    kaggleDir: process.env.KAGGLE_WASTE_DIR || "",
    cacheDir: path.join("test", "benchmarks", "images"),
    out: path.join("test", "benchmarks", "benchmark-labeled.kaggle.csv"),
    mergeInto: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--kaggle-dir") {
      args.kaggleDir = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--merge-into") {
      args.mergeInto = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function resolveKaggleDir(inputValue) {
  if (inputValue) {
    return path.resolve(inputValue);
  }

  const candidates = [
    path.join("ml", "artifacts", "datasets", "kaggle-household-waste", "images", "images"),
    path.join("..", "Kaggle Household Waste Images", "images", "images")
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = path.resolve(candidates[i]);
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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
    } else if (ch === ',') {
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

function labelForEntry(entry) {
  const expectedAny = Array.isArray(entry && entry.expected_any) ? entry.expected_any : [];
  if (expectedAny.length) return String(expectedAny[0] || "").trim();
  const expectedAll = Array.isArray(entry && entry.expected_all) ? entry.expected_all : [];
  if (expectedAll.length) return String(expectedAll[0] || "").trim();
  return "";
}

function listImages(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  const out = [];

  function walk(current) {
    const entries = fs.readdirSync(current);
    entries.forEach((name) => {
      const full = path.join(current, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (error) {
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

  walk(folderPath);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function buildImagePool(kaggleDir) {
  const folders = fs.existsSync(kaggleDir)
    ? fs.readdirSync(kaggleDir).filter((name) => fs.statSync(path.join(kaggleDir, name)).isDirectory())
    : [];
  const pool = {};
  folders.forEach((folder) => {
    pool[folder] = listImages(path.join(kaggleDir, folder));
  });
  return pool;
}

function getMapping() {
  return {
    "Aluminum Can": ["aluminum_soda_cans", "aluminum_food_cans"],
    "Tin Can": ["steel_food_cans", "aluminum_food_cans"],
    "Empty Aerosol Can": ["aerosol_cans"],
    "Cardboard": ["cardboard_boxes", "cardboard_packaging"],
    "Waxed Cardboard": ["cardboard_packaging", "cardboard_boxes"],
    "Glass Bottle or Jar": ["glass_food_jars", "glass_beverage_bottles"],
    "Plastic Jug": ["plastic_detergent_bottles", "plastic_soda_bottles"],
    "Plastic Container": ["plastic_food_containers"],
    "Plastic Caps & Lids": ["plastic_cup_lids"],
    "Take Out Food Container": ["styrofoam_food_containers", "plastic_food_containers"],
    "Food Grade Styrofoam": ["styrofoam_food_containers", "styrofoam_cups"],
    "Packaging Styrofoam or Polystyrene Foam": ["styrofoam_food_containers", "styrofoam_cups"],
    "Coffee Grounds": ["coffee_grounds"],
    "Clothing and Fabric": ["clothing"],
    "Magazine": ["magazines"],
    "White Office Paper": ["office_paper"],
    "Paper Cup": ["paper_cups"],
    "Newspaper": ["newspaper"],
    "Plastic Shopping Bags": ["plastic_shopping_bags"],
    "Plastic Wrap": ["plastic_trash_bags"],
    "Tea Bags": ["tea_bags"]
  };
}

function sanitizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function extensionFromPath(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return ext || ".jpg";
}

function toRepoRelative(targetPath, repoRoot) {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function pickNextImage(folders, pool, used) {
  for (let i = 0; i < folders.length; i += 1) {
    const folder = folders[i];
    const images = pool[folder] || [];
    for (let j = 0; j < images.length; j += 1) {
      const candidate = images[j];
      if (!used.has(candidate)) {
        used.add(candidate);
        return { imagePath: candidate, folder };
      }
    }
  }

  for (let i = 0; i < folders.length; i += 1) {
    const folder = folders[i];
    const images = pool[folder] || [];
    if (images.length) {
      return { imagePath: images[0], folder };
    }
  }

  return null;
}

function toCsvRows(rows) {
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
        quoteCsv(row.notes)
      ].join(",")
    );
  });
  return `${lines.join("\n")}\n`;
}

function readCsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const hasHeader = lines[0].toLowerCase().includes("name") && lines[0].toLowerCase().includes("url");
  const start = hasHeader ? 1 : 0;
  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    rows.push({
      name: String(cols[0] || "").trim(),
      url: String(cols[1] || "").trim(),
      item_id: String(cols[2] || "").trim(),
      canonical_label: String(cols[3] || "").trim(),
      source: String(cols[4] || "").trim(),
      notes: String(cols[5] || "").trim()
    });
  }
  return rows;
}

function mergeRows(existingRows, newRows) {
  const byName = new Map();
  existingRows.forEach((row) => {
    const name = String(row.name || "").trim();
    if (name) byName.set(name, row);
  });
  newRows.forEach((row) => {
    const name = String(row.name || "").trim();
    if (!name) return;
    byName.set(name, row);
  });

  return Array.from(byName.values()).sort((a, b) => {
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const kaggleDir = resolveKaggleDir(args.kaggleDir);
  const cacheDir = path.resolve(args.cacheDir);
  const outPath = path.resolve(args.out);
  const repoRoot = process.cwd();

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  if (!kaggleDir || !fs.existsSync(kaggleDir)) {
    throw new Error(
      "Kaggle image dir not found. Set KAGGLE_WASTE_DIR or pass --kaggle-dir."
    );
  }

  const manifest = loadJson(manifestPath);
  const images = Array.isArray(manifest && manifest.images) ? manifest.images : [];
  const mapping = getMapping();
  const pool = buildImagePool(kaggleDir);
  const usedPaths = new Set();
  const rows = [];
  fs.mkdirSync(cacheDir, { recursive: true });

  images.forEach((entry) => {
    const status = String((entry && entry.status) || "").toLowerCase();
    if (status !== "todo") return;

    const label = labelForEntry(entry);
    const folders = mapping[label];
    if (!folders || !folders.length) return;

    const picked = pickNextImage(folders, pool, usedPaths);
    if (!picked) return;

    const fileExt = extensionFromPath(picked.imagePath);
    const outFile = path.join(cacheDir, `${sanitizeName(entry.name) || "sample"}${fileExt}`);
    if (!fs.existsSync(outFile)) {
      fs.copyFileSync(picked.imagePath, outFile);
    }

    rows.push({
      name: String((entry && entry.name) || "").trim(),
      url: toRepoRelative(outFile, repoRoot),
      item_id: String((entry && entry.item_id) || "").trim(),
      canonical_label: label,
      source: "kaggle_household_waste_images",
      notes: `folder=${picked.folder}`
    });
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, toCsvRows(rows), "utf8");

  let mergedCount = null;
  if (args.mergeInto) {
    const mergePath = path.resolve(args.mergeInto);
    const existingRows = readCsvRows(mergePath);
    const mergedRows = mergeRows(existingRows, rows);
    fs.mkdirSync(path.dirname(mergePath), { recursive: true });
    fs.writeFileSync(mergePath, toCsvRows(mergedRows), "utf8");
    mergedCount = mergedRows.length;
  }

  console.log("Kaggle benchmark suggestions generated");
  console.log(
    JSON.stringify(
      {
        matched_rows: rows.length,
        output: path.relative(process.cwd(), outPath),
        merged_into: args.mergeInto ? path.relative(process.cwd(), path.resolve(args.mergeInto)) : null,
        merged_row_count: mergedCount
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
