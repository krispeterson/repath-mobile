#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log(
    "Usage: node scripts/plan-benchmark-priority.js [--taxonomy assets/models/municipal-taxonomy-v1.json] [--manifest test/benchmarks/municipal-benchmark-manifest-v2.json] [--out test/benchmarks/benchmark-priority-report.json] [--top 50]"
  );
}

function parseArgs(argv) {
  const args = {
    taxonomy: path.join("assets", "models", "municipal-taxonomy-v1.json"),
    manifest: path.join("test", "benchmarks", "municipal-benchmark-manifest-v2.json"),
    out: path.join("test", "benchmarks", "benchmark-priority-report.json"),
    top: 50
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--taxonomy") {
      args.taxonomy = argv[++i];
    } else if (arg === "--manifest") {
      args.manifest = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--top") {
      args.top = Number(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.top) || args.top < 1) {
    args.top = 50;
  }

  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildTokenFrequency(records) {
  const stopwords = new Set(["and", "or", "the", "with", "for", "other", "than", "to", "of", "in", "on", "a", "an"]);
  const freq = {};

  records.forEach((record) => {
    const tokens = unique(normalizeTokens(record.canonical_label).filter((token) => token.length > 2 && !stopwords.has(token)));
    tokens.forEach((token) => {
      freq[token] = (freq[token] || 0) + 1;
    });
  });

  return freq;
}

function bandForScore(score) {
  if (score >= 70) return "urgent";
  if (score >= 50) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function firstLabel(entry) {
  const labels = Array.isArray(entry.expected_any) ? entry.expected_any : [];
  return labels.length ? String(labels[0] || "").trim() : "";
}

function scoreCandidate(record, tokenFreq) {
  const reasons = [];
  let score = 0;

  const label = String(record.canonical_label || "");
  const labelLower = label.toLowerCase();
  const outcomes = Array.isArray(record.outcomes) ? record.outcomes : [];
  const primary = String(record.primary_outcome || "").trim();

  const outcomeWeights = {
    dropoff_hhw: 36,
    dropoff_other: 20,
    trash: 14,
    compost: 10,
    dropoff_recycle: 12,
    curbside_recycle: 8,
    reuse: 6
  };

  if (primary && outcomeWeights[primary]) {
    score += outcomeWeights[primary];
    reasons.push(`${primary} outcome (+${outcomeWeights[primary]})`);
  }

  if (outcomes.length > 1) {
    const multiPoints = 6 + Math.min(10, (outcomes.length - 1) * 2);
    score += multiPoints;
    reasons.push(`multiple disposal options (${outcomes.length}) (+${multiPoints})`);
  }

  const hazardRegex = /(battery|paint|oil|antifreeze|ammunition|explosive|flammable|propane|pesticide|chemical|solvent|fire extinguisher|electronics|mercury|medication|pharmaceutical|syringe|needle|sharps|engine coolant)/;
  if (hazardRegex.test(labelLower)) {
    score += 28;
    reasons.push("hazard-adjacent item (+28)");
  }

  const ambiguousTerms = [
    "container", "bottle", "can", "box", "bag", "tray", "tub", "carton", "cup", "jar", "lid", "cap", "wrapper", "packaging"
  ];
  const ambiguousHits = ambiguousTerms.filter((term) => labelLower.includes(term)).length;
  if (ambiguousHits > 0) {
    const points = Math.min(18, ambiguousHits * 4);
    score += points;
    reasons.push(`visually ambiguous shape terms (${ambiguousHits}) (+${points})`);
  }

  const familyMatches = {
    plastic: /(plastic|styrofoam|polystyrene|foam|bubble wrap|blister)/.test(labelLower),
    paper: /(paper|cardboard|carton|book|magazine|box|envelope|wrapping)/.test(labelLower),
    metal: /(aluminum|tin|metal|steel|foil|aerosol)/.test(labelLower),
    glass: /glass/.test(labelLower)
  };
  const familyCount = Object.values(familyMatches).filter(Boolean).length;
  if (familyCount > 1) {
    const points = familyCount * 4;
    score += points;
    reasons.push(`cross-material ambiguity (${familyCount} families) (+${points})`);
  }

  if (labelLower.includes("other") || labelLower.includes("mixed")) {
    score += 7;
    reasons.push("broad/other category naming (+7)");
  }

  const tokens = unique(normalizeTokens(label).filter((token) => token.length > 2));
  if (tokens.length) {
    const crowdingRaw = tokens.reduce((sum, token) => sum + Math.max(0, (tokenFreq[token] || 1) - 1), 0) / tokens.length;
    const crowdingPoints = Math.min(20, Math.round(crowdingRaw * 2));
    if (crowdingPoints > 0) {
      score += crowdingPoints;
      reasons.push(`label token crowding (+${crowdingPoints})`);
    }
  }

  return {
    score,
    priority_band: bandForScore(score),
    reasons
  };
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

  const byLabel = new Map();
  classes.forEach((record) => {
    const label = String(record.canonical_label || "").trim();
    if (label) byLabel.set(label, record);
  });

  const tokenFreq = buildTokenFrequency(classes);

  const todoCandidates = images
    .filter((entry) => String(entry.status || "").toLowerCase() === "todo")
    .map((entry) => {
      const label = firstLabel(entry);
      const record = byLabel.get(label);
      if (!record) {
        return {
          name: entry.name,
          item_id: entry.item_id || null,
          canonical_label: label || null,
          status: "unmapped",
          priority_score: 0,
          priority_band: "low",
          reasons: ["label not mapped to taxonomy"]
        };
      }

      const scored = scoreCandidate(record, tokenFreq);
      return {
        name: entry.name,
        item_id: record.item_id,
        canonical_label: record.canonical_label,
        primary_outcome: record.primary_outcome,
        outcomes: record.outcomes,
        required: Boolean(entry.required),
        priority_score: scored.score,
        priority_band: scored.priority_band,
        reasons: scored.reasons
      };
    })
    .sort((a, b) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return String(a.canonical_label || "").localeCompare(String(b.canonical_label || ""));
    });

  const topN = todoCandidates.slice(0, args.top);
  const bandCounts = todoCandidates.reduce((acc, row) => {
    acc[row.priority_band] = (acc[row.priority_band] || 0) + 1;
    return acc;
  }, {});

  const report = {
    generated_at: new Date().toISOString(),
    inputs: {
      taxonomy: path.relative(process.cwd(), taxonomyPath),
      manifest: path.relative(process.cwd(), manifestPath)
    },
    summary: {
      todo_candidates: todoCandidates.length,
      requested_top_n: args.top,
      priority_band_counts: bandCounts
    },
    top_candidates: topN,
    all_candidates: todoCandidates
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Benchmark labeling priority summary");
  console.log(
    JSON.stringify(
      {
        todo_candidates: report.summary.todo_candidates,
        priority_band_counts: report.summary.priority_band_counts,
        top_5: topN.slice(0, 5).map((row) => ({
          canonical_label: row.canonical_label,
          score: row.priority_score,
          band: row.priority_band
        }))
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
