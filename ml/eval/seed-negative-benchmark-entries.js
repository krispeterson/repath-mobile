#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_QUERIES = [
  "forest trail",
  "mountain landscape",
  "city skyline",
  "street traffic",
  "living room interior",
  "kitchen interior",
  "office workspace",
  "dog park",
  "cat indoor",
  "soccer field",
  "playground",
  "beach coastline",
  "snowy road",
  "night city",
  "flowers garden",
  "river water",
  "airplane sky",
  "train station",
  "people crowd",
  "bird wildlife"
];

function usage() {
  console.log(
    "Usage: node ml/eval/seed-negative-benchmark-entries.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--count 20] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    count: 20,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") args.manifest = argv[++i];
    else if (arg === "--count") args.count = Number(argv[++i]);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.count) || args.count < 1) args.count = 20;
  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isNegative(entry) {
  const any = Array.isArray(entry && entry.expected_any) ? entry.expected_any : [];
  const all = Array.isArray(entry && entry.expected_all) ? entry.expected_all : [];
  return any.length === 0 && all.length === 0;
}

function toName(query, idx) {
  const base = String(query)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `todo_negative_${base}_${idx}`;
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);

  const manifest = loadJson(manifestPath);
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  const existingNames = new Set(images.map((e) => String((e && e.name) || "").trim()).filter(Boolean));
  const currentNegatives = images.filter(isNegative).length;
  const needed = Math.max(0, args.count - currentNegatives);

  const generated = [];
  for (let i = 0; i < DEFAULT_QUERIES.length && generated.length < needed; i += 1) {
    const query = DEFAULT_QUERIES[i];
    let idx = 1;
    let name = toName(query, idx);
    while (existingNames.has(name)) {
      idx += 1;
      name = toName(query, idx);
    }
    existingNames.add(name);
    generated.push({
      name,
      url: "",
      expected_any: [],
      expected_all: [],
      required: false,
      status: "todo",
      notes: `Negative benchmark seed. query_hint=${query}`
    });
  }

  if (!args.dryRun && generated.length) {
    manifest.images = images.concat(generated);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  console.log("Negative benchmark seed summary");
  console.log(
    JSON.stringify(
      {
        current_negative_entries: currentNegatives,
        target_negative_entries: args.count,
        generated_entries: generated.length,
        dry_run: args.dryRun,
        manifest: path.relative(process.cwd(), manifestPath)
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
