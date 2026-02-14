#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/eval/analyze-benchmark-results.js [--input test/benchmarks/latest-results.json] [--out test/benchmarks/benchmark-error-analysis.json] [--template-out test/benchmarks/benchmark-retraining-priority.csv] [--top 25]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "latest-results.json"),
    out: path.join("test", "benchmarks", "benchmark-error-analysis.json"),
    templateOut: path.join("test", "benchmarks", "benchmark-retraining-priority.csv"),
    top: 25
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--template-out") {
      args.templateOut = argv[++i];
    } else if (arg === "--top") {
      args.top = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.top) || args.top < 1) {
    args.top = 25;
  }

  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  const header = [
    "rank",
    "label",
    "priority_score",
    "expected_count",
    "miss_count",
    "hit_count",
    "false_positive_count",
    "hit_rate",
    "recommended_action",
    "notes"
  ];

  const lines = [header.join(",")];
  rows.forEach((row, idx) => {
    lines.push(
      [
        idx + 1,
        quoteCsv(row.label),
        row.priority_score,
        row.expected_count,
        row.miss_count,
        row.hit_count,
        row.false_positive_count,
        row.hit_rate,
        quoteCsv(row.recommended_action),
        quoteCsv("")
      ].join(",")
    );
  });
  return `${lines.join("\n")}\n`;
}

function sortedEntries(counterMap) {
  return Array.from(counterMap.entries()).sort((a, b) => b[1] - a[1]);
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);
  const templatePath = path.resolve(args.templateOut);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input results file not found: ${inputPath}`);
  }

  const payload = loadJson(inputPath);
  const results = Array.isArray(payload.results) ? payload.results : [];

  const expectedCount = new Map();
  const hitCount = new Map();
  const missCount = new Map();
  const fpCount = new Map();
  const pairFp = new Map();

  results.forEach((row) => {
    const expected = new Set((row.expected_any || []).map((v) => String(v || "").trim()).filter(Boolean));
    const predicted = new Set((row.predicted_labels || []).map((v) => String(v || "").trim()).filter(Boolean));

    expected.forEach((label) => {
      expectedCount.set(label, (expectedCount.get(label) || 0) + 1);
      if (predicted.has(label)) {
        hitCount.set(label, (hitCount.get(label) || 0) + 1);
      } else {
        missCount.set(label, (missCount.get(label) || 0) + 1);
      }
    });

    predicted.forEach((predLabel) => {
      if (expected.has(predLabel)) return;
      fpCount.set(predLabel, (fpCount.get(predLabel) || 0) + 1);
      expected.forEach((expLabel) => {
        const key = `${expLabel} -> ${predLabel}`;
        pairFp.set(key, (pairFp.get(key) || 0) + 1);
      });
    });
  });

  const labels = new Set([...expectedCount.keys(), ...fpCount.keys()]);
  const rows = Array.from(labels).map((label) => {
    const expected = expectedCount.get(label) || 0;
    const miss = missCount.get(label) || 0;
    const hit = hitCount.get(label) || 0;
    const fp = fpCount.get(label) || 0;
    const hitRate = expected > 0 ? hit / expected : 0;
    const priority = miss * 2 + fp + (expected > 0 ? (1 - hitRate) * expected : 0);
    const action = miss >= fp ? "collect_more_positives" : "add_hard_negatives";
    return {
      label,
      priority_score: Number(priority.toFixed(2)),
      expected_count: expected,
      miss_count: miss,
      hit_count: hit,
      false_positive_count: fp,
      hit_rate: Number(hitRate.toFixed(4)),
      recommended_action: action
    };
  });

  rows.sort((a, b) => b.priority_score - a.priority_score || b.miss_count - a.miss_count || b.false_positive_count - a.false_positive_count);
  const topRows = rows.slice(0, args.top);

  const out = {
    source: path.relative(process.cwd(), inputPath),
    generated_at: new Date().toISOString(),
    summary: payload.summary || {},
    counts: {
      result_rows: results.length,
      expected_labels: expectedCount.size,
      false_positive_labels: fpCount.size
    },
    top_missed_labels: sortedEntries(missCount).slice(0, args.top).map(([label, count]) => ({ label, count })),
    top_false_positive_labels: sortedEntries(fpCount).slice(0, args.top).map(([label, count]) => ({ label, count })),
    top_confusion_pairs: sortedEntries(pairFp).slice(0, args.top).map(([pair, count]) => ({ pair, count })),
    priority_table: topRows
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  fs.writeFileSync(templatePath, toCsv(topRows), "utf8");

  console.log("Benchmark error analysis generated");
  console.log(
    JSON.stringify(
      {
        input: path.relative(process.cwd(), inputPath),
        output: path.relative(process.cwd(), outPath),
        template_output: path.relative(process.cwd(), templatePath),
        rows_analyzed: results.length,
        priority_rows: topRows.length
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
