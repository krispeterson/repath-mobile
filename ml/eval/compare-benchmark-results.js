#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/eval/compare-benchmark-results.js [--baseline test/benchmarks/latest-results.json] [--candidate test/benchmarks/latest-results.candidate.json] [--out test/benchmarks/latest-results.compare.json]"
  );
}

function parseArgs(argv) {
  const args = {
    baseline: path.join("test", "benchmarks", "latest-results.json"),
    candidate: path.join("test", "benchmarks", "latest-results.candidate.json"),
    out: path.join("test", "benchmarks", "latest-results.compare.json")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--baseline") {
      args.baseline = argv[++i];
    } else if (arg === "--candidate") {
      args.candidate = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function delta(a, b) {
  if (a == null || b == null) return null;
  return Number((b - a).toFixed(4));
}

function main() {
  const args = parseArgs(process.argv);
  const baselinePath = path.resolve(args.baseline);
  const candidatePath = path.resolve(args.candidate);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline results not found: ${baselinePath}`);
  }
  if (!fs.existsSync(candidatePath)) {
    throw new Error(`Candidate results not found: ${candidatePath}`);
  }

  const baseline = loadJson(baselinePath);
  const candidate = loadJson(candidatePath);
  const bs = baseline.summary || {};
  const cs = candidate.summary || {};

  const fields = [
    "images_evaluated",
    "micro_precision",
    "micro_recall",
    "any_hit_rate",
    "negative_clean_rate",
    "tp",
    "fp",
    "fn",
    "skipped_unsupported_entries"
  ];

  const comparison = {};
  fields.forEach((field) => {
    const before = toNumber(bs[field]);
    const after = toNumber(cs[field]);
    comparison[field] = {
      baseline: before,
      candidate: after,
      delta: delta(before, after)
    };
  });

  const out = {
    generated_at: new Date().toISOString(),
    baseline: path.relative(process.cwd(), baselinePath),
    candidate: path.relative(process.cwd(), candidatePath),
    comparison
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log("Benchmark comparison generated");
  console.log(
    JSON.stringify(
      {
        baseline: out.baseline,
        candidate: out.candidate,
        output: path.relative(process.cwd(), outPath),
        metrics: comparison
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
