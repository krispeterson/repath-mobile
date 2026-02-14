#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");

function usage() {
  console.log(
    "Usage: node ml/data/normalize-benchmark-labeled-urls.js [--input test/benchmarks/benchmark-labeled.csv] [--cache-dir test/benchmarks/images] [--out test/benchmarks/benchmark-labeled.csv]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    cacheDir: path.join("test", "benchmarks", "images"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
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

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function readRows(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i += 1) {
      row[header[i]] = String(cols[i] || "");
    }
    return row;
  });
  return { header, rows };
}

function sanitizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function extensionForUrl(urlValue) {
  const raw = String(urlValue || "");
  const match = raw.match(/\.([a-zA-Z0-9]{2,6})(?:[?#].*)?$/);
  if (match) return `.${match[1].toLowerCase()}`;
  return ".jpg";
}

function toRepoRelative(targetPath, repoRoot) {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function writeRows(filePath, header, rows) {
  const lines = [header.join(",")];
  rows.forEach((row) => {
    const cols = header.map((key) => quoteCsv(row[key] || ""));
    lines.push(cols.join(","));
  });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const cacheDir = path.resolve(args.cacheDir);
  const outPath = path.resolve(args.out);
  const repoRoot = process.cwd();

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${inputPath}`);
  }

  const { header, rows } = readRows(inputPath);
  if (!header.includes("url") || !header.includes("name")) {
    throw new Error("CSV must include at least name,url columns.");
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  let normalizedCount = 0;
  let copiedCount = 0;

  rows.forEach((row) => {
    const url = String(row.url || "").trim();
    if (!url) return;

    if (/^https?:\/\//i.test(url)) return;

    if (!url.startsWith("file://")) {
      const absolute = path.resolve(url);
      row.url = toRepoRelative(absolute, repoRoot);
      normalizedCount += 1;
      return;
    }

    let localPath;
    try {
      localPath = fileURLToPath(url);
    } catch (error) {
      return;
    }

    if (!fs.existsSync(localPath)) {
      return;
    }

    const insideRepo = path.resolve(localPath).startsWith(path.resolve(repoRoot) + path.sep);
    if (insideRepo) {
      row.url = toRepoRelative(localPath, repoRoot);
      normalizedCount += 1;
      return;
    }

    const ext = extensionForUrl(localPath);
    const outFile = path.join(cacheDir, `${sanitizeName(row.name || "sample")}${ext}`);
    if (!fs.existsSync(outFile)) {
      fs.copyFileSync(localPath, outFile);
      copiedCount += 1;
    }

    row.url = toRepoRelative(outFile, repoRoot);
    normalizedCount += 1;
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  writeRows(outPath, header, rows);

  console.log("Normalized benchmark labeled URLs");
  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        normalized: normalizedCount,
        copied_into_cache: copiedCount,
        output: path.relative(repoRoot, outPath)
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
