const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function readJson(relPath) {
  const fullPath = path.join(__dirname, "..", "..", relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

async function loadDecideCore() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/decide-core.js")).href;
  return import(url);
}

async function loadPackMerge() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/pack-merge.js")).href;
  return import(url);
}

module.exports = {
  cases: [
    {
      name: "fort collins chair flow returns reuse channels and donation places",
      async run() {
        const { decideWithPack } = await loadDecideCore();
        const { resolvePackWithExtends } = await loadPackMerge();

        const registry = {
          "fort-collins-co-us": readJson("assets/packs/fort-collins-co-us.pack.json"),
          "repath.base.channels.v1": readJson("assets/packs/repath.base.channels.v1.pack.json"),
          "repath.country.us.channels.v1": readJson("assets/packs/repath.country.us.channels.v1.pack.json")
        };
        const mergedPack = resolvePackWithExtends("fort-collins-co-us", registry);
        const response = decideWithPack(mergedPack, {
          queryText: "chair",
          context: {
            municipalityId: "fort-collins-co-us",
            countryCode: "US"
          }
        });

        const reuse = (response.pathways || []).find((pathway) => pathway.action === "reuse");
        const donate = (response.pathways || []).find((pathway) => pathway.action === "donate");
        assert.ok(reuse, "expected reuse pathway");
        assert.ok(donate, "expected donate pathway");
        assert.ok((reuse.channels || []).length >= 4, "expected multiple reuse channels");

        const craigslist = (reuse.channels || []).find((channel) => channel.id === "craigslist");
        assert.ok(craigslist && craigslist.url && craigslist.url.includes("fortcollins.craigslist.org"));

        const donationIds = new Set((donate.locations || []).map((location) => location.id));
        assert.ok(donationIds.has("goodwill-fort-collins"));
        assert.ok(donationIds.has("habitat-restore-fort-collins"));
      }
    }
  ]
};

