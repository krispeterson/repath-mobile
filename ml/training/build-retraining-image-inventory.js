#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/training/build-retraining-image-inventory.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/retraining-positive-image-inventory.json] [--local-prefix test/benchmarks/images/retraining-positives/]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "retraining-positive-image-inventory.json"),
    localPrefix: "test/benchmarks/images/retraining-positives/"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--local-prefix") {
      args.localPrefix = argv[++i];
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

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);
  const localPrefix = String(args.localPrefix || "").trim();

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${inputPath}`);
  }

  const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("Input CSV has no data rows.");
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const name = String(cols[0] || "").trim();
    const url = String(cols[1] || "").trim();
    if (!name.startsWith("retrain_positive_")) continue;
    if (!localPrefix || !url.startsWith(localPrefix)) continue;

    rows.push({
      name,
      url,
      item_id: String(cols[2] || "").trim(),
      canonical_label: String(cols[3] || "").trim(),
      source: String(cols[4] || "").trim(),
      notes: String(cols[5] || "").trim()
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const byLabel = {};
  rows.forEach((row) => {
    const key = row.canonical_label || "unknown";
    byLabel[key] = (byLabel[key] || 0) + 1;
  });

  const out = {
    generated_at: new Date().toISOString(),
    source_csv: path.relative(process.cwd(), inputPath),
    local_prefix: localPrefix,
    count: rows.length,
    labels: byLabel,
    rows
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log("Retraining image inventory generated");
  console.log(
    JSON.stringify(
      {
        source_csv: out.source_csv,
        output: path.relative(process.cwd(), outPath),
        count: out.count,
        labels: out.labels
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
