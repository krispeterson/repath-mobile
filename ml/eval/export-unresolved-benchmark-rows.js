#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/eval/export-unresolved-benchmark-rows.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-unresolved.csv]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-unresolved.csv")
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

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function readCsvRows(filePath) {
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
  const header = [
    "name",
    "item_id",
    "canonical_label",
    "current_source",
    "current_notes",
    "wikimedia_search_url",
    "google_images_search_url"
  ];

  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        quoteCsv(row.name),
        quoteCsv(row.item_id),
        quoteCsv(row.canonical_label),
        quoteCsv(row.source),
        quoteCsv(row.notes),
        quoteCsv(row.wikimedia_search_url),
        quoteCsv(row.google_images_search_url)
      ].join(",")
    );
  });
  return `${lines.join("\n")}\n`;
}

function buildSearchUrls(label) {
  const query = `${String(label || "").trim()} recycling`;
  return {
    wikimedia: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(query)}&title=Special:MediaSearch&type=image`,
    googleImages: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
  };
}

function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input CSV not found: ${inPath}`);
  }

  const unresolved = readCsvRows(inPath)
    .filter((row) => !row.url)
    .map((row) => {
      const search = buildSearchUrls(row.canonical_label);
      return {
        ...row,
        wikimedia_search_url: search.wikimedia,
        google_images_search_url: search.googleImages
      };
    })
    .sort((a, b) => a.canonical_label.localeCompare(b.canonical_label) || a.name.localeCompare(b.name));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, toCsv(unresolved), "utf8");

  console.log("Exported unresolved benchmark rows");
  console.log(
    JSON.stringify(
      {
        unresolved_rows: unresolved.length,
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
