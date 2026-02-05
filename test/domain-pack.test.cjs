const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

function loadModule(relPath) {
  const abs = pathToFileURL(path.join(__dirname, relPath)).href;
  return import(abs);
}

test("resolveLocationDetails returns fields for a known location", async () => {
  const { resolveLocationDetails } = await loadModule("../src/domain/pack-core.js");
  const pack = {
    locations: [
      { id: "loc-1", name: "Dropoff", address: "123 St", city: "Town", region: "CO", postal_code: "80525", hours: "Mon-Fri", website: "https://example.com" }
    ]
  };
  const details = resolveLocationDetails(pack, "loc-1");
  assert.equal(details.name, "Dropoff");
  assert.equal(details.address, "123 St");
  assert.equal(details.city, "Town");
  assert.equal(details.region, "CO");
  assert.equal(details.postal_code, "80525");
  assert.equal(details.hours, "Mon-Fri");
  assert.equal(details.website, "https://example.com");
});

test("resolveLocationDetails returns null for missing location", async () => {
  const { resolveLocationDetails } = await loadModule("../src/domain/pack-core.js");
  const pack = { locations: [] };
  const details = resolveLocationDetails(pack, "missing");
  assert.equal(details, null);
});

test("resolvePlace prefers jurisdiction data when present", async () => {
  const { resolvePlace } = await loadModule("../src/domain/pack-core.js");
  const pack = {
    jurisdiction: { name: "Metro", admin_areas: [{ code: "TX" }], country: "US" },
    municipality: { name: "City", region: "CO" }
  };
  const place = resolvePlace(pack);
  assert.equal(place.name, "Metro");
  assert.equal(place.region, "TX");
});
