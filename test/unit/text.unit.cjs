const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadTextModule() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/text.js")).href;
  return import(url);
}

function buildNormalizeCases() {
  return [
    ["", ""],
    ["a", "a"],
    ["es", "es"],
    ["glass", "glas"],
    ["cans", "can"],
    ["boxes", "box"],
    ["buses", "bus"],
    ["cardboards", "cardboard"],
    ["wires", "wir"],
    ["bottle", "bottle"],
    ["bottles", "bottl"],
    ["mugs", "mug"],
    ["caps", "cap"],
    ["lids", "lid"],
    ["tubs", "tub"],
    ["jars", "jar"],
    ["toys", "toy"],
    ["rugs", "rug"],
    ["chairs", "chair"],
    ["tables", "tabl"],
    ["phones", "phon"],
    ["bags", "bag"],
    ["boxes", "box"],
    ["news", "new"],
    ["books", "book"],
    ["papers", "paper"],
    ["cups", "cup"],
    ["knives", "kniv"],
    ["spoons", "spoon"],
    ["forks", "fork"]
  ];
}

function buildTokenizeCases() {
  return [
    ["Tin Cans, Bottles & Glass!", ["tin", "can", "bottl", "glas"]],
    ["  paper  bag  ", ["paper", "bag"]],
    ["plastic-jugs", ["plastic", "jug"]],
    ["A/B/C", ["a", "b", "c"]],
    ["", []],
    [null, []],
    ["%%%###", []],
    ["Office Paper 123", ["office", "paper", "123"]],
    ["MIXED-CaSe BoTTles", ["mixed", "case", "bottl"]],
    ["toys,books,magazines", ["toy", "book", "magazin"]]
  ];
}

function createNormalizeCase(input, expected) {
  return {
    name: `normalizeToken('${input}') -> '${expected}'`,
    async run() {
      const { normalizeToken } = await loadTextModule();
      assert.equal(normalizeToken(input), expected);
    }
  };
}

function createTokenizeCase(input, expected) {
  return {
    name: `tokenize(${JSON.stringify(input)})`,
    async run() {
      const { tokenize } = await loadTextModule();
      assert.deepEqual(tokenize(input), expected);
    }
  };
}

const normalizeCases = buildNormalizeCases().map(([input, expected]) => createNormalizeCase(input, expected));
const tokenizeCases = buildTokenizeCases().map(([input, expected]) => createTokenizeCase(input, expected));

module.exports = {
  cases: [...normalizeCases, ...tokenizeCases]
};
