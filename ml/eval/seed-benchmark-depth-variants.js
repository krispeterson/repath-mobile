#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/eval/seed-benchmark-depth-variants.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--target-ready 3] [--max-new 200] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    targetReady: 3,
    maxNew: 200,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--target-ready") {
      args.targetReady = Number(argv[++i]);
    } else if (arg === "--max-new") {
      args.maxNew = Number(argv[++i]);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.targetReady) || args.targetReady < 2) {
    args.targetReady = 3;
  }
  if (!Number.isFinite(args.maxNew) || args.maxNew < 1) {
    args.maxNew = 200;
  }

  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function firstLabel(entry) {
  const any = Array.isArray(entry && entry.expected_any) ? entry.expected_any : [];
  if (any.length) return String(any[0] || "").trim();
  const all = Array.isArray(entry && entry.expected_all) ? entry.expected_all : [];
  if (all.length) return String(all[0] || "").trim();
  return "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const manifest = loadJson(manifestPath);
  const images = Array.isArray(manifest.images) ? manifest.images : [];

  const readyCounts = {};
  const todoCounts = {};
  const labels = new Set();
  const itemIdByLabel = new Map();
  const existingNames = new Set();

  images.forEach((entry) => {
    const label = firstLabel(entry);
    const name = String((entry && entry.name) || "").trim();
    const itemId = String((entry && entry.item_id) || "").trim();
    const status = String((entry && entry.status) || "").toLowerCase();

    if (name) existingNames.add(name);
    if (!label) return;
    labels.add(label);
    if (itemId && !itemIdByLabel.has(label)) itemIdByLabel.set(label, itemId);
    if (status === "ready") increment(readyCounts, label);
    if (status === "todo") increment(todoCounts, label);
  });

  const candidates = Array.from(labels)
    .map((label) => {
      const ready = readyCounts[label] || 0;
      const todo = todoCounts[label] || 0;
      const deficit = Math.max(0, args.targetReady - (ready + todo));
      return { label, ready, todo, deficit };
    })
    .filter((row) => row.deficit > 0)
    .sort((a, b) => {
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.ready !== b.ready) return a.ready - b.ready;
      return a.label.localeCompare(b.label);
    });

  const generated = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    for (let n = 0; n < row.deficit; n += 1) {
      if (generated.length >= args.maxNew) break;
      const base = `todo_depth_${slugify(row.label)}`;
      let suffix = row.todo + n + 1;
      let name = `${base}_v${suffix}`;
      while (existingNames.has(name)) {
        suffix += 1;
        name = `${base}_v${suffix}`;
      }
      existingNames.add(name);
      generated.push({
        name,
        url: "",
        expected_any: [row.label],
        expected_all: [],
        item_id: itemIdByLabel.get(row.label) || "",
        required: false,
        status: "todo",
        notes: "Auto-generated depth expansion placeholder."
      });
    }
    if (generated.length >= args.maxNew) break;
  }

  if (!args.dryRun && generated.length) {
    manifest.images = images.concat(generated);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  console.log("Benchmark depth variant seed summary");
  console.log(
    JSON.stringify(
      {
        target_ready_per_label: args.targetReady,
        labels_considered: labels.size,
        labels_below_target: candidates.length,
        generated_entries: generated.length,
        max_new: args.maxNew,
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

