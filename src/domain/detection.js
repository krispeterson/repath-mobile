import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";

const INPUT_PRESETS = [
  { name: "rgb_0_1", scale: 1 / 255, offset: 0, swapRB: false },
  { name: "rgb_0_255", scale: 1, offset: 0, swapRB: false },
  { name: "bgr_0_1", scale: 1 / 255, offset: 0, swapRB: true }
];

export async function loadImageUriAsRgb(uri, inputSize) {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: inputSize, height: inputSize } }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) {
    throw new Error("Failed to load image data.");
  }

  const jpegData = Buffer.from(manipulated.base64, "base64");
  const decoded = jpeg.decode(jpegData, { useTArray: true });
  if (!decoded || !decoded.data) {
    throw new Error("Failed to decode image.");
  }

  const pixelCount = (decoded.width || inputSize) * (decoded.height || inputSize);
  const rgb = new Uint8Array(pixelCount * 3);
  const rgba = decoded.data;
  for (let srcOffset = 0, dstOffset = 0; srcOffset < rgba.length; srcOffset += 4, dstOffset += 3) {
    rgb[dstOffset] = rgba[srcOffset];
    rgb[dstOffset + 1] = rgba[srcOffset + 1];
    rgb[dstOffset + 2] = rgba[srcOffset + 2];
  }
  return rgb;
}

export function runDetectionWithBestPreset({
  model,
  labels,
  rgb,
  scoreThreshold,
  inputSize
}) {
  const inputMeta = (model.inputs && model.inputs[0]) || {};
  const expectsFloat = String(inputMeta.dataType || inputMeta.type || "uint8").toLowerCase().includes("float");
  const presets = expectsFloat ? INPUT_PRESETS : [{ name: "uint8", scale: 1, offset: 0, swapRB: false }];

  let bestDetections = [];
  for (let i = 0; i < presets.length; i += 1) {
    const preset = presets[i];
    const input = buildModelInput(rgb, expectsFloat, preset);
    const outputs = model.runSync([input]);
    const detections = decodeModelOutputs(outputs, labels, inputSize);
    const topScore = getTopScore(detections);
    const bestTopScore = getTopScore(bestDetections);
    if (!bestDetections.length || topScore > bestTopScore) {
      bestDetections = detections;
    }
    if (topScore >= scoreThreshold) {
      break;
    }
  }
  return bestDetections;
}

export function decodeModelOutputs(outputs, names, inputSize) {
  const detections = [];
  if (!Array.isArray(outputs) || outputs.length === 0) return detections;

  const output = outputs[0];
  const isNested = Array.isArray(output) && Array.isArray(output[0]);
  const isFlat = ArrayBuffer.isView(output) || Array.isArray(output);

  if (isNested && output[0].length === 6) {
    for (let i = 0; i < output.length; i += 1) {
      appendDetection(detections, output[i][0], output[i][1], output[i][2], output[i][3], output[i][4], Math.round(output[i][5]), names, inputSize);
    }
  } else if (isFlat && output.length % 6 === 0) {
    const count = output.length / 6;
    for (let i = 0; i < count; i += 1) {
      const offset = i * 6;
      appendDetection(
        detections,
        output[offset + 0],
        output[offset + 1],
        output[offset + 2],
        output[offset + 3],
        output[offset + 4],
        Math.round(output[offset + 5]),
        names,
        inputSize
      );
    }
  }

  detections.sort((a, b) => b.score - a.score);
  return detections;
}

function buildModelInput(rgb, expectsFloat, preset) {
  if (!expectsFloat) return rgb;

  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    let r = rgb[i];
    const g = rgb[i + 1];
    let b = rgb[i + 2];
    if (preset.swapRB) {
      const tmp = r;
      r = b;
      b = tmp;
    }
    out[i] = r * preset.scale + preset.offset;
    out[i + 1] = g * preset.scale + preset.offset;
    out[i + 2] = b * preset.scale + preset.offset;
  }
  return out;
}

function appendDetection(list, x1, y1, x2, y2, score, classId, names, inputSize) {
  if (classId < 0) return;
  const box = normalizeBox({ x1, y1, x2, y2 }, inputSize);
  if (!box) return;
  list.push({
    classId,
    name: names[classId] || `class_${classId}`,
    score,
    box
  });
}

function normalizeBox(rawBox, inputSize) {
  if (!rawBox) return null;
  let { x1, y1, x2, y2 } = rawBox;
  if ([x1, y1, x2, y2].some((value) => Number.isNaN(value) || value == null)) {
    return null;
  }
  if (Math.max(x1, y1, x2, y2) > 1.5) {
    x1 /= inputSize;
    y1 /= inputSize;
    x2 /= inputSize;
    y2 /= inputSize;
  }

  const left = clamp(Math.min(x1, x2));
  const top = clamp(Math.min(y1, y2));
  const right = clamp(Math.max(x1, x2));
  const bottom = clamp(Math.max(y1, y2));
  if (right - left <= 0 || bottom - top <= 0) return null;

  return { x1: left, y1: top, x2: right, y2: bottom };
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function getTopScore(detections) {
  if (!Array.isArray(detections) || detections.length === 0) return 0;
  const top = detections[0];
  if (!top || typeof top.score !== "number") return 0;
  return top.score;
}
