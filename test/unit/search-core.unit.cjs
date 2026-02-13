const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadSearchCore() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/search-core.js")).href;
  return import(url);
}

function makePack() {
  return {
    items: [
      {
        id: "electronics",
        name: "Electronics",
        keywords: ["computer", "device"],
        option_cards: [{ id: "a", priority: 10, confidence: 0.9 }]
      },
      {
        id: "books",
        name: "Books",
        keywords: ["paperback", "library"],
        option_cards: [{ id: "b", priority: 20, confidence: 0.9 }]
      },
      {
        id: "cardboard",
        name: "Cardboard",
        keywords: ["box", "carton"],
        option_cards: [{ id: "c", priority: 5, confidence: 0.7 }]
      },
      {
        id: "metal",
        name: "Metal",
        keywords: ["steel", "aluminum"],
        option_cards: [{ id: "d", priority: 8, confidence: 0.8 }]
      }
    ]
  };
}

function makeIndex() {
  return {
    packs: {
      demo: {
        index: {
          electronics: ["electronics"],
          laptop: ["electronics"],
          computer: ["electronics"],
          book: ["books"],
          paperback: ["books"],
          cardboard: ["cardboard"],
          box: ["cardboard"],
          carton: ["cardboard"],
          metal: ["metal"],
          steel: ["metal"],
          aluminum: ["metal"]
        }
      }
    }
  };
}

function buildExpandCases() {
  return [
    ["laptop", ["laptop", "electronic", "e", "waste", "computer"]],
    ["tv", ["tv", "electronic", "e", "waste", "television"]],
    ["toothbrush", ["toothbrush", "plastic"]],
    ["unknown", ["unknown"]]
  ];
}

function buildResolveCases() {
  return [
    ["laptop", "a"],
    ["book", "b"],
    ["box", "c"],
    ["steel", "d"],
    ["computer", "a"],
    ["paperback", "b"]
  ];
}

function createExpandCase(label, mustContain) {
  return {
    name: `expandLabelTokens('${label}') contains expected aliases`,
    async run() {
      const { expandLabelTokens } = await loadSearchCore();
      const tokens = expandLabelTokens(label);
      mustContain.forEach((value) => assert.ok(tokens.includes(value)));
    }
  };
}

function createResolveCase(query, expectedCardId) {
  return {
    name: `resolveItemFromIndex('${query}') -> card '${expectedCardId}'`,
    async run() {
      const { resolveItemFromIndex } = await loadSearchCore();
      const cards = resolveItemFromIndex(makeIndex(), makePack(), "demo", query);
      assert.ok(cards.length > 0);
      assert.equal(cards[0].id, expectedCardId);
    }
  };
}

function createMapCase(label, expectedItemId) {
  return {
    name: `mapLabelsToItemsFromIndex('${label}') includes item '${expectedItemId}'`,
    async run() {
      const { mapLabelsToItemsFromIndex } = await loadSearchCore();
      const items = mapLabelsToItemsFromIndex(makeIndex(), [label], "demo", makePack());
      assert.ok(items.length > 0);
      assert.equal(items[0].id, expectedItemId);
    }
  };
}

function createRankCase(priority, confidence, expectedScore) {
  return {
    name: `rankCards score priority=${priority} confidence=${confidence}`,
    async run() {
      const { rankCards } = await loadSearchCore();
      const out = rankCards([{ id: "x", priority, confidence }]);
      assert.equal(out.length, 1);
      assert.equal(out[0].score, expectedScore);
    }
  };
}

const expandCases = buildExpandCases().map(([label, mustContain]) => createExpandCase(label, mustContain));
const resolveCases = buildResolveCases().map(([query, expectedCardId]) => createResolveCase(query, expectedCardId));

const mapInputs = [
  ["laptop", "electronics"],
  ["book", "books"],
  ["box", "cardboard"],
  ["steel", "metal"],
  ["aluminum", "metal"],
  ["cardboard", "cardboard"],
  ["computer", "electronics"],
  ["paperback", "books"],
  ["carton", "cardboard"],
  ["metal", "metal"],
  ["Laptop", "electronics"],
  ["BOOK", "books"],
  ["Box", "cardboard"],
  ["Steel", "metal"],
  ["Aluminum", "metal"],
  ["Cardboard", "cardboard"],
  ["Computer", "electronics"],
  ["Paperback", "books"],
  ["Carton", "cardboard"],
  ["Metal", "metal"]
];
const mapCases = mapInputs.map(([label, expectedItemId]) => createMapCase(label, expectedItemId));

const rankCases = [];
for (let priority = 0; priority < 10; priority += 1) {
  for (let confidence = 0.1; confidence <= 0.5; confidence += 0.1) {
    const rounded = Number(confidence.toFixed(1));
    rankCases.push(createRankCase(priority, rounded, priority - rounded * 10));
  }
}

const fallbackCase = {
  name: "resolveItemFromIndex returns unknown fallback card when no match",
  async run() {
    const { resolveItemFromIndex } = await loadSearchCore();
    const cards = resolveItemFromIndex(makeIndex(), makePack(), "demo", "does-not-exist");
    assert.equal(cards[0].id, "unknown-item");
  }
};

module.exports = {
  cases: [...expandCases, ...resolveCases, ...mapCases, ...rankCases, fallbackCase]
};
