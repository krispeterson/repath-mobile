#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/check-benchmark-coverage.js [--taxonomy assets/models/municipal-taxonomy-v1.json] [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--out test/benchmarks/benchmark-coverage-report.json]"
  );
}

function parseArgs(argv) {
  const args = {
    taxonomy: path.join("assets", "models", "municipal-taxonomy-v1.json"),
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    out: path.join("test", "benchmarks", "benchmark-coverage-report.json")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--taxonomy") {
      args.taxonomy = argv[++i];
    } else if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function toSet(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
}

function setDiff(left, right) {
  const out = [];
  left.forEach((value) => {
    if (!right.has(value)) out.push(value);
  });
  return out.sort((a, b) => a.localeCompare(b));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getManifestLabels(images, onlyReady) {
  const labels = new Set();
  images.forEach((entry) => {
    const isReady = String((entry && entry.status) || "").toLowerCase() === "ready";
    if (onlyReady && !isReady) {
      return;
    }
    (entry.expected_any || []).forEach((label) => {
      const value = String(label || "").trim();
      if (value) labels.add(value);
    });
    (entry.expected_all || []).forEach((label) => {
      const value = String(label || "").trim();
      if (value) labels.add(value);
    });
  });
  return labels;
}

function main() {
  const args = parseArgs(process.argv);
  const taxonomyPath = path.resolve(args.taxonomy);
  const manifestPath = path.resolve(args.manifest);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(taxonomyPath)) {
    throw new Error(`Taxonomy file not found: ${taxonomyPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const taxonomy = loadJson(taxonomyPath);
  const manifest = loadJson(manifestPath);

  const classes = Array.isArray(taxonomy.vision_classes) ? taxonomy.vision_classes : [];
  const images = Array.isArray(manifest.images) ? manifest.images : [];

  const taxonomyLabels = toSet(classes.map((record) => record.canonical_label));
  const manifestLabelsAll = getManifestLabels(images, false);
  const manifestLabelsReady = getManifestLabels(images, true);

  const missingInManifest = setDiff(taxonomyLabels, manifestLabelsAll);
  const missingInReadyOnly = setDiff(taxonomyLabels, manifestLabelsReady);
  const unknownManifestLabels = setDiff(manifestLabelsAll, taxonomyLabels);

  const totalEntries = images.length;
  const readyEntries = images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "ready").length;
  const todoEntries = images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "todo").length;
  const missingUrlEntries = images.filter((entry) => !String((entry && entry.url) || "").trim()).length;

  const coverage = {
    taxonomy_label_count: taxonomyLabels.size,
    manifest_label_count_all: manifestLabelsAll.size,
    manifest_label_count_ready: manifestLabelsReady.size,
    coverage_all: taxonomyLabels.size ? Number((manifestLabelsAll.size / taxonomyLabels.size).toFixed(4)) : 0,
    coverage_ready: taxonomyLabels.size ? Number((manifestLabelsReady.size / taxonomyLabels.size).toFixed(4)) : 0
  };

  const report = {
    generated_at: new Date().toISOString(),
    inputs: {
      taxonomy: path.relative(process.cwd(), taxonomyPath),
      manifest: path.relative(process.cwd(), manifestPath)
    },
    entries: {
      total: totalEntries,
      ready: readyEntries,
      todo: todoEntries,
      missing_url: missingUrlEntries
    },
    coverage,
    gaps: {
      taxonomy_labels_missing_in_manifest: missingInManifest,
      taxonomy_labels_missing_in_ready_entries: missingInReadyOnly,
      manifest_labels_not_in_taxonomy: unknownManifestLabels
    }
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Benchmark coverage summary");
  console.log(JSON.stringify({ entries: report.entries, coverage: report.coverage }, null, 2));
  console.log(`Missing labels in ready entries: ${missingInReadyOnly.length}`);
  console.log(`Unknown manifest labels: ${unknownManifestLabels.length}`);
  console.log(`Saved report to ${path.relative(process.cwd(), outPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
