#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/data/sync-labeled-from-manifest.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.csv] [--include-ready] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    includeReady: false,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--include-ready") {
      args.includeReady = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const start = 1;
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

function firstLabel(entry) {
  const any = Array.isArray(entry && entry.expected_any) ? entry.expected_any : [];
  if (any.length) return String(any[0] || "").trim();
  const all = Array.isArray(entry && entry.expected_all) ? entry.expected_all : [];
  if (all.length) return String(all[0] || "").trim();
  return "";
}

function mergeNotes(existing, add) {
  const e = String(existing || "").trim();
  const a = String(add || "").trim();
  if (!e) return a;
  if (!a) return e;
  if (e.includes(a)) return e;
  return `${e}; ${a}`;
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const inputPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = loadJson(manifestPath);
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  const rows = readCsvRows(inputPath);

  const map = new Map();
  rows.forEach((row) => {
    if (row.name) map.set(row.name, row);
  });

  let added = 0;
  let enriched = 0;

  images.forEach((entry) => {
    const name = String((entry && entry.name) || "").trim();
    if (!name) return;

    const status = String((entry && entry.status) || "").toLowerCase();
    if (!args.includeReady && status !== "todo") return;

    const canonicalLabel = firstLabel(entry);
    const itemId = String((entry && entry.item_id) || "").trim();
    const note = String((entry && entry.notes) || "").trim();

    const existing = map.get(name);
    if (!existing) {
      map.set(name, {
        name,
        url: String((entry && entry.url) || "").trim(),
        item_id: itemId,
        canonical_label: canonicalLabel,
        source: "manifest_todo_queue",
        notes: mergeNotes(note, "synced_from_manifest")
      });
      added += 1;
      return;
    }

    let changed = false;
    if (!existing.item_id && itemId) {
      existing.item_id = itemId;
      changed = true;
    }
    if (!existing.canonical_label && canonicalLabel) {
      existing.canonical_label = canonicalLabel;
      changed = true;
    }

    const mergedNotes = mergeNotes(existing.notes, "synced_from_manifest");
    if (mergedNotes !== existing.notes) {
      existing.notes = mergedNotes;
      changed = true;
    }

    if (changed) enriched += 1;
  });

  const merged = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, toCsv(merged), "utf8");
  }

  console.log("Manifest-to-labeled sync summary");
  console.log(
    JSON.stringify(
      {
        rows_before: rows.length,
        rows_after: merged.length,
        added,
        enriched,
        include_ready: args.includeReady,
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
