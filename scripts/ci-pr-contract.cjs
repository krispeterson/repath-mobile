#!/usr/bin/env node

const fs = require("fs");

function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(eventPath, "utf8"));
}

function appendStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${markdown}\n`);
}

function main() {
  const payload = readEventPayload();
  const strict = String(process.env.REPATH_PM_STRICT || "false").toLowerCase() === "true";

  if (!payload || !payload.pull_request) {
    console.log("[pm-contract] No pull request payload detected. Skipping.");
    return;
  }

  const body = String(payload.pull_request.body || "");

  const checks = {
    linkedIssue: /(closes|fixes|resolves)\s+#\d+|issues?:\s*#\d+/i.test(body),
    acceptanceCriteria: /##\s*Acceptance Criteria/i.test(body),
    agentReviews: /##\s*Agent Reviews/i.test(body)
  };

  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  const md = [
    "## PM Contract Check",
    "",
    `- Strict mode: \`${strict}\``,
    `- linkedIssue: ${checks.linkedIssue ? "pass" : "missing"}`,
    `- acceptanceCriteria: ${checks.acceptanceCriteria ? "pass" : "missing"}`,
    `- agentReviews: ${checks.agentReviews ? "pass" : "missing"}`
  ].join("\n");

  console.log(md);
  appendStepSummary(md);

  if (failed.length) {
    const message = `[pm-contract] Missing PR template sections: ${failed.join(", ")}`;
    if (strict) {
      console.error(message);
      process.exit(1);
    }
    console.warn(`${message} (advisory mode)`);
  }
}

main();
