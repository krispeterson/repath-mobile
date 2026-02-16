#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function usage() {
  console.log(
    "Usage: node ml/training/materialize-retraining-positives.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.csv] [--cache-dir test/benchmarks/images/retraining-positives] [--labels \"Aluminum Foil,Pizza Box\"] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    cacheDir: path.join("test", "benchmarks", "images", "retraining-positives"),
    labels: [],
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
    } else if (arg === "--labels") {
      args.labels = String(argv[++i] || "")
        .split(",")
        .map((value) => String(value || "").trim())
        .filter(Boolean);
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
      notes: String(cols[5] || "").trim(),
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
        quoteCsv(row.notes),
      ].join(",")
    );
  });
  return `${lines.join("\n")}\n`;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function extensionFromUrl(value) {
  const match = String(value || "").match(/\.([a-zA-Z0-9]{2,6})(?:[?#].*)?$/);
  if (!match) return ".jpg";
  return `.${match[1].toLowerCase()}`;
}

function toRepoRelative(targetPath) {
  return path.relative(process.cwd(), targetPath).split(path.sep).join("/");
}

function appendSourceUrlNote(existing, sourceUrl) {
  const notes = String(existing || "").trim();
  if (!sourceUrl) return notes;
  if (new RegExp(`(?:^|;\\s*)source_url=${escapeRegExp(sourceUrl)}(?:;|$)`, "i").test(notes)) {
    return notes;
  }
  if (!notes) return `source_url=${sourceUrl}`;
  return `${notes}; source_url=${sourceUrl}`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function download(url, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
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
      outPath,
      "-sS",
    ],
    { stdio: "pipe" }
  );
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);
  const cacheDir = path.resolve(args.cacheDir);
  const labelFilter = new Set(args.labels);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${inputPath}`);
  }

  const rows = readRows(inputPath);
  let candidates = rows.filter((row) => /^retrain_positive_/.test(row.name) && isHttpUrl(row.url));
  if (labelFilter.size) {
    candidates = candidates.filter((row) => labelFilter.has(row.canonical_label));
  }

  let downloaded = 0;
  let reusedLocal = 0;
  const failures = [];

  candidates.forEach((row) => {
    const sourceUrl = row.url;
    const ext = extensionFromUrl(sourceUrl);
    const outFile = path.join(cacheDir, `${row.name}${ext}`);
    const outRel = toRepoRelative(outFile);

    try {
      if (!fs.existsSync(outFile)) {
        if (!args.dryRun) {
          download(sourceUrl, outFile);
        }
        downloaded += 1;
      } else {
        reusedLocal += 1;
      }

      row.url = outRel;
      row.notes = appendSourceUrlNote(row.notes, sourceUrl);
    } catch (error) {
      failures.push({
        name: row.name,
        label: row.canonical_label,
        source_url: sourceUrl,
        error: String(error && error.message ? error.message : error),
      });
    }
  });

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, toCsv(rows), "utf8");
  }

  console.log("Retraining positive materialization summary");
  console.log(
    JSON.stringify(
      {
        input: path.relative(process.cwd(), inputPath),
        output: path.relative(process.cwd(), outPath),
        cache_dir: path.relative(process.cwd(), cacheDir),
        labels_filter: args.labels,
        remote_candidates: candidates.length,
        downloaded,
        reused_local: reusedLocal,
        failed: failures.length,
        failures: failures.slice(0, 20),
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
