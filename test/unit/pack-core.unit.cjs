const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadPackCore() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/pack-core.js")).href;
  return import(url);
}

function testResolveLocationDetailsForKnownLocation() {
  return loadPackCore().then(({ resolveLocationDetails }) => {
    const pack = {
      locations: [
        {
          id: "loc-1",
          name: "Dropoff",
          address: "123 St",
          city: "Town",
          region: "CO",
          postal_code: "80525",
          hours: "Mon-Fri",
          website: "https://example.com"
        }
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
}

function testResolveLocationDetailsReturnsNullForMissingLocation() {
  return loadPackCore().then(({ resolveLocationDetails }) => {
    const details = resolveLocationDetails({ locations: [] }, "missing");
    assert.equal(details, null);
  });
}

function testResolvePlacePrefersJurisdictionWhenPresent() {
  return loadPackCore().then(({ resolvePlace }) => {
    const pack = {
      jurisdiction: { name: "Metro", admin_areas: [{ code: "TX" }], country: "US" },
      municipality: { name: "City", region: "CO" }
    };
    const place = resolvePlace(pack);
    assert.equal(place.name, "Metro");
    assert.equal(place.region, "TX");
  });
}

module.exports = {
  cases: [
    {
      name: "resolveLocationDetails returns fields for a known location",
      run: testResolveLocationDetailsForKnownLocation
    },
    {
      name: "resolveLocationDetails returns null for missing location",
      run: testResolveLocationDetailsReturnsNullForMissingLocation
    },
    {
      name: "resolvePlace prefers jurisdiction data when present",
      run: testResolvePlacePrefersJurisdictionWhenPresent
    }
  ]
};
