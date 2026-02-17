#!/usr/bin/env node

const lifecycle = process.env.npm_lifecycle_event || "this command";
const modelRepo = process.env.REPATH_MODEL_DIR || "../repath-model";

console.error(`${lifecycle} has moved out of repath-mobile.`);
console.error(`Run model training/evaluation/release workflows from ${modelRepo}.`);
console.error("See repath-model/README.md for workflow commands and notebooks.");
console.error("repath-mobile should only consume published model releases via npm run pull:model:release.");
process.exit(1);
