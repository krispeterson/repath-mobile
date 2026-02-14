#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");

function usage() {
  console.log(
    "Usage: node ml/data/suggest-negative-online.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.negatives.csv] [--merge-into test/benchmarks/benchmark-labeled.csv] [--limit 20]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.negatives.csv"),
    mergeInto: null,
    limit: 20,
    timeoutMs: 15000,
    maxRetries: 3
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") args.manifest = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--merge-into") args.mergeInto = argv[++i];
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (arg === "--max-retries") args.maxRetries = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 20;
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) args.timeoutMs = 15000;
  if (!Number.isFinite(args.maxRetries) || args.maxRetries < 1) args.maxRetries = 3;
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
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function readCsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
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

function mergeRows(existingRows, updates) {
  const map = new Map();
  existingRows.forEach((row) => {
    if (row.name) map.set(row.name, row);
  });
  updates.forEach((row) => {
    if (row.name) map.set(row.name, row);
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function fetchJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { "User-Agent": "repath-mobile-negative-bot/1.0" },
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
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request_timeout")));
    req.on("error", reject);
  });
}

async function searchCommons(query, opts) {
  const base = "https://commons.wikimedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srnamespace: "6",
    srlimit: "5",
    srsearch: `${query} filetype:bitmap`
  });

  let lastError = null;
  for (let attempt = 1; attempt <= opts.maxRetries; attempt += 1) {
    try {
      const payload = await fetchJson(`${base}?${params.toString()}`, opts.timeoutMs);
      const rows = payload && payload.query && Array.isArray(payload.query.search) ? payload.query.search : [];
      return rows.map((row) => String((row && row.title) || "").trim()).filter(Boolean);
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }

  throw lastError || new Error("request_failed");
}

function toCommonsFilePathUrl(title) {
  const normalized = title.startsWith("File:") ? title.slice(5) : title;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(normalized)}`;
}

function isNegative(entry) {
  const any = Array.isArray(entry && entry.expected_any) ? entry.expected_any : [];
  const all = Array.isArray(entry && entry.expected_all) ? entry.expected_all : [];
  return any.length === 0 && all.length === 0;
}

function queryHint(entry) {
  const notes = String((entry && entry.notes) || "");
  const m = notes.match(/query_hint=([^;]+)/i);
  if (m && m[1]) return m[1].trim();
  const name = String((entry && entry.name) || "")
    .replace(/^todo_negative_/, "")
    .replace(/_[0-9]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return name || "street scene";
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = loadJson(path.resolve(args.manifest));
  const inRows = readCsvRows(path.resolve(args.input));
  const usedUrls = new Set(inRows.map((r) => r.url).filter(Boolean));

  const negatives = (manifest.images || [])
    .filter((entry) => isNegative(entry) && String((entry.status || "")).toLowerCase() === "todo")
    .slice(0, args.limit);

  const updates = [];

  for (let i = 0; i < negatives.length; i += 1) {
    const entry = negatives[i];
    const name = String(entry.name || "").trim();
    const hint = queryHint(entry);

    let titles = [];
    try {
      titles = await searchCommons(hint, { timeoutMs: args.timeoutMs, maxRetries: args.maxRetries });
    } catch (error) {
      continue;
    }

    let pickedUrl = "";
    let pickedTitle = "";
    for (let t = 0; t < titles.length; t += 1) {
      const url = toCommonsFilePathUrl(titles[t]);
      if (!usedUrls.has(url)) {
        pickedUrl = url;
        pickedTitle = titles[t];
        usedUrls.add(url);
        break;
      }
    }

    if (!pickedUrl) continue;

    updates.push({
      name,
      url: pickedUrl,
      item_id: "",
      canonical_label: "",
      source: "wikimedia_commons_negative_search",
      notes: `title=${pickedTitle}; query=${hint}`
    });
  }

  const outPath = path.resolve(args.out);
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

  console.log("Negative online suggestions generated");
  console.log(
    JSON.stringify(
      {
        attempted: negatives.length,
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
