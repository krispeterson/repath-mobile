const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadPackSelection() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/pack-selection.js")).href;
  return import(url);
}

function makeManifest() {
  return {
    jurisdictions: {
      "80525": "fort-collins-co-us"
    }
  };
}

module.exports = {
  cases: [
    {
      name: "resolvePackSelection returns exact municipality pack for mapped ZIP",
      async run() {
        const { resolvePackSelection } = await loadPackSelection();
        const out = resolvePackSelection(makeManifest(), "80525");
        assert.equal(out.packId, "fort-collins-co-us");
        assert.equal(out.isFallback, false);
        assert.equal(out.notice, null);
      }
    },
    {
      name: "resolvePackSelection returns US fallback pack for unknown valid ZIP",
      async run() {
        const { resolvePackSelection, DEFAULT_US_FALLBACK_PACK_ID } = await loadPackSelection();
        const out = resolvePackSelection(makeManifest(), "99999");
        assert.equal(out.packId, DEFAULT_US_FALLBACK_PACK_ID);
        assert.equal(out.isFallback, true);
        assert.ok(String(out.notice || "").length > 0);
      }
    },
    {
      name: "resolvePackSelection returns null pack for invalid ZIP input",
      async run() {
        const { resolvePackSelection } = await loadPackSelection();
        const out = resolvePackSelection(makeManifest(), "abc");
        assert.equal(out.packId, null);
        assert.equal(out.isFallback, false);
      }
    }
  ]
};

