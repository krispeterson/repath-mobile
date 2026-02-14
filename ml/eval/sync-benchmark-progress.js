#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/sync-benchmark-progress.js [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--completed test/benchmarks/benchmark-labeled.csv] [--report test/benchmarks/benchmark-progress-report.json] [--clear-empty-url] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    completed: null,
    report: path.join("test", "benchmarks", "benchmark-progress-report.json"),
    clearEmptyUrl: false,
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--completed") {
      args.completed = argv[++i];
    } else if (arg === "--report") {
      args.report = argv[++i];
    } else if (arg === "--clear-empty-url") {
      args.clearEmptyUrl = true;
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

function loadCompletedEntries(filePath) {
  if (!filePath) return [];
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Completed file not found: ${fullPath}`);
  }

  const ext = path.extname(fullPath).toLowerCase();
  if (ext === ".json") {
    const data = loadJson(fullPath);
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row) => ({
        name: String((row && row.name) || "").trim(),
        url: String((row && row.url) || "").trim(),
        notes: String((row && row.notes) || "").trim()
      }))
      .filter((row) => row.name);
  }

  const text = fs.readFileSync(fullPath, "utf8");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("name");
  const start = hasHeader ? 1 : 0;

  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;

    if (line.includes(",")) {
      const cols = parseCsvLine(line).map((c) => c.trim());
      const name = String(cols[0] || "").trim();
      const url = String(cols[1] || "").trim();
      const notes = String(cols[5] || "").trim();
      if (name) out.push({ name, url, notes });
    } else {
      out.push({ name: line, url: "", notes: "" });
    }
  }

  return out;
}

function indexByName(images) {
  const map = new Map();
  images.forEach((entry) => {
    const name = String((entry && entry.name) || "").trim();
    if (!name) return;
    if (!map.has(name)) {
      map.set(name, []);
    }
    map.get(name).push(entry);
  });
  return map;
}

function maybePromoteFromUrl(entry, changes, lockedReadyNames) {
  const name = String((entry && entry.name) || "").trim();
  const currentStatus = String((entry && entry.status) || "").toLowerCase();
  const hasUrl = Boolean(String((entry && entry.url) || "").trim());

  if (hasUrl && currentStatus !== "ready") {
    entry.status = "ready";
    changes.push({ type: "status", name: entry.name, from: currentStatus || "", to: "ready" });
  }

  if (!hasUrl && currentStatus === "ready" && !lockedReadyNames.has(name)) {
    entry.status = "todo";
    changes.push({ type: "status", name: entry.name, from: "ready", to: "todo" });
  }
}

function shouldClearUrlFromRow(row) {
  const notes = String((row && row.notes) || "").toLowerCase();
  return notes.includes("needs unique url");
}

function main() {
  const args = parseArgs(process.argv);
  const manifestPath = path.resolve(args.manifest);
  const reportPath = path.resolve(args.report);

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const manifest = loadJson(manifestPath);
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  const byName = indexByName(images);
  const completedRows = loadCompletedEntries(args.completed);

  const changes = [];
  const unknownCompletedNames = [];
  const lockedReadyNames = new Set();
  const skippedMissingUrl = [];

  completedRows.forEach((row) => {
    const slots = byName.get(row.name);
    if (!slots || !slots.length) {
      unknownCompletedNames.push(row.name);
      return;
    }

    slots.forEach((entry) => {
      const prevStatus = String((entry && entry.status) || "").toLowerCase();
      const nextUrl = String(row.url || "").trim();
      const currentUrl = String(entry.url || "").trim();

      if (nextUrl && currentUrl !== nextUrl) {
        const oldUrl = currentUrl;
        entry.url = nextUrl;
        changes.push({ type: "url", name: row.name, from: oldUrl, to: nextUrl });
      } else if (!nextUrl && currentUrl && (args.clearEmptyUrl || shouldClearUrlFromRow(row))) {
        const oldUrl = currentUrl;
        entry.url = "";
        changes.push({ type: "url", name: row.name, from: oldUrl, to: "" });
      }

      const effectiveUrl = String(entry.url || "").trim();
      if (!effectiveUrl) {
        skippedMissingUrl.push(row.name);
        return;
      }

      if (prevStatus !== "ready") {
        entry.status = "ready";
        changes.push({ type: "status", name: row.name, from: prevStatus || "", to: "ready" });
      }
      lockedReadyNames.add(row.name);

      const note = String(entry.notes || "").trim();
      if (!note.toLowerCase().includes("completed")) {
        entry.notes = note ? `${note} Completed.` : "Completed.";
      }
    });
  });

  images.forEach((entry) => maybePromoteFromUrl(entry, changes, lockedReadyNames));

  const counts = {
    total: images.length,
    ready: images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "ready").length,
    todo: images.filter((entry) => String((entry && entry.status) || "").toLowerCase() === "todo").length,
    missing_url: images.filter((entry) => !String((entry && entry.url) || "").trim()).length
  };

  const report = {
    generated_at: new Date().toISOString(),
    inputs: {
      manifest: path.relative(process.cwd(), manifestPath),
      completed: args.completed ? path.relative(process.cwd(), path.resolve(args.completed)) : null,
      dry_run: args.dryRun
    },
    summary: {
      completed_rows_applied: completedRows.length,
      unknown_completed_names: unknownCompletedNames.length,
      skipped_missing_url: skippedMissingUrl.length,
      change_count: changes.length,
      counts
    },
    unknown_completed_names: unknownCompletedNames,
    skipped_missing_url_names: skippedMissingUrl,
    changes
  };

  if (!args.dryRun) {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Benchmark progress sync summary");
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
