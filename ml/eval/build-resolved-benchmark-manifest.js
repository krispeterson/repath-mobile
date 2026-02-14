#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { fileURLToPath } = require("url");

function usage() {
  console.log(
    "Usage: node ml/eval/build-resolved-benchmark-manifest.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--completed test/benchmarks/benchmark-labeled.csv] [--cache-dir test/benchmarks/images] [--out test/benchmarks/municipal-benchmark-manifest.resolved.json]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    completed: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    cacheDir: path.join("test", "benchmarks", "images"),
    out: path.join("test", "benchmarks", "municipal-benchmark-manifest.resolved.json"),
    download: true,
    copyLocal: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--completed") {
      args.completed = argv[++i];
    } else if (arg === "--cache-dir") {
      args.cacheDir = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--no-download") {
      args.download = false;
    } else if (arg === "--no-copy-local") {
      args.copyLocal = false;
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

function loadCompletedMap(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return new Map();
  const start = 1;
  const map = new Map();
  for (let i = start; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const name = String(cols[0] || "").trim();
    const url = String(cols[1] || "").trim();
    if (name && url) map.set(name, url);
  }
  return map;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function isFileUrl(value) {
  return /^file:\/\//i.test(String(value || ""));
}

function sanitizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function extensionFromUrl(value) {
  const match = String(value || "").match(/\.([a-zA-Z0-9]{2,6})(?:[?#].*)?$/);
  if (!match) return ".jpg";
  return `.${match[1].toLowerCase()}`;
}

function copyLocalToCache(localPath, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.copyFileSync(localPath, outFile);
}

function downloadToCache(url, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  execFileSync("curl", ["-L", "--retry", "3", "--retry-all-errors", "--connect-timeout", "20", url, "-o", outFile, "-sS"], {
    stdio: "pipe"
  });
}

function buildCachePath(cacheDir, imageName, sourceUrl) {
  const base = sanitizeName(imageName) || "sample";
  const ext = extensionFromUrl(sourceUrl);
  return path.join(cacheDir, `${base}${ext}`);
}

function resolveLocalPath(rawUrl) {
  if (isFileUrl(rawUrl)) {
    try {
      return fileURLToPath(rawUrl);
    } catch (error) {
      return null;
    }
  }
  const localPath = String(rawUrl || "").trim();
  if (!localPath) return null;
  if (isHttpUrl(localPath)) return null;
  return localPath;
}

function toRepoRelative(targetPath) {
  return path.relative(process.cwd(), targetPath).split(path.sep).join("/");
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const completedPath = path.resolve(args.completed);
  const cacheDir = path.resolve(args.cacheDir);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = loadJson(manifestPath);
  const completedMap = loadCompletedMap(completedPath);
  const images = Array.isArray(manifest.images) ? manifest.images : [];

  const updated = [];
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let downloadedCount = 0;
  let copiedCount = 0;

  images.forEach((entry) => {
    const next = { ...entry };
    const name = String(next.name || "").trim();
    const override = completedMap.get(name);
    const sourceUrl = String(override || next.url || "").trim();

    next.source_url = sourceUrl || null;

    if (!sourceUrl) {
      next.url = "";
      next.status = "todo";
      unresolvedCount += 1;
      updated.push(next);
      return;
    }

    if (isHttpUrl(sourceUrl)) {
      const outFile = buildCachePath(cacheDir, name, sourceUrl);
      if (!fs.existsSync(outFile)) {
        if (args.download) {
          try {
            downloadToCache(sourceUrl, outFile);
            downloadedCount += 1;
          } catch (error) {
            next.url = "";
            next.status = "todo";
            next.resolve_error = `download_failed: ${error.message}`;
            unresolvedCount += 1;
            updated.push(next);
            return;
          }
        } else {
          next.url = "";
          next.status = "todo";
          next.resolve_error = "download_disabled";
          unresolvedCount += 1;
          updated.push(next);
          return;
        }
      }

      next.url = toRepoRelative(outFile);
      next.status = "ready";
      resolvedCount += 1;
      updated.push(next);
      return;
    }

    const localPath = resolveLocalPath(sourceUrl);
    if (!localPath || !fs.existsSync(localPath)) {
      next.url = "";
      next.status = "todo";
      next.resolve_error = "local_not_found";
      unresolvedCount += 1;
      updated.push(next);
      return;
    }

    if (args.copyLocal) {
      const outFile = buildCachePath(cacheDir, name, localPath);
      if (!fs.existsSync(outFile)) {
        copyLocalToCache(localPath, outFile);
        copiedCount += 1;
      }
      next.url = toRepoRelative(outFile);
    } else {
      next.url = toRepoRelative(path.resolve(localPath));
    }

    next.status = "ready";
    resolvedCount += 1;
    updated.push(next);
  });

  const output = {
    ...manifest,
    generated_at: new Date().toISOString(),
    source: {
      manifest: path.relative(process.cwd(), manifestPath),
      completed: fs.existsSync(completedPath) ? path.relative(process.cwd(), completedPath) : null,
      cache_dir: path.relative(process.cwd(), cacheDir)
    },
    images: updated
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log("Resolved benchmark manifest generated");
  console.log(
    JSON.stringify(
      {
        resolved: resolvedCount,
        unresolved: unresolvedCount,
        downloaded: downloadedCount,
        copied_local: copiedCount,
        output: path.relative(process.cwd(), outPath)
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
