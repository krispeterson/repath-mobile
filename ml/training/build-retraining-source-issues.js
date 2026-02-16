#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/training/build-retraining-source-issues.js [--input test/benchmarks/benchmark-labeled.csv] [--seed test/benchmarks/retraining-positive-source-issues.seed.json] [--out test/benchmarks/retraining-positive-source-issues.json]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    seed: path.join("test", "benchmarks", "retraining-positive-source-issues.seed.json"),
    out: path.join("test", "benchmarks", "retraining-positive-source-issues.json")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--seed") {
      args.seed = argv[++i];
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

function loadCsvRows(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    out.push({
      name: String(cols[0] || "").trim(),
      url: String(cols[1] || "").trim(),
      item_id: String(cols[2] || "").trim(),
      canonical_label: String(cols[3] || "").trim(),
      source: String(cols[4] || "").trim(),
      notes: String(cols[5] || "").trim()
    });
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const seedPath = path.resolve(args.seed);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input CSV not found: ${inputPath}`);
  }
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}`);
  }

  const rows = loadCsvRows(inputPath);
  const byName = new Map(rows.map((row) => [row.name, row]));
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const issues = Array.isArray(seed.issues) ? seed.issues : [];

  const resolved = issues.map((issue) => {
    const row = byName.get(String(issue.name || "").trim()) || null;
    return {
      name: String(issue.name || "").trim(),
      status: row ? "mapped_to_replacement" : "not_found_in_csv",
      issue_type: String(issue.issue_type || "source_content_mismatch"),
      expected_label: String(issue.expected_label || ""),
      original_problem_summary: String(issue.original_problem_summary || ""),
      current: row
        ? {
            url: row.url,
            source: row.source,
            notes: row.notes
          }
        : null
    };
  });

  const output = {
    generated_at: new Date().toISOString(),
    seed: path.relative(process.cwd(), seedPath),
    source_csv: path.relative(process.cwd(), inputPath),
    summary: {
      issue_count: resolved.length,
      mapped_to_replacement: resolved.filter((entry) => entry.status === "mapped_to_replacement").length,
      not_found_in_csv: resolved.filter((entry) => entry.status === "not_found_in_csv").length
    },
    issues: resolved
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log("Retraining source issue log generated");
  console.log(
    JSON.stringify(
      {
        seed: output.seed,
        source_csv: output.source_csv,
        output: path.relative(process.cwd(), outPath),
        summary: output.summary
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
