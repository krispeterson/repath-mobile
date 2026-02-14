#!/usr/bin/env node
const { spawnSync } = require("child_process");

function usage() {
  console.log(
    "Usage: node ml/data/suggest-benchmark-online-bulk.js [--passes 4] [--limit 30] [--start-offset 0] [--timeout-ms 15000] [--max-retries 3] [--disable-adaptive]"
  );
}

function parseArgs(argv) {
  const args = {
    passes: 4,
    limit: 30,
    startOffset: 0,
    timeoutMs: 15000,
    maxRetries: 3,
    adaptive: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--passes") {
      args.passes = Number(argv[++i]);
    } else if (arg === "--limit") {
      args.limit = Number(argv[++i]);
    } else if (arg === "--start-offset") {
      args.startOffset = Number(argv[++i]);
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++i]);
    } else if (arg === "--max-retries") {
      args.maxRetries = Number(argv[++i]);
    } else if (arg === "--disable-adaptive") {
      args.adaptive = false;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.passes) || args.passes < 1) args.passes = 4;
  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 30;
  if (!Number.isFinite(args.startOffset) || args.startOffset < 0) args.startOffset = 0;
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) args.timeoutMs = 15000;
  if (!Number.isFinite(args.maxRetries) || args.maxRetries < 1) args.maxRetries = 3;

  return args;
}

function runPass(offset, args) {
  const cmdArgs = [
    "ml/data/suggest-benchmark-online.js",
    "--merge-into",
    "test/benchmarks/benchmark-labeled.csv",
    "--out",
    "test/benchmarks/benchmark-labeled.online.csv",
    "--offset",
    String(offset),
    "--limit",
    String(args.limit),
    "--timeout-ms",
    String(args.timeoutMs),
    "--max-retries",
    String(args.maxRetries)
  ];

  const result = spawnSync("node", cmdArgs, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`online suggestion pass failed at offset=${offset}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const offsets = [];

  for (let i = 0; i < args.passes; i += 1) {
    if (args.adaptive) {
      offsets.push(args.startOffset);
    } else {
      offsets.push(args.startOffset + i * args.limit);
    }
  }

  offsets.forEach((offset, idx) => {
    console.log(`\n== Online bulk pass ${idx + 1}/${offsets.length} (offset=${offset}, limit=${args.limit}) ==`);
    runPass(offset, args);
  });

  console.log("\nOnline bulk suggestion complete.");
  console.log(
    JSON.stringify(
      {
        passes: args.passes,
        limit: args.limit,
        offsets
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
