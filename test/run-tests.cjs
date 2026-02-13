const path = require("path");
const fs = require("fs");

const orderedSuites = ["unit", "integration", "acceptance"];

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

  for (const suiteName of orderedSuites) {
    const suiteFiles = discoverSuiteFiles(suiteName);
    for (const file of suiteFiles) {
      const cases = loadCases(file);
      console.log(`\n[${suiteName}] ${file}`);
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
  }

  console.log(`\nTest summary: ${total - failed}/${total} passed`);
  if (failed > 0) process.exit(1);
}

function discoverSuiteFiles(suiteName) {
  const suiteRoot = path.join(__dirname, suiteName);
  if (!fs.existsSync(suiteRoot)) return [];
  const files = collectFiles(suiteRoot);
  return files
    .filter((absolutePath) => absolutePath.endsWith(`.${suiteName}.cjs`))
    .map((absolutePath) => path.relative(__dirname, absolutePath))
    .sort();
}

function collectFiles(rootDir) {
  const out = [];
  const entries = fs.readdirSync(rootDir);
  entries.forEach((entry) => {
    const absolutePath = path.join(rootDir, entry);
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      collectFiles(absolutePath).forEach((nested) => out.push(nested));
    } else {
      out.push(absolutePath);
    }
  });
  return out;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
