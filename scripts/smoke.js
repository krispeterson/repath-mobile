const fs = require('fs');
const path = require('path');

function readJson(relPath) {
  const fullPath = path.join(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const manifest = readJson('assets/packs/manifest.json');
  const search = readJson('assets/packs/search.json');

  assert(manifest.packs, 'manifest.packs missing');
  assert(manifest.jurisdictions, 'manifest.jurisdictions missing');
  assert(search.packs, 'search.packs missing');

  const requiredZips = ['81601', '80525'];
  requiredZips.forEach((zip) => {
    assert(manifest.jurisdictions[zip], `ZIP ${zip} not mapped in manifest`);
  });

  Object.keys(manifest.packs).forEach((packId) => {
    const entry = manifest.packs[packId];
    assert(entry.path, `manifest entry for ${packId} missing path`);
    const fullPackPath = path.join(__dirname, '..', entry.path);
    assert(fs.existsSync(fullPackPath), `pack file missing: ${entry.path}`);
    assert(search.packs[packId], `search index missing pack ${packId}`);
  });

  const fortSearch = search.packs['fort-collins-co-us'];
  assert(fortSearch, 'fort-collins-co-us missing from search index');
  assert(fortSearch.index && fortSearch.index.wire, 'token "wire" missing from Fort Collins index');

  console.log('Smoke test passed');
}

try {
  main();
} catch (error) {
  console.error('Smoke test failed:', error.message);
  process.exit(1);
}
