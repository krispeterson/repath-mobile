#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/data/merge-retraining-queue.js [--input test/benchmarks/benchmark-labeled.csv] [--queue test/benchmarks/benchmark-retraining-queue.csv] [--out test/benchmarks/benchmark-labeled.csv] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    queue: path.join("test", "benchmarks", "benchmark-retraining-queue.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--queue") {
      args.queue = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
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

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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
        quoteCsv(row.notes)
      ].join(",")
    );
  });
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.input);
  const queuePath = path.resolve(args.queue);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input file not found: ${inPath}`);
  }
  if (!fs.existsSync(queuePath)) {
    throw new Error(`Queue file not found: ${queuePath}`);
  }

  const baseRows = readRows(inPath);
  const queueRows = readRows(queuePath);
  const seen = new Set(baseRows.map((row) => row.name).filter(Boolean));

  const additions = queueRows.filter((row) => row.name && !seen.has(row.name));
  const merged = baseRows.concat(additions).sort((a, b) => a.name.localeCompare(b.name));

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, toCsv(merged), "utf8");
  }

  console.log("Retraining queue merge summary");
  console.log(
    JSON.stringify(
      {
        base_rows: baseRows.length,
        queue_rows: queueRows.length,
        rows_added: additions.length,
        rows_total: merged.length,
        output: path.relative(process.cwd(), outPath),
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
