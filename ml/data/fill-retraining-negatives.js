#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { fileURLToPath } = require("url");

function usage() {
  console.log(
    "Usage: node ml/data/fill-retraining-negatives.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.csv] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    cacheDir: path.join("test", "benchmarks", "images", "retraining-negatives"),
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
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

function isRetrainingNegative(row) {
  return String(row.source || "").trim() === "retraining_queue_negative";
}

function isBaselineNegative(row) {
  return (
    !row.canonical_label &&
    !!row.url &&
    String(row.source || "").includes("negative")
  );
}

function extensionFromUrl(value) {
  const match = String(value || "").match(/\.([a-zA-Z0-9]{2,6})(?:[?#].*)?$/);
  if (!match) return ".jpg";
  return `.${match[1].toLowerCase()}`;
}

function resolveLocalPath(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return null;
  if (value.startsWith("file://")) {
    try {
      return fileURLToPath(value);
    } catch (_error) {
      return null;
    }
  }
  if (/^https?:\/\//i.test(value)) return null;
  return path.resolve(value);
}

function copyOrDownloadTo(targetPath, sourceUrl) {
  const localPath = resolveLocalPath(sourceUrl);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (localPath && fs.existsSync(localPath)) {
    fs.copyFileSync(localPath, targetPath);
    return "copied_local";
  }

  execFileSync(
    "curl",
    ["-L", "--retry", "3", "--retry-all-errors", "--connect-timeout", "20", "--max-time", "90", "--fail", sourceUrl, "-o", targetPath, "-sS"],
    { stdio: "pipe" }
  );
  return "downloaded";
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);
  const cacheDir = path.resolve(args.cacheDir);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${inputPath}`);
  }

  const rows = readRows(inputPath);
  const candidatePool = rows
    .filter(isBaselineNegative)
    .map((row) => row.url)
    .filter(Boolean);

  const unresolvedTargets = rows.filter((row) => isRetrainingNegative(row) && !row.url);
  let filled = 0;
  let copiedLocal = 0;
  let downloaded = 0;
  let failed = 0;

  unresolvedTargets.forEach((row, idx) => {
    const candidate = candidatePool[idx % candidatePool.length];
    if (!candidate) {
      failed += 1;
      return;
    }

    const ext = extensionFromUrl(candidate);
    const outFile = path.join(cacheDir, `${row.name || `retraining-negative-${idx + 1}`}${ext}`);
    const outRelative = path.relative(process.cwd(), outFile).split(path.sep).join("/");

    if (!args.dryRun) {
      try {
        const mode = copyOrDownloadTo(outFile, candidate);
        if (mode === "copied_local") copiedLocal += 1;
        if (mode === "downloaded") downloaded += 1;
      } catch (_error) {
        failed += 1;
        return;
      }
    }

    row.url = outRelative;
    row.notes = `${row.notes}; seeded_from=baseline_negative_pool; materialized_local=${outRelative}`;
    filled += 1;
  });

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, toCsv(rows), "utf8");
  }

  console.log("Retraining negative fill summary");
  console.log(
    JSON.stringify(
      {
        total_rows: rows.length,
        unresolved_retraining_negatives: unresolvedTargets.length,
        baseline_negative_candidates: candidatePool.length,
        filled,
        copied_local: copiedLocal,
        downloaded,
        failed,
        cache_dir: path.relative(process.cwd(), cacheDir),
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
