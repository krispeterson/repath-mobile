const path = require("path");

const suites = [
  { name: "unit", file: "./unit/run-python.unit.cjs" },
  { name: "unit", file: "./unit/text.unit.cjs" },
  { name: "unit", file: "./unit/scan.unit.cjs" },
  { name: "unit", file: "./unit/search-core.unit.cjs" },
  { name: "integration", file: "./integration/curbside-data.integration.cjs" },
  { name: "integration", file: "./integration/search-resolution.integration.cjs" },
  { name: "acceptance", file: "./acceptance/curbside-assets.acceptance.cjs" }
];

function loadCases(relativeFile) {
  const modulePath = path.join(__dirname, relativeFile);
  const mod = require(modulePath);
  if (!Array.isArray(mod.cases)) {
    throw new Error(`${relativeFile} must export a 'cases' array`);
  }
  return mod.cases;
}

async function run() {
  let failed = 0;
  let total = 0;

  for (const suite of suites) {
    const cases = loadCases(suite.file);
    console.log(`\n[${suite.name}]`);
    for (const testCase of cases) {
      total += 1;
      const name = (testCase && testCase.name) || "unnamed";
      const fn = testCase && testCase.run;
      if (typeof fn !== "function") {
        failed += 1;
        console.log(`  [FAIL] ${name}`);
        console.log("    missing run() function");
        continue;
      }
      try {
        await fn();
        console.log(`  [PASS] ${name}`);
      } catch (error) {
        failed += 1;
        console.log(`  [FAIL] ${name}`);
        console.log(`    ${error && error.message ? error.message : String(error)}`);
      }
    }
  }

  console.log(`\nTest summary: ${total - failed}/${total} passed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
