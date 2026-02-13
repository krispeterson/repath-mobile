const assert = require("assert").strict;
const path = require("path");
const { pathToFileURL } = require("url");

async function loadScanModule() {
  const url = pathToFileURL(path.join(__dirname, "..", "..", "src/domain/scan.js")).href;
  return import(url);
}

function makeFrame(width, height) {
  const pixels = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels.push(x * 30 + 10, y * 30 + 20, (x + y) * 20 + 30, 255);
    }
  }
  return {
    width,
    height,
    bytesPerRow: width * 4,
    toArrayBuffer() {
      return new Uint8Array(pixels).buffer;
    }
  };
}

function expectedTopLeftRgb(frameWidth, frameHeight, swapRB) {
  const r = 10;
  const g = 20;
  const b = 30;
  if (swapRB) return [b, g, r];
  return [r, g, b];
}

function createResizeCase(targetWidth, targetHeight, swapRB) {
  return {
    name: `resizeFrameToRgb ${targetWidth}x${targetHeight} swapRB=${swapRB}`,
    async run() {
      const { resizeFrameToRgb } = await loadScanModule();
      const frame = makeFrame(4, 4);
      const out = resizeFrameToRgb(frame, targetWidth, targetHeight, swapRB);
      assert.equal(out.length, targetWidth * targetHeight * 3);
      assert.deepEqual(Array.from(out.slice(0, 3)), expectedTopLeftRgb(4, 4, swapRB));
    }
  };
}

function createFloatCase(targetWidth, targetHeight, swapRB) {
  return {
    name: `resizeFrameToRgbFloat ${targetWidth}x${targetHeight} swapRB=${swapRB}`,
    async run() {
      const { resizeFrameToRgbFloat } = await loadScanModule();
      const frame = makeFrame(2, 2);
      const out = resizeFrameToRgbFloat(frame, targetWidth, targetHeight, swapRB);
      assert.equal(out.length, targetWidth * targetHeight * 3);
      const firstPixel = Array.from(out.slice(0, 3));
      const expected = expectedTopLeftRgb(2, 2, swapRB).map((v) => v / 255);
      assert.ok(Math.abs(firstPixel[0] - expected[0]) < 1e-6);
      assert.ok(Math.abs(firstPixel[1] - expected[1]) < 1e-6);
      assert.ok(Math.abs(firstPixel[2] - expected[2]) < 1e-6);
    }
  };
}

const resizeCases = [];
for (let w = 1; w <= 5; w += 1) {
  for (let h = 1; h <= 3; h += 1) {
    resizeCases.push(createResizeCase(w, h, false));
    resizeCases.push(createResizeCase(w, h, true));
  }
}

const floatCases = [];
for (let w = 1; w <= 3; w += 1) {
  for (let h = 1; h <= 2; h += 1) {
    floatCases.push(createFloatCase(w, h, false));
    floatCases.push(createFloatCase(w, h, true));
  }
}

module.exports = {
  cases: [...resizeCases, ...floatCases]
};
