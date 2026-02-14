#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/data/bootstrap-kaggle-dataset.js [--source /path/to/kaggle/images/images] [--target ml/artifacts/datasets/kaggle-household-waste/images/images] [--mode symlink|copy] [--force]"
  );
}

function parseArgs(argv) {
  const args = {
    source: process.env.KAGGLE_WASTE_DIR || "",
    target: path.join("ml", "artifacts", "datasets", "kaggle-household-waste", "images", "images"),
    mode: "symlink",
    force: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      args.source = String(argv[++i] || "");
    } else if (arg === "--target") {
      args.target = String(argv[++i] || "");
    } else if (arg === "--mode") {
      args.mode = String(argv[++i] || "").toLowerCase();
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!["symlink", "copy"].includes(args.mode)) {
    throw new Error("--mode must be one of: symlink, copy");
  }

  return args;
}

function resolveSourcePath(inputSource) {
  if (inputSource) {
    return path.resolve(inputSource);
  }

  const candidates = [
    path.join("..", "Kaggle Household Waste Images", "images", "images"),
    path.join("Kaggle Household Waste Images", "images", "images")
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = path.resolve(candidates[i]);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

function validateSource(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(
      "Kaggle source directory not found. Pass --source or set KAGGLE_WASTE_DIR."
    );
  }

  const stat = fs.statSync(sourcePath);
  if (!stat.isDirectory()) {
    throw new Error(`Kaggle source must be a directory: ${sourcePath}`);
  }

  const entries = fs.readdirSync(sourcePath);
  const subdirCount = entries.filter((entry) => {
    try {
      return fs.statSync(path.join(sourcePath, entry)).isDirectory();
    } catch (error) {
      return false;
    }
  }).length;

  if (!subdirCount) {
    throw new Error(
      `Kaggle source appears empty or unexpected (no class subfolders): ${sourcePath}`
    );
  }
}

function ensureCleanTarget(targetPath, force) {
  if (!fs.existsSync(targetPath)) return;

  const stat = fs.lstatSync(targetPath);
  if (!force) {
    throw new Error(`Target already exists: ${targetPath}. Re-run with --force to replace it.`);
  }

  if (stat.isSymbolicLink() || stat.isFile()) {
    fs.unlinkSync(targetPath);
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyRecursive(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

function linkDataset(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (process.platform === "win32") {
    fs.symlinkSync(sourcePath, targetPath, "junction");
    return;
  }

  fs.symlinkSync(sourcePath, targetPath, "dir");
}

function isPathInsideRepo(repoRoot, targetPath) {
  const rel = path.relative(repoRoot, targetPath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = process.cwd();
  const sourcePath = resolveSourcePath(args.source);
  const targetPath = path.resolve(args.target);

  validateSource(sourcePath);

  if (!isPathInsideRepo(repoRoot, targetPath)) {
    throw new Error(`Target must be inside repo: ${targetPath}`);
  }

  ensureCleanTarget(targetPath, args.force);

  if (args.mode === "copy") {
    copyRecursive(sourcePath, targetPath);
  } else {
    linkDataset(sourcePath, targetPath);
  }

  const relativeTarget = path.relative(repoRoot, targetPath).split(path.sep).join("/");
  console.log("Kaggle dataset bootstrap complete");
  console.log(
    JSON.stringify(
      {
        mode: args.mode,
        source: sourcePath,
        target: relativeTarget,
        reminder: "You can now run `npm run ml:labeling:ingest` without passing --kaggle-dir."
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
