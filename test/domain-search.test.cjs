const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

function loadModule(relPath) {
  const abs = pathToFileURL(path.join(__dirname, relPath)).href;
  return import(abs);
}

function buildPack() {
  return {
    items: [
      { id: "electronics", name: "Electronics", option_cards: [{ id: "c1", priority: 0, confidence: 0.7 }] },
      { id: "camera-or-camcorder", name: "Camera", option_cards: [{ id: "c2", priority: 10, confidence: 0.7 }] },
      { id: "books", name: "Books", option_cards: [{ id: "c3", priority: 5, confidence: 0.7 }] }
    ]
  };
}

function buildIndex() {
  return {
    packs: {
      demo: {
        index: {
          electronics: ["electronics"],
          laptop: ["electronics"],
          camera: ["camera-or-camcorder"],
          book: ["books"]
        }
      }
    }
  };
}

test("mapLabelsToItemsFromIndex prefers configured item for a label", async () => {
  const { mapLabelsToItemsFromIndex } = await loadModule("../src/domain/search-core.js");
  const items = mapLabelsToItemsFromIndex(buildIndex(), ["laptop"], "demo", buildPack());
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "electronics");
});

test("mapLabelsToItemsFromIndex uses aliases when preferred mapping is absent", async () => {
  const { mapLabelsToItemsFromIndex } = await loadModule("../src/domain/search-core.js");
  const items = mapLabelsToItemsFromIndex(buildIndex(), ["book"], "demo", buildPack());
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "books");
});

test("resolveItemFromIndex returns unknown cards when no match", async () => {
  const { resolveItemFromIndex } = await loadModule("../src/domain/search-core.js");
  const cards = resolveItemFromIndex(buildIndex(), buildPack(), "demo", "nonexistent");
  assert.equal(cards[0].id, "unknown-item");
});
