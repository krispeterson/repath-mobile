const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");

function readJson(relPath) {
  const fullPath = path.join(__dirname, "..", "..", relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function hasCurbsideCard(item) {
  const cards = Array.isArray(item.option_cards) ? item.option_cards : [];
  return cards.some((card) => card && card.kind === "curbside_recycle");
}

function testBenchmarkManifestHasPositivesAndNegatives() {
  const manifest = readJson("test/benchmarks/fc-curbside-manifest.json");
  assert.ok(Array.isArray(manifest.images));
  const positives = manifest.images.filter((entry) => Array.isArray(entry.expected_any) && entry.expected_any.length > 0);
  const negatives = manifest.images.filter((entry) => Array.isArray(entry.expected_any) && entry.expected_any.length === 0);
  assert.ok(positives.length > 0, "expected positive benchmark cases");
  assert.ok(negatives.length > 0, "expected negative benchmark cases");
}

function testCurbsideLabelMapAlignsWithPackItems() {
  const classes = readJson("assets/models/poc-curbside.classes.json");
  const labelMap = readJson("assets/models/poc-curbside.label-map.json");
  const pack = readJson("assets/packs/fort-collins-co-us.pack.json");

  assert.equal(classes.length, 40);
  assert.equal(Object.keys(labelMap.labels_to_item_ids).length, classes.length);

  classes.forEach((label) => {
    const itemId = labelMap.labels_to_item_ids[label];
    assert.ok(itemId, `missing label mapping for '${label}'`);
    const item = pack.items.find((entry) => entry.id === itemId);
    assert.ok(item, `mapped item id missing from pack: ${itemId}`);
    assert.ok(hasCurbsideCard(item), `mapped item is not curbside_recycle: ${itemId}`);
  });
}

module.exports = {
  cases: [
    { name: "benchmark manifest includes positive and negative examples", run: testBenchmarkManifestHasPositivesAndNegatives },
    { name: "curbside classes map to curbside_recycle pack items", run: testCurbsideLabelMapAlignsWithPackItems }
  ]
};
