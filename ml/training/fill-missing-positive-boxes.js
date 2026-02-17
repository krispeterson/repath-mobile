#!/usr/bin/env node
const { spawnSync } = require("child_process");

const result = spawnSync(
  "node",
  [
    "scripts/run-python.js",
    "../repath-model/scripts/training/fill_missing_positive_boxes.py",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", cwd: process.cwd(), env: process.env }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
