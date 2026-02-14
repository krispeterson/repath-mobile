#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/audit-benchmark-dataset.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--taxonomy assets/models/municipal-taxonomy-v1.json] [--out test/benchmarks/benchmark-dataset-audit.json]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    taxonomy: path.join("assets", "models", "municipal-taxonomy-v1.json"),
    out: path.join("test", "benchmarks", "benchmark-dataset-audit.json")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--taxonomy") {
      args.taxonomy = argv[++i];
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

function unique(values) {
  return Array.from(new Set(values));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function buildTaxonomyIndex(taxonomy) {
  const classes = Array.isArray(taxonomy && taxonomy.vision_classes) ? taxonomy.vision_classes : [];
  const byLabel = new Map();
  classes.forEach((row) => {
    const label = String((row && row.canonical_label) || "").trim();
    if (label) byLabel.set(label, row);
  });
  return byLabel;
}

function labelForEntry(entry) {
  const expectedAny = Array.isArray(entry && entry.expected_any) ? entry.expected_any : [];
  if (expectedAny.length) return String(expectedAny[0] || "").trim();
  const expectedAll = Array.isArray(entry && entry.expected_all) ? entry.expected_all : [];
  if (expectedAll.length) return String(expectedAll[0] || "").trim();
  return "";
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function toSortedEntries(mapObj) {
  return Object.keys(mapObj)
    .sort((a, b) => mapObj[b] - mapObj[a] || a.localeCompare(b))
    .map((key) => ({ key, count: mapObj[key] }));
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const taxonomyPath = path.resolve(args.taxonomy);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }
  if (!fs.existsSync(taxonomyPath)) {
    throw new Error(`Taxonomy file not found: ${taxonomyPath}`);
  }

  const manifest = loadJson(manifestPath);
  const taxonomy = loadJson(taxonomyPath);

  const images = Array.isArray(manifest && manifest.images) ? manifest.images : [];
  const taxonomyByLabel = buildTaxonomyIndex(taxonomy);

  const readyEntries = images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "ready");
  const todoEntries = images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "todo");
  const negativeEntries = images.filter((entry) => {
    const labels = Array.isArray(entry && entry.expected_any) ? entry.expected_any : [];
    const labelsAll = Array.isArray(entry && entry.expected_all) ? entry.expected_all : [];
    return labels.length === 0 && labelsAll.length === 0;
  });

  const duplicateNameMap = {};
  const duplicateUrlMap = {};
  const seenNames = {};
  const seenUrls = {};

  images.forEach((entry) => {
    const name = String((entry && entry.name) || "").trim();
    const url = String((entry && entry.url) || "").trim();
    if (name) {
      seenNames[name] = (seenNames[name] || 0) + 1;
    }
    if (url) {
      seenUrls[url] = (seenUrls[url] || 0) + 1;
    }
  });

  Object.keys(seenNames).forEach((name) => {
    if (seenNames[name] > 1) duplicateNameMap[name] = seenNames[name];
  });
  Object.keys(seenUrls).forEach((url) => {
    if (seenUrls[url] > 1) duplicateUrlMap[url] = seenUrls[url];
  });

  const missingUrlReady = readyEntries.filter((entry) => !String((entry && entry.url) || "").trim());
  const missingUrlTotal = images.filter((entry) => !String((entry && entry.url) || "").trim());

  const classCountsReady = {};
  const classCountsTotal = {};
  const outcomeCountsReady = {};
  const outcomeCountsTotal = {};
  const unknownLabels = [];

  images.forEach((entry) => {
    const label = labelForEntry(entry);
    if (!label) return;

    increment(classCountsTotal, label);
    const row = taxonomyByLabel.get(label);
    if (row) {
      const primaryOutcome = String((row && row.primary_outcome) || "").trim();
      if (primaryOutcome) increment(outcomeCountsTotal, primaryOutcome);
    } else {
      unknownLabels.push(label);
    }

    const isReady = String((entry && entry.status) || "").toLowerCase() === "ready";
    if (isReady) {
      increment(classCountsReady, label);
      if (row) {
        const primaryOutcome = String((row && row.primary_outcome) || "").trim();
        if (primaryOutcome) increment(outcomeCountsReady, primaryOutcome);
      }
    }
  });

  const readyCountValues = Object.keys(classCountsReady).map((key) => classCountsReady[key]);
  const totalCountValues = Object.keys(classCountsTotal).map((key) => classCountsTotal[key]);

  const balance = {
    ready: {
      class_count: readyCountValues.length,
      min_samples_per_class: readyCountValues.length ? Math.min.apply(null, readyCountValues) : 0,
      median_samples_per_class: median(readyCountValues),
      max_samples_per_class: readyCountValues.length ? Math.max.apply(null, readyCountValues) : 0
    },
    total: {
      class_count: totalCountValues.length,
      min_samples_per_class: totalCountValues.length ? Math.min.apply(null, totalCountValues) : 0,
      median_samples_per_class: median(totalCountValues),
      max_samples_per_class: totalCountValues.length ? Math.max.apply(null, totalCountValues) : 0
    }
  };

  const recommendations = [];
  if (readyEntries.length < 100) {
    recommendations.push("Increase ready image count to at least 100 before first training round.");
  }
  if (balance.ready.median_samples_per_class < 3) {
    recommendations.push("Raise median ready samples per class to >=3 to reduce collapse on rare labels.");
  }
  if (missingUrlReady.length > 0) {
    recommendations.push("Fix ready entries with empty URLs before training/evaluation.");
  }
  if (negativeEntries.length < 20) {
    recommendations.push("Add more negative/no-target images to control false positives.");
  }
  if (Object.keys(duplicateUrlMap).length > 0) {
    recommendations.push("De-duplicate repeated image URLs to reduce overfitting to identical scenes.");
  }

  const report = {
    generated_at: new Date().toISOString(),
    inputs: {
      manifest: path.relative(process.cwd(), manifestPath),
      taxonomy: path.relative(process.cwd(), taxonomyPath)
    },
    counts: {
      total_entries: images.length,
      ready_entries: readyEntries.length,
      todo_entries: todoEntries.length,
      negative_entries: negativeEntries.length,
      missing_url_total: missingUrlTotal.length,
      missing_url_ready: missingUrlReady.length
    },
    quality_checks: {
      duplicate_name_count: Object.keys(duplicateNameMap).length,
      duplicate_url_count: Object.keys(duplicateUrlMap).length,
      unknown_label_count: unique(unknownLabels).length
    },
    class_balance: balance,
    distributions: {
      ready_outcomes: toSortedEntries(outcomeCountsReady),
      total_outcomes: toSortedEntries(outcomeCountsTotal),
      ready_classes_top25: toSortedEntries(classCountsReady).slice(0, 25),
      total_classes_top25: toSortedEntries(classCountsTotal).slice(0, 25)
    },
    duplicates: {
      names: duplicateNameMap,
      urls: duplicateUrlMap
    },
    unknown_labels: unique(unknownLabels).sort((a, b) => a.localeCompare(b)),
    recommendations
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Benchmark dataset audit summary");
  console.log(
    JSON.stringify(
      {
        counts: report.counts,
        class_balance: report.class_balance,
        quality_checks: report.quality_checks,
        recommendations: report.recommendations
      },
      null,
      2
    )
  );
  console.log(`Saved report to ${path.relative(process.cwd(), outPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
