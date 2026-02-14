#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/data/dedupe-benchmark-labeled.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.csv] [--keep-first|--keep-last] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    keepFirst: true,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--keep-first") args.keepFirst = true;
    else if (arg === "--keep-last") args.keepFirst = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
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
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function readRows(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
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
    lines.push([
      quoteCsv(row.name),
      quoteCsv(row.url),
      quoteCsv(row.item_id),
      quoteCsv(row.canonical_label),
      quoteCsv(row.source),
      quoteCsv(row.notes)
    ].join(","));
  });
  return `${lines.join("\n")}\n`;
}

function appendNote(notes, marker) {
  const base = String(notes || "").trim();
  if (!base) return marker;
  if (base.includes(marker)) return base;
  return `${base}; ${marker}`;
}

function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);
  if (!fs.existsSync(inPath)) throw new Error(`Input CSV not found: ${inPath}`);

  const rows = readRows(inPath);
  const byUrl = new Map();

  rows.forEach((row, index) => {
    const url = String(row.url || "").trim();
    if (!url) return;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push({ row, index });
  });

  let changed = 0;
  let groups = 0;

  byUrl.forEach((entries) => {
    if (entries.length < 2) return;
    groups += 1;
    const keepPos = args.keepFirst ? 0 : entries.length - 1;

    entries.forEach((entry, pos) => {
      if (pos === keepPos) return;
      if (!entry.row.url) return;
      entry.row.url = "";
      entry.row.notes = appendNote(entry.row.notes, "Needs unique URL (csv dedupe).");
      changed += 1;
    });
  });

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, toCsv(rows), "utf8");
  }

  console.log("Labeled CSV dedupe summary");
  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        duplicate_url_groups: groups,
        rows_cleared: changed,
        keep_first: args.keepFirst,
        dry_run: args.dryRun,
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
