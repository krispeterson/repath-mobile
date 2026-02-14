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

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function mapLabelsToItems(labels, packId, pack, searchIndex) {
  const packSearch = searchIndex.packs && searchIndex.packs[packId];
  if (!packSearch || !packSearch.index) return [];

  const scores = {};
  labels.forEach((label) => {
    const tokens = tokenize(label);
    tokens.forEach((token) => {
      const ids = packSearch.index[token] || [];
      ids.forEach((id) => {
        scores[id] = (scores[id] || 0) + 1;
      });
    });
  });

  const ranked = Object.keys(scores)
    .map((id) => ({ id, score: scores[id] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return ranked
    .map((entry) => (pack.items || []).find((item) => item.id === entry.id))
    .filter(Boolean);
}

function resolveDefaultPackId(manifest) {
  const packIds = Object.keys((manifest && manifest.packs) || {}).sort();
  if (!packIds.length) {
    throw new Error('manifest.packs is empty');
  }
  return packIds[0];
}

function main() {
  const manifest = readJson('assets/packs/manifest.json');
  const search = readJson('assets/packs/search.json');

  assert(manifest.packs, 'manifest.packs missing');
  assert(manifest.jurisdictions, 'manifest.jurisdictions missing');
  assert(search.packs, 'search.packs missing');

  const zipCodes = Object.keys(manifest.jurisdictions || {});
  assert(zipCodes.length > 0, "manifest.jurisdictions is empty");

  Object.keys(manifest.packs).forEach((packId) => {
    const entry = manifest.packs[packId];
    assert(entry.path, `manifest entry for ${packId} missing path`);
    const fullPackPath = path.join(__dirname, '..', entry.path);
    assert(fs.existsSync(fullPackPath), `pack file missing: ${entry.path}`);
    assert(search.packs[packId], `search index missing pack ${packId}`);
  });

  const packId = resolveDefaultPackId(manifest);
  const packSearch = search.packs[packId];
  assert(packSearch, `${packId} missing from search index`);
  assert(packSearch.index && packSearch.index.wire, `token "wire" missing from ${packId} index`);

  const packPath = manifest.packs[packId].path;
  const pack = readJson(packPath);
  const mapped = mapLabelsToItems(['wire'], packId, pack, search);
  assert(mapped.length > 0, 'label mapping did not return any items');

  console.log('Smoke test passed');
}

try {
  main();
} catch (error) {
  console.error('Smoke test failed:', error.message);
  process.exit(1);
}
