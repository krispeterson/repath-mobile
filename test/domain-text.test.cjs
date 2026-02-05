const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

function loadModule(relPath) {
  const abs = pathToFileURL(path.join(__dirname, relPath)).href;
  return import(abs);
}

test('normalizeToken removes simple plurals', async () => {
  const { normalizeToken } = await loadModule('../src/domain/text.js');
  assert.equal(normalizeToken('bottles'), 'bottl');
  assert.equal(normalizeToken('cats'), 'cat');
  assert.equal(normalizeToken('glass'), 'glas');
});

test('tokenize splits, normalizes, and lowercases', async () => {
  const { tokenize } = await loadModule('../src/domain/text.js');
  const tokens = tokenize('Tin Cans, Bottles & Glass!');
  assert.deepEqual(tokens, ['tin', 'can', 'bottl', 'glas']);
});
