#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/eval/plan-benchmark-coverage-expansion.js [--taxonomy assets/models/municipal-taxonomy-v1.json] [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--target-ready 3] [--max-rows 200] [--out test/benchmarks/benchmark-coverage-expansion-report.json] [--template-out test/benchmarks/benchmark-coverage-expansion-template.csv]"
  );
}

function parseArgs(argv) {
  const args = {
    taxonomy: path.join("assets", "models", "municipal-taxonomy-v1.json"),
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    targetReady: 3,
    maxRows: 200,
    out: path.join("test", "benchmarks", "benchmark-coverage-expansion-report.json"),
    templateOut: path.join("test", "benchmarks", "benchmark-coverage-expansion-template.csv")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--taxonomy") {
      args.taxonomy = argv[++i];
    } else if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--target-ready") {
      args.targetReady = Number(argv[++i]);
    } else if (arg === "--max-rows") {
      args.maxRows = Number(argv[++i]);
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--template-out") {
      args.templateOut = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.targetReady) || args.targetReady < 1) {
    args.targetReady = 3;
  }
  if (!Number.isFinite(args.maxRows) || args.maxRows < 1) {
    args.maxRows = 200;
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

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  const header = [
    "name",
    "url",
    "item_id",
    "canonical_label",
    "current_ready_count",
    "target_ready_count",
    "needed_for_target",
    "notes"
  ];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push([
      quoteCsv(row.name),
      quoteCsv(row.url),
      quoteCsv(row.item_id),
      quoteCsv(row.canonical_label),
      quoteCsv(row.current_ready_count),
      quoteCsv(row.target_ready_count),
      quoteCsv(row.needed_for_target),
      quoteCsv(row.notes)
    ].join(","));
  });
  return `${lines.join("\n")}\n`;
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function ensureListMapEntry(map, key) {
  if (!map[key]) map[key] = [];
  return map[key];
}

function main() {
  const args = parseArgs(process.argv);
  const taxonomyPath = path.resolve(args.taxonomy);
  const manifestPath = path.resolve(args.manifest);
  const outPath = path.resolve(args.out);
  const templatePath = path.resolve(args.templateOut);

  if (!fs.existsSync(taxonomyPath)) {
    throw new Error(`Taxonomy file not found: ${taxonomyPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const taxonomy = loadJson(taxonomyPath);
  const manifest = loadJson(manifestPath);

  const classes = Array.isArray(taxonomy && taxonomy.vision_classes) ? taxonomy.vision_classes : [];
  const classLabels = classes
    .map((entry) => String((entry && entry.canonical_label) || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const images = Array.isArray(manifest && manifest.images) ? manifest.images : [];

  const readyCounts = {};
  const todoByLabel = {};
  const unknownReadyLabels = {};
  const unknownTodoLabels = {};

  images.forEach((entry) => {
    const label = firstLabel(entry);
    if (!label) return;

    const status = String((entry && entry.status) || "").toLowerCase();
    if (status === "ready") {
      increment(readyCounts, label);
      if (!classLabels.includes(label)) increment(unknownReadyLabels, label);
      return;
    }

    if (status === "todo") {
      ensureListMapEntry(todoByLabel, label).push(entry);
      if (!classLabels.includes(label)) increment(unknownTodoLabels, label);
    }
  });

  const underTarget = classLabels
    .map((label) => {
      const ready = readyCounts[label] || 0;
      const deficit = Math.max(0, args.targetReady - ready);
      const todo = (todoByLabel[label] || []).length;
      return {
        canonical_label: label,
        ready_count: ready,
        target_ready_count: args.targetReady,
        deficit,
        todo_candidates: todo
      };
    })
    .filter((row) => row.deficit > 0)
    .sort((a, b) => {
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      if (a.ready_count !== b.ready_count) return a.ready_count - b.ready_count;
      return a.canonical_label.localeCompare(b.canonical_label);
    });

  const templateRows = [];
  underTarget.forEach((row) => {
    const candidates = (todoByLabel[row.canonical_label] || []).slice(0, row.deficit);
    candidates.forEach((entry) => {
      if (templateRows.length >= args.maxRows) return;
      templateRows.push({
        name: String((entry && entry.name) || "").trim(),
        url: "",
        item_id: String((entry && entry.item_id) || "").trim(),
        canonical_label: row.canonical_label,
        current_ready_count: row.ready_count,
        target_ready_count: row.target_ready_count,
        needed_for_target: row.deficit,
        notes: "coverage-expansion"
      });
    });
  });

  const withoutCandidates = underTarget
    .filter((row) => row.todo_candidates === 0)
    .map((row) => ({
      canonical_label: row.canonical_label,
      ready_count: row.ready_count,
      deficit: row.deficit
    }));

  const report = {
    generated_at: new Date().toISOString(),
    inputs: {
      taxonomy: path.relative(process.cwd(), taxonomyPath),
      manifest: path.relative(process.cwd(), manifestPath),
      target_ready_per_label: args.targetReady,
      max_rows: args.maxRows
    },
    summary: {
      taxonomy_label_count: classLabels.length,
      labels_under_target: underTarget.length,
      labels_with_zero_ready: underTarget.filter((row) => row.ready_count === 0).length,
      labels_without_todo_candidates: withoutCandidates.length,
      template_rows: templateRows.length
    },
    labels_under_target: underTarget,
    labels_without_todo_candidates: withoutCandidates,
    unknown_labels: {
      ready: Object.keys(unknownReadyLabels).sort((a, b) => a.localeCompare(b)),
      todo: Object.keys(unknownTodoLabels).sort((a, b) => a.localeCompare(b))
    }
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  fs.writeFileSync(templatePath, toCsv(templateRows), "utf8");

  console.log("Benchmark coverage expansion plan generated");
  console.log(
    JSON.stringify(
      {
        labels_under_target: report.summary.labels_under_target,
        labels_with_zero_ready: report.summary.labels_with_zero_ready,
        labels_without_todo_candidates: report.summary.labels_without_todo_candidates,
        template_rows: report.summary.template_rows,
        report: path.relative(process.cwd(), outPath),
        template: path.relative(process.cwd(), templatePath)
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
