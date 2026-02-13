#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function usage() {
  console.log("Usage: node scripts/build-poc-curbside-assets.js [--pack path/to/pack.json] [--out-dir assets/models]");
}

function parseArgs(argv) {
  const args = {
    pack: path.join("assets", "packs", "fort-collins-co-us.pack.json"),
    outDir: path.join("assets", "models")
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pack") {
      args.pack = argv[++i];
    } else if (arg === "--out-dir") {
      args.outDir = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }
  return args;
}

function toLabelMap(entries) {
  const map = {};
  entries.forEach((entry) => {
    map[entry.label] = entry.item_id;
  });
  return map;
}

function main() {
  const args = parseArgs(process.argv);
  const packPath = path.resolve(args.pack);
  const outDir = path.resolve(args.outDir);

  if (!fs.existsSync(packPath)) {
    throw new Error(`Pack file not found: ${packPath}`);
  }

  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const packId = String(pack.pack_id || "unknown-pack");
  const items = Array.isArray(pack.items) ? pack.items : [];

  const curbsideEntries = items
    .filter((item) => {
      const cards = Array.isArray(item.option_cards) ? item.option_cards : [];
      return cards.some((card) => card && card.kind === "curbside_recycle");
    })
    .map((item) => ({
      item_id: String(item.id || "").trim(),
      label: String(item.name || "").trim()
    }))
    .filter((entry) => entry.item_id && entry.label)
    .sort((a, b) => a.label.localeCompare(b.label));

  if (!curbsideEntries.length) {
    throw new Error("No curbside_recycle entries found in pack.");
  }

  const labels = curbsideEntries.map((entry) => entry.label);
  const labelMap = {
    pack_id: packId,
    labels_to_item_ids: toLabelMap(curbsideEntries)
  };

  fs.mkdirSync(outDir, { recursive: true });
  const labelsPath = path.join(outDir, "poc-curbside.classes.json");
  const labelsTextPath = path.join(outDir, "poc-curbside.classes.txt");
  const mapPath = path.join(outDir, "poc-curbside.label-map.json");

  fs.writeFileSync(labelsPath, `${JSON.stringify(labels, null, 2)}\n`, "utf8");
  fs.writeFileSync(labelsTextPath, `${labels.join("\n")}\n`, "utf8");
  fs.writeFileSync(mapPath, `${JSON.stringify(labelMap, null, 2)}\n`, "utf8");

  console.log(`Generated ${labels.length} curbside classes for pack: ${packId}`);
  console.log(`- ${labelsPath}`);
  console.log(`- ${labelsTextPath}`);
  console.log(`- ${mapPath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
