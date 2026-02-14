#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/dedupe-benchmark-manifest.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--report test/benchmarks/benchmark-dedupe-report.json] [--keep-first] [--clear-url] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    report: path.join("test", "benchmarks", "benchmark-dedupe-report.json"),
    keepFirst: true,
    clearUrl: true,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--report") {
      args.report = argv[++i];
    } else if (arg === "--keep-first") {
      args.keepFirst = true;
    } else if (arg === "--keep-last") {
      args.keepFirst = false;
    } else if (arg === "--clear-url") {
      args.clearUrl = true;
    } else if (arg === "--keep-url") {
      args.clearUrl = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
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

function buildUrlGroups(images) {
  const groups = new Map();
  images.forEach((entry, index) => {
    const url = String((entry && entry.url) || "").trim();
    if (!url) return;
    if (!groups.has(url)) {
      groups.set(url, []);
    }
    groups.get(url).push({ index, entry });
  });
  return groups;
}

function ensureTodoNotes(entry) {
  const base = String((entry && entry.notes) || "").trim();
  const marker = "Needs unique URL (deduped).";
  if (!base) return marker;
  if (base.includes(marker)) return base;
  return `${base} ${marker}`;
}

function applyDedup(images, options) {
  const groups = buildUrlGroups(images);
  const duplicateGroups = [];
  const changed = [];

  groups.forEach((rows, url) => {
    if (rows.length < 2) return;

    const keeperPos = options.keepFirst ? 0 : rows.length - 1;
    const keep = rows[keeperPos];
    const dupeRows = rows.filter((_, pos) => pos !== keeperPos);

    duplicateGroups.push({
      url,
      keep_name: String((keep.entry && keep.entry.name) || ""),
      duplicate_names: dupeRows.map((r) => String((r.entry && r.entry.name) || ""))
    });

    dupeRows.forEach((row) => {
      const entry = row.entry;
      const prev = {
        name: String((entry && entry.name) || ""),
        status: String((entry && entry.status) || ""),
        url: String((entry && entry.url) || ""),
        notes: String((entry && entry.notes) || "")
      };

      entry.status = "todo";
      if (options.clearUrl) {
        entry.url = "";
      }
      entry.notes = ensureTodoNotes(entry);

      changed.push({
        name: prev.name,
        from: prev,
        to: {
          status: entry.status,
          url: String(entry.url || ""),
          notes: String(entry.notes || "")
        }
      });
    });
  });

  return { duplicateGroups, changed };
}

function countSummary(images) {
  return {
    total: images.length,
    ready: images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "ready").length,
    todo: images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "todo").length,
    with_url: images.filter((entry) => Boolean(String((entry && entry.url) || "").trim())).length,
    missing_url: images.filter((entry) => !String((entry && entry.url) || "").trim()).length
  };
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const reportPath = path.resolve(args.report);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const manifest = loadJson(manifestPath);
  const images = Array.isArray(manifest && manifest.images) ? manifest.images : [];

  const before = countSummary(images);
  const result = applyDedup(images, {
    keepFirst: args.keepFirst,
    clearUrl: args.clearUrl
  });
  const after = countSummary(images);

  const report = {
    generated_at: new Date().toISOString(),
    inputs: {
      manifest: path.relative(process.cwd(), manifestPath),
      dry_run: args.dryRun,
      keep_first: args.keepFirst,
      clear_url: args.clearUrl
    },
    summary: {
      duplicate_url_groups: result.duplicateGroups.length,
      entries_changed: result.changed.length,
      before,
      after
    },
    duplicate_groups: result.duplicateGroups,
    changes: result.changed
  };

  if (!args.dryRun) {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Benchmark dedupe summary");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Saved report to ${path.relative(process.cwd(), reportPath)}`);
  if (!args.dryRun) {
    console.log(`Updated manifest: ${path.relative(process.cwd(), manifestPath)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
