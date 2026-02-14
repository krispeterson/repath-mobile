#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/build-benchmark-completion-template.js [--batches test/benchmarks/benchmark-labeling-batches.json] [--out test/benchmarks/benchmark-labeled.csv] [--bands urgent,high]"
  );
}

function parseArgs(argv) {
  const args = {
    batches: path.join("test", "benchmarks", "benchmark-labeling-batches.json"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    bands: ["urgent", "high"]
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--batches") {
      args.batches = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--bands") {
      args.bands = String(argv[++i] || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!args.bands.length) {
    args.bands = ["urgent", "high"];
  }

  return args;
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

function uniqueByName(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach((row) => {
    const name = String((row && row.name) || "").trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(row);
  });
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const batchesPath = path.resolve(args.batches);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(batchesPath)) {
    throw new Error(`Batches file not found: ${batchesPath}`);
  }

  const batches = loadJson(batchesPath);
  const bucket = batches && batches.batches ? batches.batches : {};

  const selected = [];
  args.bands.forEach((band) => {
    const rows = Array.isArray(bucket[band]) ? bucket[band] : [];
    rows.forEach((row) => {
      selected.push({
        name: row.name || "",
        url: "",
        item_id: row.item_id || "",
        canonical_label: row.canonical_label || "",
        priority_band: row.priority_band || band,
        priority_score: Number(row.priority_score || 0),
        notes: ""
      });
    });
  });

  const deduped = uniqueByName(selected).sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return String(a.name).localeCompare(String(b.name));
  });

  const header = ["name", "url", "item_id", "canonical_label", "priority_band", "priority_score", "notes"];
  const lines = [header.join(",")];
  deduped.forEach((row) => {
    lines.push([
      quoteCsv(row.name),
      quoteCsv(row.url),
      quoteCsv(row.item_id),
      quoteCsv(row.canonical_label),
      quoteCsv(row.priority_band),
      quoteCsv(row.priority_score),
      quoteCsv(row.notes)
    ].join(","));
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");

  console.log("Benchmark completion template generated");
  console.log(
    JSON.stringify(
      {
        selected_bands: args.bands,
        row_count: deduped.length,
        output: path.relative(process.cwd(), outPath)
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
