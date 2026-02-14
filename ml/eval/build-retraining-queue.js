#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/eval/build-retraining-queue.js [--priority-csv test/benchmarks/benchmark-retraining-priority.csv] [--out test/benchmarks/benchmark-retraining-queue.csv] [--positive-top 8] [--negative-top 4] [--variants 3]"
  );
}

function parseArgs(argv) {
  const args = {
    priorityCsv: path.join("test", "benchmarks", "benchmark-retraining-priority.csv"),
    out: path.join("test", "benchmarks", "benchmark-retraining-queue.csv"),
    positiveTop: 8,
    negativeTop: 4,
    variants: 3
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--priority-csv") {
      args.priorityCsv = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--positive-top") {
      args.positiveTop = Number(argv[++i]);
    } else if (arg === "--negative-top") {
      args.negativeTop = Number(argv[++i]);
    } else if (arg === "--variants") {
      args.variants = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.positiveTop) || args.positiveTop < 1) args.positiveTop = 8;
  if (!Number.isFinite(args.negativeTop) || args.negativeTop < 1) args.negativeTop = 4;
  if (!Number.isFinite(args.variants) || args.variants < 1) args.variants = 3;

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readPriorityRows(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    rows.push({
      label: String(cols[idx.label] || "").trim(),
      priority_score: Number(cols[idx.priority_score] || 0),
      recommended_action: String(cols[idx.recommended_action] || "").trim(),
      miss_count: Number(cols[idx.miss_count] || 0),
      false_positive_count: Number(cols[idx.false_positive_count] || 0)
    });
  }
  return rows.filter((row) => row.label);
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

function main() {
  const args = parseArgs(process.argv);
  const priorityPath = path.resolve(args.priorityCsv);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(priorityPath)) {
    throw new Error(`Priority CSV not found: ${priorityPath}`);
  }

  const priorityRows = readPriorityRows(priorityPath);
  const positives = priorityRows
    .filter((row) => row.recommended_action === "collect_more_positives")
    .sort((a, b) => b.priority_score - a.priority_score || b.miss_count - a.miss_count)
    .slice(0, args.positiveTop);

  const negatives = priorityRows
    .filter((row) => row.recommended_action === "add_hard_negatives")
    .sort((a, b) => b.priority_score - a.priority_score || b.false_positive_count - a.false_positive_count)
    .slice(0, args.negativeTop);

  const outRows = [];

  positives.forEach((row) => {
    const slug = slugify(row.label) || "label";
    for (let i = 1; i <= args.variants; i += 1) {
      outRows.push({
        name: `retrain_positive_${slug}_v${i}`,
        url: "",
        item_id: `retrain-${slug}-v${i}`,
        canonical_label: row.label,
        source: "retraining_queue",
        notes: `action=collect_more_positives; priority_score=${row.priority_score}; variant=${i}`
      });
    }
  });

  negatives.forEach((row) => {
    const slug = slugify(row.label) || "label";
    for (let i = 1; i <= args.variants; i += 1) {
      outRows.push({
        name: `retrain_negative_${slug}_v${i}`,
        url: "",
        item_id: `retrain-negative-${slug}-v${i}`,
        canonical_label: "",
        source: "retraining_queue_negative",
        notes: `target_false_positive_label=${row.label}; action=add_hard_negatives; priority_score=${row.priority_score}; variant=${i}`
      });
    }
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, toCsv(outRows), "utf8");

  console.log("Retraining queue generated");
  console.log(
    JSON.stringify(
      {
        input: path.relative(process.cwd(), priorityPath),
        output: path.relative(process.cwd(), outPath),
        positive_labels_selected: positives.length,
        negative_labels_selected: negatives.length,
        variants_per_label: args.variants,
        queue_rows: outRows.length
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
