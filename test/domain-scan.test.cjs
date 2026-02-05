const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

function loadModule(relPath) {
  const abs = pathToFileURL(path.join(__dirname, relPath)).href;
  return import(abs);
}

test('resizeFrameToRgb downsamples RGBA to RGB', async () => {
  const { resizeFrameToRgb } = await loadModule('../src/domain/scan.js');
  const frame = {
    width: 2,
    height: 2,
    bytesPerRow: 8,
    toArrayBuffer() {
      // 2x2 RGBA: [R,G,B,A] per pixel
      return new Uint8Array([
        10, 20, 30, 255, 40, 50, 60, 255,
        70, 80, 90, 255, 100, 110, 120, 255
      ]).buffer;
    }
  };

  const out = resizeFrameToRgb(frame, 1, 1, false);
  assert.equal(out.length, 3);
  // Nearest neighbor should pick top-left pixel
  assert.deepEqual(Array.from(out), [10, 20, 30]);
});
