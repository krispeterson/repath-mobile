#!/usr/bin/env node
const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const args = {
    skipKaggle: false,
    skipOnline: false,
    skipBenchmark: false,
    strictNetwork: false,
    onlineLimit: 40,
    kaggleDir: process.env.KAGGLE_WASTE_DIR || ""
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skip-kaggle") {
      args.skipKaggle = true;
    } else if (arg === "--skip-online") {
      args.skipOnline = true;
    } else if (arg === "--skip-benchmark") {
      args.skipBenchmark = true;
    } else if (arg === "--strict-network") {
      args.strictNetwork = true;
    } else if (arg === "--online-limit") {
      args.onlineLimit = Number(argv[++i]);
    } else if (arg === "--kaggle-dir") {
      args.kaggleDir = String(argv[++i] || "");
    }
  }

  if (!Number.isFinite(args.onlineLimit) || args.onlineLimit < 1) {
    args.onlineLimit = 40;
  }

  return args;
}

function runStep(label, cmd, argv, opts = {}) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(cmd, argv, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env
  });
  if (result.status !== 0) {
    if (opts.allowFailure) {
      console.warn(`${label} failed with exit code ${result.status}; continuing.`);
      return;
    }
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.skipKaggle) {
    const kaggleArgs = ["ml/data/suggest-benchmark-from-kaggle.js", "--merge-into", "test/benchmarks/benchmark-labeled.csv"];
    if (args.kaggleDir) {
      kaggleArgs.push("--kaggle-dir", args.kaggleDir);
    }
    runStep("Suggest Kaggle", "node", kaggleArgs, { allowFailure: !args.strictNetwork });
  }

  if (!args.skipOnline) {
    runStep("Suggest Online", "node", [
      "ml/data/suggest-benchmark-online.js",
      "--merge-into",
      "test/benchmarks/benchmark-labeled.csv",
      "--limit",
      String(args.onlineLimit)
    ], { allowFailure: !args.strictNetwork });
  }

  runStep("Normalize URLs", "node", ["ml/data/normalize-benchmark-labeled-urls.js"]);
  runStep("Sync Progress", "node", ["ml/eval/sync-benchmark-progress.js", "--completed", "test/benchmarks/benchmark-labeled.csv"]);
  runStep("Build Resolved Manifest", "node", ["ml/eval/build-resolved-benchmark-manifest.js"]);
  runStep("Coverage (Canonical)", "node", ["ml/eval/check-benchmark-coverage.js"]);
  runStep("Coverage (Resolved)", "node", [
    "ml/eval/check-benchmark-coverage.js",
    "--manifest",
    "test/benchmarks/municipal-benchmark-manifest.resolved.json",
    "--out",
    "test/benchmarks/benchmark-coverage-report.resolved.json"
  ]);
  runStep("Audit (Resolved)", "node", [
    "ml/eval/audit-benchmark-dataset.js",
    "--manifest",
    "test/benchmarks/municipal-benchmark-manifest.resolved.json",
    "--out",
    "test/benchmarks/benchmark-dataset-audit.resolved.json"
  ]);

  if (!args.skipBenchmark) {
    runStep("Benchmark (Resolved)", "node", ["scripts/run-python.js", "../repath-model/scripts/benchmark_model.py", "--manifest", "test/benchmarks/municipal-benchmark-manifest.resolved.json", "--out", "/tmp/repath-benchmark-resolved-results.json"]);
  }

  console.log("\nPipeline complete.");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
