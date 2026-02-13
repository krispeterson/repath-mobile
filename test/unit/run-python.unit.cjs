const assert = require("assert").strict;
const path = require("path");

const { resolvePython } = require("../../scripts/run-python.js");

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

function testResolvePythonPrefersEnvVariable() {
  // Use node executable for deterministic availability in test environment.
  const fakePython = process.execPath;
  withEnv("PYTHON", fakePython, () => {
    const resolved = resolvePython();
    assert.ok(resolved);
    assert.equal(resolved.cmd, fakePython);
  });
}

function testResolvePythonFindsFallbackWhenEnvMissing() {
  withEnv("PYTHON", undefined, () => {
    const resolved = resolvePython();
    assert.ok(resolved);
    assert.ok(typeof resolved.cmd === "string" && resolved.cmd.length > 0);
  });
}

module.exports = {
  cases: [
    { name: "resolvePython prefers PYTHON when set", run: testResolvePythonPrefersEnvVariable },
    { name: "resolvePython returns a fallback executable", run: testResolvePythonFindsFallbackWhenEnvMissing }
  ]
};
