#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function usage() {
  console.log(
    "Usage: node ml/eval/benchmark-candidate-model.js [--candidate-dir ml/artifacts/models/candidates/<run-id>] [--candidates-root ml/artifacts/models/candidates] [--manifest test/benchmarks/municipal-benchmark-manifest.resolved.json] [--out test/benchmarks/latest-results.candidate.json] [--supported-only]"
  );
}

function parseArgs(argv) {
  const args = {
    candidateDir: "",
    candidatesRoot: path.join("ml", "artifacts", "models", "candidates"),
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest.resolved.json"),
    out: path.join("test", "benchmarks", "latest-results.candidate.json"),
    supportedOnly: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--candidate-dir") {
      args.candidateDir = argv[++i];
    } else if (arg === "--candidates-root") {
      args.candidatesRoot = argv[++i];
    } else if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--supported-only") {
      args.supportedOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function resolveLatestCandidateDir(rootDir) {
  if (!fs.existsSync(rootDir)) return null;
  const names = fs.readdirSync(rootDir);
  const dirs = names
    .map((name) => path.join(rootDir, name))
    .filter((fullPath) => {
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch (_error) {
        return false;
      }
    })
    .sort((a, b) => {
      const aTime = fs.statSync(a).mtimeMs;
      const bTime = fs.statSync(b).mtimeMs;
      return bTime - aTime;
    });

  return dirs.length ? dirs[0] : null;
}

function runStep(label, cmd, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: process.cwd(), env: process.env });
  if (result.status !== 0) {
    throw new Error(`${label} failed`);
  }
}

function resolveCandidateArtifact(candidateDir, names) {
  for (const name of names) {
    const fullPath = path.join(candidateDir, name);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return "";
}

function main() {
  const args = parseArgs(process.argv);
  const candidateDir = args.candidateDir
    ? path.resolve(args.candidateDir)
    : resolveLatestCandidateDir(path.resolve(args.candidatesRoot));

  if (!candidateDir || !fs.existsSync(candidateDir)) {
    throw new Error("Candidate directory not found. Run export candidate model first.");
  }

  const modelPath = resolveCandidateArtifact(candidateDir, ["yolo-repath.tflite", "yolov8.tflite"]);
  const labelsPath = resolveCandidateArtifact(candidateDir, ["yolo-repath.labels.json", "yolov8.labels.json"]);
  const outPath = path.resolve(args.out);
  const analysisOut = outPath.replace(/\.json$/i, ".analysis.json");
  const priorityCsvOut = outPath.replace(/\.json$/i, ".priority.csv");

  if (!modelPath) {
    throw new Error(`Candidate model not found in ${candidateDir} (expected yolo-repath.tflite or yolov8.tflite).`);
  }
  if (!labelsPath) {
    throw new Error(
      `Candidate labels not found in ${candidateDir} (expected yolo-repath.labels.json or yolov8.labels.json).`
    );
  }

  const benchmarkArgs = [
    "scripts/run-python.js",
    "ml/eval/benchmark-model.py",
    "--manifest",
    args.manifest,
    "--model",
    path.relative(process.cwd(), modelPath),
    "--labels",
    path.relative(process.cwd(), labelsPath),
    "--out",
    path.relative(process.cwd(), outPath)
  ];
  if (args.supportedOnly) {
    benchmarkArgs.push("--supported-only");
  }

  runStep("Benchmark Candidate", "node", benchmarkArgs);
  runStep("Analyze Candidate Results", "node", [
    "ml/eval/analyze-benchmark-results.js",
    "--input",
    path.relative(process.cwd(), outPath),
    "--out",
    path.relative(process.cwd(), analysisOut),
    "--template-out",
    path.relative(process.cwd(), priorityCsvOut)
  ]);

  console.log("\nCandidate benchmark complete");
  console.log(
    JSON.stringify(
      {
        candidate_dir: path.relative(process.cwd(), candidateDir),
        model: path.relative(process.cwd(), modelPath),
        labels: path.relative(process.cwd(), labelsPath),
        results: path.relative(process.cwd(), outPath),
        analysis: path.relative(process.cwd(), analysisOut),
        priority_csv: path.relative(process.cwd(), priorityCsvOut),
        supported_only: args.supportedOnly
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
