#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");

function usage() {
  console.log(
    "Usage: node scripts/suggest-benchmark-online.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.online.csv] [--merge-into test/benchmarks/benchmark-labeled.csv] [--limit 30]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.online.csv"),
    mergeInto: null,
    limit: 30
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--merge-into") {
      args.mergeInto = argv[++i];
    } else if (arg === "--limit") {
      args.limit = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    args.limit = 30;
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

function readCsvRows(filePath) {
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

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "repath-mobile-benchmark-bot/1.0 (local dev)"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode || 0) >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
  });
}

async function findCommonsFileTitle(label) {
  const base = "https://commons.wikimedia.org/w/api.php";
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srnamespace: "6",
    srlimit: "3",
    srsearch: `${label} filetype:bitmap`
  });
  const url = `${base}?${query.toString()}`;
  const payload = await fetchJson(url);
  const rows = payload && payload.query && Array.isArray(payload.query.search) ? payload.query.search : [];
  if (!rows.length) return null;
  return String(rows[0].title || "").trim() || null;
}

function toCommonsFilePathUrl(fileTitle) {
  const normalized = fileTitle.startsWith("File:") ? fileTitle.slice(5) : fileTitle;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(normalized)}`;
}

function mergeRows(existingRows, updates) {
  const map = new Map();
  existingRows.forEach((row) => {
    if (row.name) map.set(row.name, row);
  });
  updates.forEach((row) => {
    if (!row.name) return;
    map.set(row.name, row);
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input CSV not found: ${inPath}`);
  }

  const rows = readCsvRows(inPath);
  const targets = rows.filter((row) => !row.url && row.canonical_label).slice(0, args.limit);
  const updates = [];

  for (let i = 0; i < targets.length; i += 1) {
    const row = targets[i];
    let title = null;
    try {
      title = await findCommonsFileTitle(row.canonical_label);
    } catch (error) {
      continue;
    }
    if (!title) continue;
    updates.push({
      ...row,
      url: toCommonsFilePathUrl(title),
      source: "wikimedia_commons_search",
      notes: `title=${title}`
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, toCsv(updates), "utf8");

  let mergedCount = null;
  if (args.mergeInto) {
    const mergePath = path.resolve(args.mergeInto);
    const existing = readCsvRows(mergePath);
    const merged = mergeRows(existing, updates);
    fs.writeFileSync(mergePath, toCsv(merged), "utf8");
    mergedCount = merged.length;
  }

  console.log("Online benchmark suggestions generated");
  console.log(
    JSON.stringify(
      {
        attempted: targets.length,
        matched_rows: updates.length,
        output: path.relative(process.cwd(), outPath),
        merged_into: args.mergeInto ? path.relative(process.cwd(), path.resolve(args.mergeInto)) : null,
        merged_row_count: mergedCount
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
