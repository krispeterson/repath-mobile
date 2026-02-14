#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log("Usage: node scripts/build-taxonomy.js [--pack assets/packs/<pack-id>.pack.json] [--out assets/models/municipal-taxonomy-v1.json]");
}

function parseArgs(argv) {
  const args = {
    pack: null,
    out: path.join("assets", "models", "municipal-taxonomy-v1.json")
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pack") {
      args.pack = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  return args;
}

function findDefaultPackPath() {
  const packsDir = path.resolve(path.join("assets", "packs"));
  if (!fs.existsSync(packsDir)) return null;
  const entries = fs.readdirSync(packsDir).filter((name) => name.endsWith(".pack.json"));
  if (!entries.length) return null;
  entries.sort((a, b) => a.localeCompare(b));
  return path.join(packsDir, entries[0]);
}

function normalizeAlias(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getPrimaryOutcome(optionCards) {
  const cards = Array.isArray(optionCards) ? optionCards.slice() : [];
  if (!cards.length) return null;
  cards.sort((a, b) => {
    const ap = a && Number.isFinite(a.priority) ? a.priority : 999;
    const bp = b && Number.isFinite(b.priority) ? b.priority : 999;
    return ap - bp;
  });
  return cards[0] && cards[0].kind ? cards[0].kind : null;
}

function getItemRecord(item) {
  const itemId = String((item && item.id) || "").trim();
  const name = String((item && item.name) || "").trim();
  const keywords = Array.isArray(item && item.keywords)
    ? item.keywords.map((k) => String(k || "").trim()).filter(Boolean)
    : [];
  const aliases = unique([name, ...keywords]);

  const optionCards = Array.isArray(item && item.option_cards) ? item.option_cards : [];
  const outcomes = unique(optionCards.map((card) => String((card && card.kind) || "").trim()));
  const primaryOutcome = getPrimaryOutcome(optionCards);

  return {
    item_id: itemId,
    canonical_label: name,
    class_id: toSlug(name || itemId),
    aliases,
    normalized_aliases: unique(aliases.map(normalizeAlias)),
    outcomes,
    primary_outcome: primaryOutcome,
    option_card_ids: optionCards.map((card) => String((card && card.id) || "").trim()).filter(Boolean)
  };
}

function createAliasIndex(itemRecords) {
  const aliasMap = new Map();

  itemRecords.forEach((record) => {
    record.normalized_aliases.forEach((alias) => {
      if (!aliasMap.has(alias)) {
        aliasMap.set(alias, new Set());
      }
      aliasMap.get(alias).add(record.item_id);
    });
  });

  const out = {};
  Array.from(aliasMap.keys())
    .sort((a, b) => a.localeCompare(b))
    .forEach((alias) => {
      out[alias] = Array.from(aliasMap.get(alias)).sort((a, b) => a.localeCompare(b));
    });
  return out;
}

function createOutcomeCounts(itemRecords) {
  const counts = {};
  itemRecords.forEach((record) => {
    record.outcomes.forEach((kind) => {
      counts[kind] = (counts[kind] || 0) + 1;
    });
  });
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])));
}

function main() {
  const args = parseArgs(process.argv);
  const packPath = args.pack ? path.resolve(args.pack) : findDefaultPackPath();
  const outPath = path.resolve(args.out);

  if (!packPath || !fs.existsSync(packPath)) {
    throw new Error(`Pack file not found: ${packPath}`);
  }

  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const items = Array.isArray(pack.items) ? pack.items : [];

  const itemRecords = items
    .map(getItemRecord)
    .filter((record) => record.item_id && record.canonical_label)
    .sort((a, b) => a.canonical_label.localeCompare(b.canonical_label));

  const taxonomy = {
    taxonomy_id: "municipal-taxonomy-v1",
    generated_at: new Date().toISOString(),
    source: {
      pack_id: pack.pack_id || null,
      pack_version: pack.pack_version || null,
      retrieved_at: pack.retrieved_at || null,
      municipality: pack.municipality || null,
      pack_path: path.relative(process.cwd(), packPath)
    },
    summary: {
      item_count: itemRecords.length,
      alias_count: itemRecords.reduce((sum, record) => sum + record.aliases.length, 0),
      normalized_alias_count: itemRecords.reduce((sum, record) => sum + record.normalized_aliases.length, 0),
      outcome_counts: createOutcomeCounts(itemRecords)
    },
    vision_classes: itemRecords,
    alias_index: createAliasIndex(itemRecords)
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(taxonomy, null, 2)}\n`, "utf8");

  console.log(`Generated taxonomy for ${itemRecords.length} items.`);
  console.log(`- ${path.relative(process.cwd(), outPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
