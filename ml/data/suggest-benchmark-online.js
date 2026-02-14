#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");

function usage() {
  console.log(
    "Usage: node scripts/suggest-benchmark-online.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.online.csv] [--merge-into test/benchmarks/benchmark-labeled.csv] [--limit 30] [--offset 0] [--timeout-ms 15000] [--max-retries 3]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.online.csv"),
    mergeInto: null,
    limit: 30,
    offset: 0,
    timeoutMs: 15000,
    maxRetries: 3
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
    } else if (arg === "--offset") {
      args.offset = Number(argv[++i]);
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++i]);
    } else if (arg === "--max-retries") {
      args.maxRetries = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    args.limit = 30;
  }
  if (!Number.isFinite(args.offset) || args.offset < 0) {
    args.offset = 0;
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
    args.timeoutMs = 15000;
  }
  if (!Number.isFinite(args.maxRetries) || args.maxRetries < 1) {
    args.maxRetries = 3;
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

function fetchJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "repath-mobile-benchmark-bot/1.0 (local dev)"
        },
        timeout: timeoutMs
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
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("request_timeout"));
    });
    req.on("error", reject);
  });
}

async function findCommonsFileTitle(label, opts) {
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
  let lastError = null;
  for (let attempt = 1; attempt <= opts.maxRetries; attempt += 1) {
    try {
      const payload = await fetchJson(url, opts.timeoutMs);
      const rows = payload && payload.query && Array.isArray(payload.query.search) ? payload.query.search : [];
      if (!rows.length) return null;
      return String(rows[0].title || "").trim() || null;
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }
  throw lastError || new Error("request_failed");
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
  const pool = rows.filter((row) => !row.url && row.canonical_label);
  const targets = pool.slice(args.offset, args.offset + args.limit);
  const updates = [];

  for (let i = 0; i < targets.length; i += 1) {
    const row = targets[i];
    let title = null;
    try {
      title = await findCommonsFileTitle(row.canonical_label, {
        timeoutMs: args.timeoutMs,
        maxRetries: args.maxRetries
      });
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
        offset: args.offset,
        unresolved_pool: pool.length,
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
