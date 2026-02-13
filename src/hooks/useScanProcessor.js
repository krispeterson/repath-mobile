import { runAtTargetFps, useFrameProcessor } from "react-native-vision-camera";
import { Worklets } from "react-native-worklets-core";
import { CAMERA_FPS, YOLO_INPUT, YOLO_SCORE_THRESHOLD, resizeFrameToRgb } from "../domain";

const DEBUG_SCAN = true;

const FLOAT_PRESETS = [
  { name: "rgb_0_1", scale: 1 / 255, offset: 0, swapRB: false },
  { name: "rgb_0_255", scale: 1, offset: 0, swapRB: false },
  { name: "bgr_0_1", scale: 1 / 255, offset: 0, swapRB: true },
  { name: "bgr_0_255", scale: 1, offset: 0, swapRB: true },
  { name: "rgb_-1_1", scale: 1 / 127.5, offset: -1, swapRB: false },
  { name: "bgr_-1_1", scale: 1 / 127.5, offset: -1, swapRB: true }
];

export default function useScanProcessor({
  model,
  labelNames,
  scanActive,
  scanMode,
  onDetections,
  onFinalize
}) {
  const runOnDetections = Worklets.createRunOnJS(onDetections);
  const runOnFinalize = Worklets.createRunOnJS(onFinalize);

  return useFrameProcessor(
    (frame) => {
      "worklet";
      if (!scanActive) return;
      if (scanMode !== "capture") return;
      if (!model || model.state !== "loaded" || !model.model) return;
      if (frame.pixelFormat !== "rgb") return;

      runAtTargetFps(CAMERA_FPS, () => {
        "worklet";
        const inputMeta = model?.model?.inputs?.[0] || null;
        const dataType = inputMeta?.dataType || inputMeta?.type || "uint8";
        const expectsFloat = String(dataType).toLowerCase().includes("float");

        function buildInput(preset) {
          if (!expectsFloat) {
            return resizeFrameToRgb(frame, YOLO_INPUT, YOLO_INPUT, false);
          }
          const rgb = resizeFrameToRgb(frame, YOLO_INPUT, YOLO_INPUT, preset.swapRB);
          const out = new Float32Array(rgb.length);
          const scale = preset.scale;
          const offset = preset.offset;
          for (let i = 0; i < rgb.length; i += 1) {
            out[i] = rgb[i] * scale + offset;
          }
          return out;
        }

        function normalizeBox(rawBox) {
          if (!rawBox) return null;
          let { x1, y1, x2, y2 } = rawBox;
          if ([x1, y1, x2, y2].some((v) => Number.isNaN(v) || v === null || v === undefined)) {
            return null;
          }
          const maxVal = Math.max(x1, y1, x2, y2);
          if (maxVal > 1.5) {
            x1 /= YOLO_INPUT;
            y1 /= YOLO_INPUT;
            x2 /= YOLO_INPUT;
            y2 /= YOLO_INPUT;
          }
          const clamp = (v) => Math.max(0, Math.min(1, v));
          const nx1 = clamp(Math.min(x1, x2));
          const ny1 = clamp(Math.min(y1, y2));
          const nx2 = clamp(Math.max(x1, x2));
          const ny2 = clamp(Math.max(y1, y2));
          if (nx2 - nx1 <= 0 || ny2 - ny1 <= 0) return null;
          return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
        }

        function decodeOutput(outputs, names) {
          const detections = [];
          let maxScore = 0;
          let maxClass = -1;

          if (Array.isArray(outputs) && outputs.length > 0) {
            const output = outputs[0];
            const isTyped = ArrayBuffer.isView(output);
            const isNested = Array.isArray(output) && Array.isArray(output[0]);
            const isFlat = isTyped || Array.isArray(output);

            if (isNested && output[0].length === 6) {
              for (let i = 0; i < output.length; i += 1) {
                const row = output[i];
                const score = row[4];
                const classId = Math.round(row[5]);
                const box = normalizeBox({ x1: row[0], y1: row[1], x2: row[2], y2: row[3] });
                if (score > maxScore) { maxScore = score; maxClass = classId; }
                if (classId >= 0 && box) {
                  const name = names[classId] || `class_${classId}`;
                  detections.push({ classId, name, score, box });
                }
              }
            } else if (isFlat && output.length % 6 === 0) {
              const count = output.length / 6;
              for (let i = 0; i < count; i += 1) {
                const offset = i * 6;
                const score = output[offset + 4];
                const classId = Math.round(output[offset + 5]);
                const box = normalizeBox({
                  x1: output[offset + 0],
                  y1: output[offset + 1],
                  x2: output[offset + 2],
                  y2: output[offset + 3]
                });
                if (score > maxScore) { maxScore = score; maxClass = classId; }
                if (classId >= 0 && box) {
                  const name = names[classId] || `class_${classId}`;
                  detections.push({ classId, name, score, box });
                }
              }
            }
          }

          detections.sort((a, b) => b.score - a.score);
          return { detections, maxScore, maxClass };
        }

        const names = Array.isArray(labelNames) ? labelNames : [];
        let decoded = { detections: [], maxScore: 0, maxClass: -1 };
        let usedPreset = "";

        if (expectsFloat) {
          for (let i = 0; i < FLOAT_PRESETS.length; i += 1) {
            const preset = FLOAT_PRESETS[i];
            const outputs = model.model.runSync([buildInput(preset)]);
            decoded = decodeOutput(outputs, names);
            usedPreset = preset.name;
            if (scanMode === "capture" ? decoded.maxScore > 0 : decoded.maxScore >= YOLO_SCORE_THRESHOLD) {
              break;
            }
          }
        } else {
          const outputs = model.model.runSync([buildInput(FLOAT_PRESETS[0])]);
          decoded = decodeOutput(outputs, names);
          usedPreset = "uint8";
        }

        if (DEBUG_SCAN) {
          const name = names[decoded.maxClass] || decoded.maxClass;
          console.log("[TFLite] maxScore:", decoded.maxScore, "class:", name, "preset:", usedPreset);
        }

        if (decoded.detections.length) {
          runOnDetections(decoded.detections.slice(0, 10));
        } else if (scanMode === "capture") {
          runOnDetections([]);
        }

        if (scanMode === "capture") {
          runOnFinalize();
        }
      });
    },
    [scanActive, model?.state, model?.model, labelNames, scanMode, onDetections, onFinalize]
  );
}
