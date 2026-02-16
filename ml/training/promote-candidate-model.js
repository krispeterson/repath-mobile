#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/training/promote-candidate-model.js [--candidate-dir ml/artifacts/models/candidates/<run-id>] [--candidate-id <run-id>] [--from-analysis test/benchmarks/latest-results.candidate.analysis.json] [--candidates-root ml/artifacts/models/candidates] [--assets-dir assets/models] [--prefix yolov8] [--write-metadata] [--metadata-path ml/artifacts/models/active-model.json] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    candidateDir: "",
    candidateId: "",
    fromAnalysis: "",
    candidatesRoot: path.join("ml", "artifacts", "models", "candidates"),
    assetsDir: path.join("assets", "models"),
    prefix: "yolov8",
    writeMetadata: false,
    metadataPath: path.join("ml", "artifacts", "models", "active-model.json"),
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--candidate-dir") {
      args.candidateDir = argv[++i];
    } else if (arg === "--candidate-id") {
      args.candidateId = argv[++i];
    } else if (arg === "--from-analysis") {
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        args.fromAnalysis = argv[++i];
      } else {
        args.fromAnalysis = path.join("test", "benchmarks", "latest-results.candidate.analysis.json");
      }
    } else if (arg === "--candidates-root") {
      args.candidatesRoot = argv[++i];
    } else if (arg === "--assets-dir") {
      args.assetsDir = argv[++i];
    } else if (arg === "--prefix") {
      args.prefix = argv[++i];
    } else if (arg === "--write-metadata") {
      args.writeMetadata = true;
    } else if (arg === "--metadata-path") {
      args.metadataPath = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }

  return args;
}

function resolveLatestCandidateDir(rootDir) {
  const fullRoot = path.resolve(rootDir);
  if (!fs.existsSync(fullRoot)) return null;
  const dirs = fs
    .readdirSync(fullRoot)
    .map((name) => path.join(fullRoot, name))
    .filter((entry) => {
      try {
        return fs.statSync(entry).isDirectory();
      } catch (_error) {
        return false;
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs.length ? dirs[0] : null;
}

function resolveCandidateFromAnalysis(analysisPath) {
  const fullPath = path.resolve(analysisPath);
  if (!fs.existsSync(fullPath)) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse analysis file: ${fullPath} (${error.message})`);
  }

  const modelRef =
    parsed &&
    parsed.summary &&
    typeof parsed.summary.model === "string"
      ? parsed.summary.model
      : "";
  if (typeof modelRef !== "string" || !modelRef.endsWith(".tflite")) return null;
  const modelPath = path.resolve(modelRef);
  return path.dirname(modelPath);
}

function rel(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function copyFileIfExists(src, dst, dryRun) {
  if (!fs.existsSync(src)) {
    throw new Error(`Required file not found: ${src}`);
  }
  if (dryRun) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function fileSizeIfExists(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_error) {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv);
  const candidatesRoot = path.resolve(args.candidatesRoot);

  let candidateDir = "";
  if (args.candidateDir) {
    candidateDir = path.resolve(args.candidateDir);
  } else if (args.candidateId) {
    candidateDir = path.join(candidatesRoot, args.candidateId);
  } else if (args.fromAnalysis) {
    candidateDir = resolveCandidateFromAnalysis(args.fromAnalysis) || "";
  } else {
    candidateDir =
      resolveCandidateFromAnalysis(path.join("test", "benchmarks", "latest-results.candidate.analysis.json")) ||
      resolveLatestCandidateDir(candidatesRoot) ||
      "";
  }

  if (!candidateDir || !fs.existsSync(candidateDir)) {
    throw new Error("Candidate directory not found. Provide --candidate-dir or create candidate artifacts first.");
  }

  const modelSrc = path.join(candidateDir, "yolov8.tflite");
  const labelsSrc = path.join(candidateDir, "yolov8.labels.json");

  const assetsDir = path.resolve(args.assetsDir);
  const modelDst = path.join(assetsDir, `${args.prefix}.tflite`);
  const labelsDst = path.join(assetsDir, `${args.prefix}.labels.json`);

  copyFileIfExists(modelSrc, modelDst, args.dryRun);
  copyFileIfExists(labelsSrc, labelsDst, args.dryRun);

  const metadata = {
    promoted_at: new Date().toISOString(),
    candidate_dir: rel(candidateDir),
    model_source: rel(modelSrc),
    labels_source: rel(labelsSrc),
    model_target: rel(modelDst),
    labels_target: rel(labelsDst),
    model_bytes: fileSizeIfExists(modelSrc),
    labels_bytes: fileSizeIfExists(labelsSrc),
  };

  if (args.writeMetadata) {
    const metadataPath = path.resolve(args.metadataPath);
    if (!args.dryRun) {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    }
    metadata.metadata_path = rel(metadataPath);
  }

  console.log("Candidate promotion summary");
  console.log(JSON.stringify({ ...metadata, dry_run: args.dryRun }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
