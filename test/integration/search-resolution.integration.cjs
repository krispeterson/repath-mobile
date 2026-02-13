const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function readJson(relPath) {
  const fullPath = path.join(__dirname, "..", "..", relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

async function loadSearchCoreModule() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/search-core.js")).href;
  return import(url);
}

function buildLabelMap(mapJson) {
  const mapped = {};
  Object.keys(mapJson.labels_to_item_ids || {}).forEach((label) => {
    mapped[label.toLowerCase()] = mapJson.labels_to_item_ids[label];
  });
  return mapped;
}

function resolveViaMappedThenIndexed({ labels, pack, packId, mapJson, searchIndex, searchCore }) {
  const labelToItemId = buildLabelMap(mapJson);
  const seen = {};
  const exactItems = [];

  (Array.isArray(labels) ? labels : []).forEach((label) => {
    const key = String(label || "").toLowerCase();
    const itemId = labelToItemId[key];
    if (!itemId || seen[itemId]) return;
    const item = (pack.items || []).find((entry) => entry.id === itemId);
    if (!item) return;
    exactItems.push(item);
    seen[item.id] = true;
  });

  if (exactItems.length) return exactItems;
  return searchCore.mapLabelsToItemsFromIndex(searchIndex, labels, packId, pack);
}

function createResolutionCase(label, expectedItemId) {
  return {
    name: `mapped-then-indexed resolution for '${label}'`,
    async run() {
      const searchCore = await loadSearchCoreModule();
      const pack = readJson("assets/packs/fort-collins-co-us.pack.json");
      const searchIndex = readJson("assets/packs/search.json");
      const mapJson = readJson("assets/models/poc-curbside.label-map.json");

      const items = resolveViaMappedThenIndexed({
        labels: [label],
        pack,
        packId: "fort-collins-co-us",
        mapJson,
        searchIndex,
        searchCore
      });
      assert.ok(items.length > 0);
      assert.equal(items[0].id, expectedItemId);
    }
  };
}

const directMapCases = [
  ["Tin Can", "tin-can"],
  ["Cardboard", "cardboard"],
  ["Paper Bag", "paper-bag"],
  ["Plastic Jug", "plastic-jug"],
  ["Plastic Tub", "plastic-tub"],
  ["Paperboard", "paperboard"],
  ["Carton", "carton"],
  ["Mixed Paper", "mixed-paper"],
  ["Aluminum Can", "aluminum-can"],
  ["White Office Paper", "white-office-paper"],
  ["Wrapping Paper", "wrapping-paper"],
  ["Telephone Book", "telephone-book"],
  ["Nalgene Bottle", "nalgene-bottle"],
  ["Paper Egg Carton", "paper-egg-carton"],
  ["Pizza Box", "pizza-box"]
].map(([label, itemId]) => createResolutionCase(label, itemId));

const fallbackCases = [
  {
    name: "falls back to index when label map has no match",
    async run() {
      const searchCore = await loadSearchCoreModule();
      const pack = readJson("assets/packs/fort-collins-co-us.pack.json");
      const searchIndex = readJson("assets/packs/search.json");
      const mapJson = readJson("assets/models/poc-curbside.label-map.json");
      const items = resolveViaMappedThenIndexed({
        labels: ["laptop"],
        pack,
        packId: "fort-collins-co-us",
        mapJson,
        searchIndex,
        searchCore
      });
      assert.ok(items.length > 0);
    }
  },
  {
    name: "deduplicates repeated labels in mapped resolution",
    async run() {
      const searchCore = await loadSearchCoreModule();
      const pack = readJson("assets/packs/fort-collins-co-us.pack.json");
      const searchIndex = readJson("assets/packs/search.json");
      const mapJson = readJson("assets/models/poc-curbside.label-map.json");
      const items = resolveViaMappedThenIndexed({
        labels: ["Tin Can", "Tin Can", "Tin Can"],
        pack,
        packId: "fort-collins-co-us",
        mapJson,
        searchIndex,
        searchCore
      });
      assert.equal(items.length, 1);
      assert.equal(items[0].id, "tin-can");
    }
  },
  {
    name: "returns empty list when labels are empty and no index matches",
    async run() {
      const searchCore = await loadSearchCoreModule();
      const pack = { items: [] };
      const searchIndex = { packs: { demo: { index: {} } } };
      const mapJson = { labels_to_item_ids: {} };
      const items = resolveViaMappedThenIndexed({
        labels: [],
        pack,
        packId: "demo",
        mapJson,
        searchIndex,
        searchCore
      });
      assert.deepEqual(items, []);
    }
  }
];

module.exports = {
  cases: [...directMapCases, ...fallbackCases]
};
