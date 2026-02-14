#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/training/build-retraining-manifest.js [--input test/benchmarks/benchmark-labeled.csv] [--out ml/artifacts/retraining/retraining-manifest.json]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("ml", "artifacts", "retraining", "retraining-manifest.json")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
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

function readRows(filePath) {
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
      notes: String(cols[5] || "").trim()
    });
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input CSV not found: ${inPath}`);
  }

  const retrainRows = readRows(inPath)
    .filter((row) => row.name.startsWith("retrain_"))
    .filter((row) => row.url);

  const samples = retrainRows.map((row) => {
    const isNegative = row.name.startsWith("retrain_negative_") || !row.canonical_label;
    return {
      id: row.name,
      image: row.url,
      label: isNegative ? null : row.canonical_label,
      is_negative: isNegative,
      source: row.source || "retraining_queue",
      notes: row.notes || ""
    };
  });

  const payload = {
    generated_at: new Date().toISOString(),
    source_csv: path.relative(process.cwd(), inPath),
    sample_count: samples.length,
    positive_count: samples.filter((s) => !s.is_negative).length,
    negative_count: samples.filter((s) => s.is_negative).length,
    samples
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("Retraining manifest generated");
  console.log(
    JSON.stringify(
      {
        input: path.relative(process.cwd(), inPath),
        output: path.relative(process.cwd(), outPath),
        samples: payload.sample_count,
        positives: payload.positive_count,
        negatives: payload.negative_count
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
