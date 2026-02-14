#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/build-benchmark-batches.js [--priority test/benchmarks/benchmark-priority-report.json] [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--out-dir test/benchmarks] [--urgent 30] [--high 50] [--medium 80]"
  );
}

function parseArgs(argv) {
  const args = {
    priority: path.join("test", "benchmarks", "benchmark-priority-report.json"),
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    outDir: path.join("test", "benchmarks"),
    urgent: 30,
    high: 50,
    medium: 80
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--priority") {
      args.priority = argv[++i];
    } else if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--out-dir") {
      args.outDir = argv[++i];
    } else if (arg === "--urgent") {
      args.urgent = Number(argv[++i]);
    } else if (arg === "--high") {
      args.high = Number(argv[++i]);
    } else if (arg === "--medium") {
      args.medium = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  ["urgent", "high", "medium"].forEach((key) => {
    if (!Number.isFinite(args[key]) || args[key] < 0) {
      args[key] = 0;
    }
  });

  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function indexManifestByName(manifest) {
  const map = new Map();
  const images = Array.isArray(manifest && manifest.images) ? manifest.images : [];
  images.forEach((entry) => {
    const name = String((entry && entry.name) || "").trim();
    if (name) map.set(name, entry);
  });
  return map;
}

function toCsvValue(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows) {
  const headers = [
    "batch",
    "name",
    "item_id",
    "canonical_label",
    "primary_outcome",
    "priority_score",
    "priority_band",
    "url",
    "status",
    "required",
    "reasons"
  ];
  const lines = [headers.join(",")];

  rows.forEach((row) => {
    const values = headers.map((header) => {
      if (header === "reasons") {
        return toCsvValue(Array.isArray(row.reasons) ? row.reasons.join(" | ") : "");
      }
      return toCsvValue(row[header]);
    });
    lines.push(values.join(","));
  });

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function selectBatchRows(candidates, manifestByName, band, limit) {
  const rows = [];
  for (let i = 0; i < candidates.length; i += 1) {
    if (rows.length >= limit) break;
    const candidate = candidates[i];
    if (String(candidate.priority_band || "") !== band) continue;

    const entry = manifestByName.get(String(candidate.name || ""));
    rows.push({
      batch: band,
      name: candidate.name,
      item_id: candidate.item_id || "",
      canonical_label: candidate.canonical_label || "",
      primary_outcome: candidate.primary_outcome || "",
      priority_score: Number(candidate.priority_score || 0),
      priority_band: candidate.priority_band || "",
      url: entry && entry.url ? entry.url : "",
      status: entry && entry.status ? entry.status : "",
      required: entry && typeof entry.required === "boolean" ? entry.required : "",
      reasons: candidate.reasons || []
    });
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv);
  const priorityPath = path.resolve(args.priority);
  const manifestPath = path.resolve(args.manifest);
  const outDir = path.resolve(args.outDir);

  if (!fs.existsSync(priorityPath)) {
    throw new Error(`Priority report not found: ${priorityPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const priority = loadJson(priorityPath);
  const manifest = loadJson(manifestPath);

  const candidates = Array.isArray(priority && priority.all_candidates) ? priority.all_candidates : [];
  const manifestByName = indexManifestByName(manifest);

  const urgentRows = selectBatchRows(candidates, manifestByName, "urgent", args.urgent);
  const highRows = selectBatchRows(candidates, manifestByName, "high", args.high);
  const mediumRows = selectBatchRows(candidates, manifestByName, "medium", args.medium);
  const combinedRows = [...urgentRows, ...highRows, ...mediumRows];

  const plan = {
    generated_at: new Date().toISOString(),
    inputs: {
      priority: path.relative(process.cwd(), priorityPath),
      manifest: path.relative(process.cwd(), manifestPath)
    },
    config: {
      urgent_limit: args.urgent,
      high_limit: args.high,
      medium_limit: args.medium
    },
    summary: {
      urgent_count: urgentRows.length,
      high_count: highRows.length,
      medium_count: mediumRows.length,
      total_selected: combinedRows.length
    },
    batches: {
      urgent: urgentRows,
      high: highRows,
      medium: mediumRows,
      combined: combinedRows
    }
  };

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "benchmark-labeling-batches.json");
  const urgentCsv = path.join(outDir, "benchmark-labeling-batch-urgent.csv");
  const highCsv = path.join(outDir, "benchmark-labeling-batch-high.csv");
  const mediumCsv = path.join(outDir, "benchmark-labeling-batch-medium.csv");
  const combinedCsv = path.join(outDir, "benchmark-labeling-batch-combined.csv");

  fs.writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(urgentCsv, urgentRows);
  writeCsv(highCsv, highRows);
  writeCsv(mediumCsv, mediumRows);
  writeCsv(combinedCsv, combinedRows);

  console.log("Benchmark labeling batches generated");
  console.log(
    JSON.stringify(
      {
        summary: plan.summary,
        files: {
          json: path.relative(process.cwd(), jsonPath),
          urgent_csv: path.relative(process.cwd(), urgentCsv),
          high_csv: path.relative(process.cwd(), highCsv),
          medium_csv: path.relative(process.cwd(), mediumCsv),
          combined_csv: path.relative(process.cwd(), combinedCsv)
        }
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
