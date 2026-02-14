#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node ml/data/merge-coverage-expansion-template.js [--input test/benchmarks/benchmark-labeled.csv] [--template test/benchmarks/benchmark-coverage-expansion-template.csv] [--out test/benchmarks/benchmark-labeled.csv] [--dry-run]"
  );
}

function parseArgs(argv) {
  const args = {
    input: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    template: path.join("test", "benchmarks", "benchmark-coverage-expansion-template.csv"),
    out: path.join("test", "benchmarks", "benchmark-labeled.csv"),
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i];
    } else if (arg === "--template") {
      args.template = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
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
    } else if (ch === ",") {
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

function quoteCsv(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function readCsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const hasHeader = lines[0].toLowerCase().includes("name") && lines[0].toLowerCase().includes(",");
  const start = hasHeader ? 1 : 0;
  const rows = [];

  for (let i = start; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    rows.push({
      name: String(cols[0] || "").trim(),
      url: String(cols[1] || "").trim(),
      item_id: String(cols[2] || "").trim(),
      canonical_label: String(cols[3] || "").trim(),
      source: String(cols[4] || "").trim(),
      notes: String(cols[5] || "").trim(),
      _raw: cols
    });
  }

  return rows;
}

function readTemplateRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const hasHeader = lines[0].toLowerCase().includes("name") && lines[0].toLowerCase().includes("canonical_label");
  const start = hasHeader ? 1 : 0;

  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    rows.push({
      name: String(cols[0] || "").trim(),
      url: String(cols[1] || "").trim(),
      item_id: String(cols[2] || "").trim(),
      canonical_label: String(cols[3] || "").trim(),
      current_ready_count: String(cols[4] || "").trim(),
      target_ready_count: String(cols[5] || "").trim(),
      needed_for_target: String(cols[6] || "").trim(),
      notes: String(cols[7] || "").trim()
    });
  }

  return rows.filter((row) => row.name);
}

function toCsv(rows) {
  const header = ["name", "url", "item_id", "canonical_label", "source", "notes"];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        quoteCsv(row.name),
        quoteCsv(row.url),
        quoteCsv(row.item_id),
        quoteCsv(row.canonical_label),
        quoteCsv(row.source),
        quoteCsv(row.notes)
      ].join(",")
    );
  });
  return `${lines.join("\n")}\n`;
}

function mergeNotes(existing, addition) {
  const e = String(existing || "").trim();
  const a = String(addition || "").trim();
  if (!e) return a;
  if (!a) return e;
  if (e.includes(a)) return e;
  return `${e}; ${a}`;
}

function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(args.input);
  const templatePath = path.resolve(args.template);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input CSV not found: ${inPath}`);
  }
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Coverage template not found: ${templatePath}`);
  }

  const inputRows = readCsvRows(inPath);
  const templateRows = readTemplateRows(templatePath);

  const byName = new Map();
  inputRows.forEach((row) => {
    if (!row.name) return;
    byName.set(row.name, row);
  });

  let added = 0;
  let enriched = 0;
  let unchanged = 0;

  templateRows.forEach((row) => {
    const existing = byName.get(row.name);
    const templateNote = `coverage-expansion target=${row.target_ready_count} needed=${row.needed_for_target}`;

    if (!existing) {
      byName.set(row.name, {
        name: row.name,
        url: row.url || "",
        item_id: row.item_id || "",
        canonical_label: row.canonical_label || "",
        source: "coverage_expansion_queue",
        notes: mergeNotes(row.notes, templateNote)
      });
      added += 1;
      return;
    }

    let changed = false;
    if (!existing.item_id && row.item_id) {
      existing.item_id = row.item_id;
      changed = true;
    }
    if (!existing.canonical_label && row.canonical_label) {
      existing.canonical_label = row.canonical_label;
      changed = true;
    }
    if (!existing.source) {
      existing.source = "coverage_expansion_queue";
      changed = true;
    }

    const mergedNotes = mergeNotes(existing.notes, templateNote);
    if (mergedNotes !== (existing.notes || "")) {
      existing.notes = mergedNotes;
      changed = true;
    }

    if (changed) {
      enriched += 1;
    } else {
      unchanged += 1;
    }
  });

  const mergedRows = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, toCsv(mergedRows), "utf8");
  }

  console.log("Coverage expansion template merge summary");
  console.log(
    JSON.stringify(
      {
        template_rows: templateRows.length,
        existing_rows: inputRows.length,
        merged_rows: mergedRows.length,
        added,
        enriched,
        unchanged,
        output: path.relative(process.cwd(), outPath),
        dry_run: args.dryRun
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
