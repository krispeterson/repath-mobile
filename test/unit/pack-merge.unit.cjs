const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadPackMerge() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/pack-merge.js")).href;
  return import(url);
}

function makeRegistry() {
  return {
    "base-pack": {
      pack_id: "base-pack",
      variables: { a: "1", shared: "base" },
      channels: [{ id: "global", name: "Global", scope: "global", category: "giveaway" }],
      locations: [{ id: "loc-a", name: "A", country: "US" }],
      items: []
    },
    "country-pack": {
      pack_id: "country-pack",
      extends: ["base-pack"],
      variables: { shared: "country", b: "2" },
      channels: [{ id: "country", name: "Country", scope: "country", countries: ["US"], category: "marketplace" }],
      locations: [{ id: "loc-b", name: "B", country: "US" }],
      items: []
    },
    "muni-pack": {
      pack_id: "muni-pack",
      extends: ["country-pack"],
      variables: { b: "override", c: "3" },
      channels: [{ id: "muni", name: "Muni", scope: "municipality", municipalityIds: ["muni-pack"], category: "giveaway" }],
      locations: [{ id: "loc-b", name: "B Override", country: "US" }],
      items: []
    }
  };
}

module.exports = {
  cases: [
    {
      name: "resolvePackWithExtends merges arrays by id and child metadata wins",
      async run() {
        const { resolvePackWithExtends } = await loadPackMerge();
        const pack = resolvePackWithExtends("muni-pack", makeRegistry());
        const channelIds = new Set((pack.channels || []).map((channel) => channel.id));
        assert.ok(channelIds.has("global"));
        assert.ok(channelIds.has("country"));
        assert.ok(channelIds.has("muni"));
        const locB = (pack.locations || []).find((location) => location.id === "loc-b");
        assert.equal(locB.name, "B Override");
      }
    },
    {
      name: "resolvePackWithExtends shallow-merges variables with child override",
      async run() {
        const { resolvePackWithExtends } = await loadPackMerge();
        const pack = resolvePackWithExtends("muni-pack", makeRegistry());
        assert.equal(pack.variables.a, "1");
        assert.equal(pack.variables.shared, "country");
        assert.equal(pack.variables.b, "override");
        assert.equal(pack.variables.c, "3");
      }
    },
    {
      name: "resolvePackWithExtends detects inheritance cycles",
      async run() {
        const { resolvePackWithExtends } = await loadPackMerge();
        const registry = makeRegistry();
        registry["base-pack"].extends = ["muni-pack"];
        let threw = false;
        try {
          resolvePackWithExtends("muni-pack", registry);
        } catch (error) {
          threw = true;
          assert.ok(String(error.message).includes("cycle"));
        }
        assert.equal(threw, true);
      }
    }
  ]
};

