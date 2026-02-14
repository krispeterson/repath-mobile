#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");

function usage() {
  console.log(
    "Usage: node scripts/suggest-benchmark-online.js [--input test/benchmarks/benchmark-labeled.csv] [--out test/benchmarks/benchmark-labeled.online.csv] [--merge-into test/benchmarks/benchmark-labeled.csv] [--limit 30] [--offset 0] [--timeout-ms 15000] [--max-retries 3] [--include-previous-failures]"
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
    maxRetries: 3,
    includePreviousFailures: false
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
    } else if (arg === "--include-previous-failures") {
      args.includePreviousFailures = true;
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

async function findCommonsFileTitles(label, opts) {
  const base = "https://commons.wikimedia.org/w/api.php";
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srnamespace: "6",
    srlimit: "10",
    srsearch: `${label} filetype:bitmap`
  });
  const url = `${base}?${query.toString()}`;
  let lastError = null;
  for (let attempt = 1; attempt <= opts.maxRetries; attempt += 1) {
    try {
      const payload = await fetchJson(url, opts.timeoutMs);
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

function toCommonsFilePathUrl(fileTitle) {
  const normalized = fileTitle.startsWith("File:") ? fileTitle.slice(5) : fileTitle;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(normalized)}`;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function titleCaseWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) return word.toLowerCase();
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function tokenizeLabel(label) {
  return String(label || "")
    .replace(/[()]/g, " ")
    .replace(/[,&]/g, " ")
    .replace(/\bother than\b/gi, " ")
    .replace(/\bmeal kit\b/gi, " ")
    .replace(/\bsingle-use\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LABEL_ALIAS_MAP = {
  "automotive fluids other than motor oil antifreeze": [
    "automotive fluid bottle",
    "car fluid container",
    "vehicle fluid bottle"
  ],
  "bulky rigid plastics": [
    "large plastic item",
    "rigid plastic container",
    "plastic storage tote"
  ],
  "cereal liner bag": [
    "cereal box liner bag",
    "plastic cereal liner",
    "mylar cereal bag"
  ],
  "clear plastic berry and salad container": [
    "clear clamshell container",
    "plastic produce container",
    "clear salad container"
  ],
  "corrugated plastic election sign": [
    "corrugated plastic sign",
    "yard sign plastic",
    "political yard sign"
  ],
  "envelopes with bubble wrap inside": [
    "bubble mailer envelope",
    "padded envelope",
    "bubble lined envelope"
  ],
  "kitty litter bucket": ["cat litter bucket", "plastic litter pail", "litter tub container"],
  "plastic disinfectant wipes container": [
    "disinfecting wipes canister",
    "clorox wipes container",
    "wipes plastic canister"
  ],
  "plastic grocery bags and plastic film": [
    "plastic grocery bag",
    "plastic film wrap",
    "polyethylene bag"
  ],
  "plastic lawn furniture": ["plastic patio chair", "outdoor plastic furniture", "resin lawn chair"],
  "reflective bubble wrap and foil bubble mailers": [
    "foil bubble mailer",
    "metalized bubble wrap",
    "reflective bubble insulation"
  ],
  "rubbermaid storage bin": ["plastic storage bin", "rubbermaid tote", "storage tote container"],
  "shredded brown crinkle paper": [
    "shredded kraft paper",
    "brown crinkle paper filler",
    "packaging paper shred"
  ],
  "sun basket paper insulation": [
    "paper insulation packaging",
    "meal kit paper insulation",
    "recycled paper insulation liner"
  ],
  "woven plastic feed bag": ["woven polypropylene bag", "feed sack bag", "grain feed bag woven"],
  "foil coffee bags": ["foil coffee bag", "coffee bean bag foil", "laminated coffee pouch"],
  "antifreeze bottle": ["antifreeze jug", "coolant bottle", "automotive coolant container"]
};

function normalizeLabelKey(label) {
  return tokenizeLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueryVariants(row) {
  const label = String(row.canonical_label || "").trim();
  const itemId = String(row.item_id || "").trim();
  const itemFromId = itemId.replace(/[-_]+/g, " ").trim().replace(/\bdepth\b/gi, "").trim();
  const cleanedLabel = tokenizeLabel(label).replace(/[\/]+/g, " ").replace(/\s+/g, " ").trim();
  const splitParts = label
    .split(/\/|\bor\b/gi)
    .map((part) => tokenizeLabel(part))
    .map((part) => part.replace(/\bplastic film election sign\b/gi, "plastic sign").trim())
    .map((part) => part.replace(/\bpaperboard election sign\b/gi, "cardboard sign").trim())
    .filter(Boolean);
  const singularParts = splitParts.map((part) => part.replace(/\bbags\b/gi, "bag").replace(/\bcontainers\b/gi, "container"));
  const genericHints = splitParts.map((part) => `${part} object`);
  const aliases = LABEL_ALIAS_MAP[normalizeLabelKey(label)] || [];
  const safeTitle = titleCaseWords(cleanedLabel);
  return unique([label, itemFromId, cleanedLabel, safeTitle, ...aliases, ...splitParts, ...singularParts, ...genericHints]);
}

function isPreviousNoMatch(row) {
  const source = String(row.source || "").trim().toLowerCase();
  const notes = String(row.notes || "").toLowerCase();
  return source === "wikimedia_commons_search" && notes.includes("no_match");
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
  const existingRows = args.mergeInto ? readCsvRows(path.resolve(args.mergeInto)) : rows;
  const usedUrls = new Set(existingRows.map((row) => String(row.url || "").trim()).filter(Boolean));
  const unresolved = rows.filter((row) => !row.url && row.canonical_label);
  const skippedPrevious = unresolved.filter((row) => isPreviousNoMatch(row)).length;
  const pool = args.includePreviousFailures
    ? unresolved
    : unresolved.filter((row) => !isPreviousNoMatch(row));
  const targets = pool.slice(args.offset, args.offset + args.limit);
  const updates = [];
  let noMatchCount = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const row = targets[i];
    const variants = buildQueryVariants(row);
    let title = null;
    let matchedQuery = "";

    for (let v = 0; v < variants.length; v += 1) {
      const queryText = variants[v];
      let titles = [];
      try {
        titles = await findCommonsFileTitles(queryText, {
          timeoutMs: args.timeoutMs,
          maxRetries: args.maxRetries
        });
      } catch (error) {
        continue;
      }
      for (let t = 0; t < titles.length; t += 1) {
        const candidateTitle = titles[t];
        const candidateUrl = toCommonsFilePathUrl(candidateTitle);
        if (usedUrls.has(candidateUrl)) continue;
        title = candidateTitle;
        usedUrls.add(candidateUrl);
        matchedQuery = queryText;
        break;
      }
      if (title) break;
    }

    if (title) {
      updates.push({
        ...row,
        url: toCommonsFilePathUrl(title),
        source: "wikimedia_commons_search",
        notes: `title=${title}; query=${matchedQuery}`
      });
      continue;
    }

    noMatchCount += 1;
    updates.push({
      ...row,
      source: "wikimedia_commons_search",
      notes: "no_match"
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
        skipped_previously_attempted: skippedPrevious,
        unresolved_pool: pool.length,
        matched_rows: updates.filter((row) => row.url).length,
        no_match_rows: noMatchCount,
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
