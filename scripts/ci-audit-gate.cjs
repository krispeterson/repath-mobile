#!/usr/bin/env node

const fs = require("fs");

const ORDER = ["info", "low", "moderate", "high", "critical"];
const LEVEL_INDEX = ORDER.reduce((acc, level, idx) => {
  acc[level] = idx;
  return acc;
}, {});

function parseArgs() {
  const jsonPath = process.argv[2] || "audit.json";
  const failLevel = String(process.argv[3] || "critical").toLowerCase();
  return { jsonPath, failLevel };
}

function readAudit(jsonPath) {
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (error) {
    console.error(`[audit-gate] Could not read ${jsonPath}: ${error.message}`);
    process.exit(1);
  }
}

function normalizeCounts(data) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  const fromMeta = data && data.metadata && data.metadata.vulnerabilities;

  if (fromMeta && typeof fromMeta === "object") {
    for (const level of Object.keys(counts)) {
      counts[level] = Number(fromMeta[level] || 0);
    }
    return counts;
  }

  const fromVulns = data && data.vulnerabilities;
  if (fromVulns && typeof fromVulns === "object") {
    for (const vulnName of Object.keys(fromVulns)) {
      const vuln = fromVulns[vulnName] || {};
      const level = String(vuln.severity || "").toLowerCase();
      if (counts[level] !== undefined) {
        counts[level] += 1;
      }
    }
  }

  return counts;
}

function countAtOrAbove(counts, failLevel) {
  const threshold = LEVEL_INDEX[failLevel];
  if (threshold === undefined) return 0;
  return ORDER.reduce((sum, level) => {
    if (LEVEL_INDEX[level] >= threshold) {
      return sum + Number(counts[level] || 0);
    }
    return sum;
  }, 0);
}

function appendStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${markdown}\n`);
}

function main() {
  const { jsonPath, failLevel } = parseArgs();
  const data = readAudit(jsonPath);
  const counts = normalizeCounts(data);

  const md = [
    "## DevSecOps Audit Summary",
    "",
    `- Source: \`${jsonPath}\``,
    `- Gate level: \`${failLevel}\``,
    "",
    "| Severity | Count |",
    "|---|---:|",
    `| critical | ${counts.critical} |`,
    `| high | ${counts.high} |`,
    `| moderate | ${counts.moderate} |`,
    `| low | ${counts.low} |`,
    `| info | ${counts.info} |`
  ].join("\n");

  console.log(md);
  appendStepSummary(md);

  if (failLevel === "off") {
    console.log("[audit-gate] Gate disabled (off).");
    return;
  }

  if (LEVEL_INDEX[failLevel] === undefined) {
    console.error(`[audit-gate] Unsupported fail level: ${failLevel}`);
    process.exit(1);
  }

  const totalFailing = countAtOrAbove(counts, failLevel);
  if (totalFailing > 0) {
    console.error(`[audit-gate] Found ${totalFailing} vulnerabilities at or above ${failLevel}.`);
    process.exit(1);
  }

  console.log(`[audit-gate] Passed: no vulnerabilities at or above ${failLevel}.`);
}

main();
