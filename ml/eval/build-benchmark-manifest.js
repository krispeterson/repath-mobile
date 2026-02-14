#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/build-benchmark-manifest.js [--taxonomy assets/models/municipal-taxonomy-v1.json] [--seed test/benchmarks/benchmark-manifest.seed.json] [--out test/benchmarks/municipal-benchmark-manifest-v2.json]"
  );
}

function parseArgs(argv) {
  const args = {
    taxonomy: path.join("assets", "models", "municipal-taxonomy-v1.json"),
    seed: path.join("test", "benchmarks", "benchmark-manifest.seed.json"),
    out: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--taxonomy") {
      args.taxonomy = argv[++i];
    } else if (arg === "--seed") {
      args.seed = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function indexSeedByLabel(seedManifest) {
  const out = new Map();
  const images = Array.isArray(seedManifest && seedManifest.images) ? seedManifest.images : [];

  images.forEach((entry) => {
    const labels = [];
    (entry.expected_any || []).forEach((label) => labels.push(String(label || "").trim()));
    (entry.expected_all || []).forEach((label) => labels.push(String(label || "").trim()));

    labels.filter(Boolean).forEach((label) => {
      if (!out.has(label)) {
        out.set(label, []);
      }
      out.get(label).push(entry);
    });
  });

  return out;
}

function makePlaceholderEntry(record) {
  return {
    name: `todo_${slugify(record.canonical_label) || record.item_id}`,
    url: "",
    expected_any: [record.canonical_label],
    expected_all: [],
    item_id: record.item_id,
    required: true,
    status: "todo",
    notes: "Add at least one representative photo for this item variation."
  };
}

function makeNegativeEntry(name, notes) {
  return {
    name,
    url: "",
    expected_any: [],
    expected_all: [],
    required: true,
    status: "todo",
    notes
  };
}

function main() {
  const args = parseArgs(process.argv);
  const taxonomyPath = path.resolve(args.taxonomy);
  const seedPath = path.resolve(args.seed);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(taxonomyPath)) {
    throw new Error(`Taxonomy file not found: ${taxonomyPath}`);
  }
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed manifest not found: ${seedPath}`);
  }

  const taxonomy = loadJson(taxonomyPath);
  const seedManifest = loadJson(seedPath);

  const seedByLabel = indexSeedByLabel(seedManifest);
  const classes = Array.isArray(taxonomy.vision_classes) ? taxonomy.vision_classes : [];
  const images = [];

  classes.forEach((record) => {
    const label = String((record && record.canonical_label) || "").trim();
    const itemId = String((record && record.item_id) || "").trim();
    if (!label || !itemId) {
      return;
    }

    const seedEntries = seedByLabel.get(label) || [];
    if (seedEntries.length) {
      seedEntries.forEach((entry, index) => {
        images.push({
          name: index === 0 ? entry.name : `${entry.name}_${index + 1}`,
          url: entry.url || "",
          expected_any: Array.isArray(entry.expected_any) ? entry.expected_any : [label],
          expected_all: Array.isArray(entry.expected_all) ? entry.expected_all : [],
          item_id: itemId,
          required: true,
          status: entry.url ? "ready" : "todo",
          notes: entry.url ? "Seed image from v1 benchmark manifest." : "Missing URL in seed entry."
        });
      });
      return;
    }

    images.push(makePlaceholderEntry({ canonical_label: label, item_id: itemId }));
  });

  images.push(
    makeNegativeEntry("todo_negative_people_scene", "Add cluttered scenes that should produce no detections."),
    makeNegativeEntry("todo_negative_street_scene", "Add outdoor photos with no recyclable target item."),
    makeNegativeEntry("todo_negative_pet_or_toy_scene", "Add household objects likely to cause false positives.")
  );

  const output = {
    name: "municipal-full-taxonomy-v2",
    generated_at: new Date().toISOString(),
    source: {
      taxonomy: path.relative(process.cwd(), taxonomyPath),
      seed_manifest: path.relative(process.cwd(), seedPath)
    },
    images
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const readyCount = images.filter((entry) => entry.status === "ready").length;
  const todoCount = images.length - readyCount;
  console.log(`Generated benchmark manifest with ${images.length} entries (${readyCount} ready, ${todoCount} todo).`);
  console.log(`- ${path.relative(process.cwd(), outPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
