const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadDecideCore() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/decide-core.js")).href;
  return import(url);
}

function makePack() {
  return {
    pack_id: "demo-pack",
    municipality: { name: "Fort Collins", region: "CO", country: "US" },
    variables: { craigslistSubdomain: "fortcollins" },
    channels: [
      {
        id: "local-group",
        name: "Local Group",
        category: "giveaway",
        scope: "municipality",
        municipalityIds: ["demo-pack"],
        urlTemplate: "https://example.com/group"
      },
      {
        id: "craigslist",
        name: "Craigslist",
        category: "marketplace",
        scope: "country",
        countries: ["US"],
        urlTemplate: "https://{{citySlug}}.craigslist.org/search/sss?query={{query}}",
        requires: ["query", "citySlug"]
      },
      {
        id: "ebay",
        name: "eBay",
        category: "marketplace",
        scope: "global",
        urlTemplate: "https://www.ebay.com/sch/i.html?_nkw={{query}}",
        requires: ["query"]
      }
    ],
    locations: [
      {
        id: "goodwill",
        name: "Goodwill",
        type: "donation",
        country: "US"
      }
    ],
    items: [
      {
        id: "furniture",
        name: "Furniture",
        keywords: ["chair", "sofa"],
        option_cards: [
          {
            id: "furniture-trash",
            kind: "trash",
            title: "Trash (last resort)",
            priority: 900,
            confidence: 0.9,
            actions: [{ type: "copy_text", label: "Info", text: "Only trash unsafe items." }]
          }
        ]
      }
    ],
    rules: [
      {
        id: "reuse-furniture",
        when: { keywords: ["chair"] },
        then: {
          action: "reuse",
          priority: 10,
          title: "Reuse first",
          channelIds: ["local-group", "craigslist", "ebay"]
        }
      },
      {
        id: "donate-furniture",
        when: { keywords: ["chair"] },
        then: {
          action: "donate",
          priority: 20,
          title: "Donate",
          locationTypes: ["donation"]
        }
      }
    ]
  };
}

function findPathway(response, action) {
  return (response.pathways || []).find((pathway) => pathway.action === action) || null;
}

module.exports = {
  cases: [
    {
      name: "decideWithPack renders craigslist URL when subdomain variable is set",
      async run() {
        const { decideWithPack } = await loadDecideCore();
        const response = decideWithPack(makePack(), {
          queryText: "chair",
          context: { municipalityId: "demo-pack", countryCode: "US" }
        });
        const reuse = findPathway(response, "reuse");
        const craigslist = (reuse.channels || []).find((channel) => channel.id === "craigslist");
        assert.ok(craigslist.url.includes("fortcollins.craigslist.org"));
        assert.equal(response.questions.length, 0);
      }
    },
    {
      name: "decideWithPack asks for city when craigslist citySlug cannot be resolved",
      async run() {
        const { decideWithPack } = await loadDecideCore();
        const pack = makePack();
        delete pack.variables.craigslistSubdomain;
        const response = decideWithPack(pack, {
          queryText: "chair",
          context: { municipalityId: "demo-pack", countryCode: "US" }
        });
        assert.ok(response.questions.some((question) => question.id === "city"));
      }
    },
    {
      name: "decideWithPack filters scope-specific channels by country and municipality",
      async run() {
        const { decideWithPack } = await loadDecideCore();
        const response = decideWithPack(makePack(), {
          queryText: "chair",
          context: { municipalityId: "other-pack", countryCode: "CA" }
        });
        const reuse = findPathway(response, "reuse");
        const channelIds = new Set((reuse.channels || []).map((channel) => channel.id));
        assert.ok(!channelIds.has("local-group"));
        assert.ok(!channelIds.has("craigslist"));
        assert.ok(channelIds.has("ebay"));
      }
    },
    {
      name: "decideWithPack includes donation places on donate pathway",
      async run() {
        const { decideWithPack } = await loadDecideCore();
        const response = decideWithPack(makePack(), {
          queryText: "chair",
          context: { municipalityId: "demo-pack", countryCode: "US" }
        });
        const donate = findPathway(response, "donate");
        assert.equal(donate.locations.length, 1);
        assert.equal(donate.locations[0].id, "goodwill");
      }
    }
  ]
};

