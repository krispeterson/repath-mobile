const assert = require("assert").strict;
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFileSync } = require("child_process");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasCurbsideCard(item) {
  const cards = Array.isArray(item.option_cards) ? item.option_cards : [];
  return cards.some((card) => card && card.kind === "curbside_recycle");
}

async function testCurbsideAssetBuilderOutputsConsistentFiles() {
  const projectRoot = path.join(__dirname, "..", "..");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repath-curbside-test-"));
  try {
    execFileSync("node", ["scripts/build-poc-curbside-assets.js", "--out-dir", tmpDir], {
      cwd: projectRoot,
      stdio: "pipe"
    });

    const classesPath = path.join(tmpDir, "poc-curbside.classes.json");
    const mapPath = path.join(tmpDir, "poc-curbside.label-map.json");
    assert.ok(fs.existsSync(classesPath));
    assert.ok(fs.existsSync(mapPath));

    const classes = readJson(classesPath);
    const labelMap = readJson(mapPath);
    const packManifest = readJson(path.join(projectRoot, "assets/packs/manifest.json"));
    const packEntry = packManifest.packs[labelMap.pack_id];
    assert.ok(packEntry && packEntry.path, `pack not found in manifest: ${labelMap.pack_id}`);
    const pack = readJson(path.join(projectRoot, packEntry.path));

    assert.equal(labelMap.pack_id, pack.pack_id);
    assert.equal(Object.keys(labelMap.labels_to_item_ids).length, classes.length);

    classes.forEach((label) => {
      const itemId = labelMap.labels_to_item_ids[label];
      assert.ok(itemId, `missing mapped item for label: ${label}`);
      const item = pack.items.find((entry) => entry.id === itemId);
      assert.ok(item, `missing item id in pack: ${itemId}`);
      assert.ok(hasCurbsideCard(item), `mapped item is not curbside_recycle: ${itemId}`);
    });
  } finally {
    removeDirRecursive(tmpDir);
  }
}

module.exports = {
  cases: [
    { name: "build-poc-curbside-assets generates valid class and label-map files", run: testCurbsideAssetBuilderOutputsConsistentFiles }
  ]
};

function removeDirRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const entries = fs.readdirSync(targetPath);
  entries.forEach((entry) => {
    const fullPath = path.join(targetPath, entry);
    const stat = fs.lstatSync(fullPath);
    if (stat.isDirectory()) {
      removeDirRecursive(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  });
  fs.rmdirSync(targetPath);
}
