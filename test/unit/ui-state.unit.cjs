const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadUiState() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src", "domain", "ui-state.js")).href;
  return import(url);
}

module.exports = {
  cases: [
    {
      name: "resolveScanSupportedExamples prefers known priority labels",
      async run() {
        const { resolveScanSupportedExamples } = await loadUiState();
        const labels = [
          "Paperboard",
          "Vitamin or Prescription Bottle",
          "Tin Can",
          "Cardboard",
          "Aluminum Can"
        ];
        const result = resolveScanSupportedExamples(labels, 4);
        assert.deepEqual(result, ["Tin Can", "Aluminum Can", "Cardboard", "Paperboard"]);
      }
    },
    {
      name: "resolveScanSupportedExamples falls back to available labels when priorities are missing",
      async run() {
        const { resolveScanSupportedExamples } = await loadUiState();
        const labels = ["Custom One", "Custom Two", "Custom Three"];
        const result = resolveScanSupportedExamples(labels, 4);
        assert.deepEqual(result, ["Custom One", "Custom Two", "Custom Three"]);
      }
    },
    {
      name: "resolveScanSupportedExamples ignores empty labels and enforces max",
      async run() {
        const { resolveScanSupportedExamples } = await loadUiState();
        const labels = ["", "Tin Can", "  ", null, "Cardboard", "Paperboard", "Pizza Box"];
        const result = resolveScanSupportedExamples(labels, 2);
        assert.deepEqual(result, ["Tin Can", "Cardboard"]);
      }
    },
    {
      name: "shouldShowScanNotice reflects first-use behavior",
      async run() {
        const { shouldShowScanNotice } = await loadUiState();
        assert.equal(shouldShowScanNotice(false), true);
        assert.equal(shouldShowScanNotice(true), false);
      }
    },
    {
      name: "resolveRotatingQuickTip selects a deterministic tip by day",
      async run() {
        const { resolveRotatingQuickTip } = await loadUiState();
        const tips = [
          { id: "one", category: "A", text: "tip one" },
          { id: "two", category: "B", text: "tip two" },
          { id: "three", category: "C", text: "tip three" }
        ];
        const result = resolveRotatingQuickTip(new Date("2026-02-19T12:00:00Z"), tips);
        assert.deepEqual(result, tips[1]);
      }
    },
    {
      name: "resolveRotatingQuickTip returns null when no valid tips exist",
      async run() {
        const { resolveRotatingQuickTip } = await loadUiState();
        assert.equal(resolveRotatingQuickTip(new Date("2026-02-19T00:00:00Z"), []), null);
        assert.equal(resolveRotatingQuickTip(new Date("2026-02-19T00:00:00Z"), [{ id: "", category: "", text: "" }]), null);
      }
    }
  ]
};
