const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadTheme() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src", "ui", "theme.js")).href;
  return import(url);
}

module.exports = {
  cases: [
    {
      name: "getThemeColors returns dark palette when scheme is dark",
      async run() {
        const { getThemeColors } = await loadTheme();
        const colors = getThemeColors("dark");
        assert.equal(colors.background, "#0B1220");
        assert.equal(colors.textPrimary, "#F3F4F6");
      }
    },
    {
      name: "getThemeColors falls back to light palette",
      async run() {
        const { getThemeColors } = await loadTheme();
        const light = getThemeColors("light");
        const fallback = getThemeColors();
        assert.equal(light.background, "#F9FAFB");
        assert.equal(light.textPrimary, "#0B0F1A");
        assert.deepEqual(fallback, light);
      }
    }
  ]
};
