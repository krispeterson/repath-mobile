import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useTensorflowModel } from "react-native-fast-tflite";
import yoloLabels from "../assets/models/yolov8.labels.json";
import { OnboardScreen, ZipScreen } from "./components";
import { colors, spacing } from "./ui/theme";
import { HomeScreen, ScanScreen } from "./screens";
import { getBundledPack, resolvePackFromZip, resolveDetectedLabelsToItems, resolveItem, YOLO_SCORE_THRESHOLD, YOLO_INPUT } from "./domain";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";

export default function App() {
  const [step, setStep] = useState("onboard");
  const [zip, setZip] = useState("");
  const [packId, setPackId] = useState(null);
  const [pack, setPack] = useState(null);
  const [query, setQuery] = useState("cardboard");
  const [results, setResults] = useState([]);
  const [zipError, setZipError] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [scanLabels, setScanLabels] = useState([]);
  const [scanDetections, setScanDetections] = useState([]);
  const [scanActive, setScanActive] = useState(false);
  const [scanItems, setScanItems] = useState([]);
  const [scanMessage, setScanMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [captureUri, setCaptureUri] = useState(null);
  const [captureSize, setCaptureSize] = useState(null);
  const [hasCapture, setHasCapture] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const MIN_DETECTION_SCORE = YOLO_SCORE_THRESHOLD;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef(null);
  const model = useTensorflowModel(require("../assets/models/yolov8.tflite"));

  useEffect(() => {
    if (model.state === "loaded") {
      debugLogModel();
    }
  }, [model.state]);


  function debugLogModel() {
    if (model.state !== "loaded" || !model.model) return;
    try {
      console.log("[TFLite] Model keys:", Object.keys(model.model));
      console.log("[TFLite] Inputs:", model.model.inputs || []);
      console.log("[TFLite] Outputs:", model.model.outputs || []);
    } catch (error) {
      console.log("[TFLite] Tensor info unavailable", error);
    }
  }

  async function requestLocation() {
    setLocationError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationError("Location permission was denied.");
      setStep("enter_zip");
      return;
    }

    try {
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude
      });
      const postal = place && place.postalCode ? String(place.postalCode) : "";
      if (!postal) {
        setLocationError("Couldn't determine your ZIP code.");
        setStep("enter_zip");
        return;
      }
      setZip(postal);
      chooseZip(postal);
    } catch (error) {
      setLocationError("Unable to access current location.");
      setStep("enter_zip");
    }
  }

  function chooseZip(nextZip) {
    const zipValue = String(nextZip !== undefined ? nextZip : zip).trim();
    if (!zipValue) {
      setZipError("Enter a ZIP code.");
      setPackId(null);
      setPack(null);
      return;
    }
    if (!/^\d{5}$/.test(zipValue)) {
      setZipError("Enter a valid 5-digit ZIP.");
      setPackId(null);
      setPack(null);
      return;
    }

    const pid = resolvePackFromZip(zipValue);
    if (!pid) {
      setZipError("No pack available for that ZIP yet.");
      setPackId(null);
      setPack(null);
      setStep("enter_zip");
      return;
    }

    const p = getBundledPack(pid);
    setZipError(null);
    setPackId(pid);
    setPack(p);
    setStep(p ? "home" : "enter_zip");
  }

  function runSearch() {
    if (!pack || !packId) return;
    setResults(resolveItem(pack, packId, query));
  }

  async function startScan() {
    setScanError(null);
    setScanLabels([]);
    setScanDetections([]);
    setScanItems([]);
    setScanMessage(null);
    setIsProcessing(false);
    setCaptureUri(null);
    setCaptureSize(null);
    setHasCapture(false);
    setIsCapturing(false);

    if (!pack || !packId) {
      setScanError("Choose a location first.");
      return;
    }

    if (!hasPermission) {
      const permission = await requestPermission();
      if (!permission) {
        setScanError("Camera permission was denied.");
        return;
      }
    }

    if (!device) {
      setScanError("No camera device available.");
      return;
    }

    if (model.state !== "loaded") {
      setScanError("Model not loaded. Ensure yolov8.tflite is bundled.");
      return;
    }
    debugLogModel();

    setScanActive(true);
    setStep("scan");
  }

  const handleDetections = (detections) => {
    setIsProcessing(false);
    const list = Array.isArray(detections) ? detections : [];
    const filtered = list.filter((det) => det && typeof det.score === "number" && det.score >= MIN_DETECTION_SCORE);
    if (filtered.length) {
      const top = filtered.slice(0, 5).map((det) => `${det.name}:${(det.score * 100).toFixed(1)}%`);
      console.log("[TFLite] top detections:", top.join(", "));
    } else {
      console.log("[TFLite] no detections");
    }
    const labels = list
      .filter((d) => d && d.name && d.score >= YOLO_SCORE_THRESHOLD)
      .map((d) => d.name);
    const uniqueLabels = Array.from(new Set(labels)).slice(0, 5);
    setScanLabels(uniqueLabels);
    setScanDetections(filtered);
    const items = resolveDetectedLabelsToItems(uniqueLabels, packId, pack);
    setScanItems(items);
    if (!uniqueLabels.length) {
      setScanMessage("No objects detected. Can you or someone else reuse it or compost it? If not, put it in the trash.");
    } else if (!items.length) {
      setScanMessage("We couldn't match this confidently. Can you or someone else reuse it or compost it? If not, put it in the trash.");
    } else {
      setScanMessage(null);
    }
  };

  function retakeScan() {
    setScanActive(true);
    setScanLabels([]);
    setScanDetections([]);
    setScanItems([]);
    setScanMessage(null);
    setIsProcessing(false);
    setCaptureUri(null);
    setCaptureSize(null);
    setHasCapture(false);
    setIsCapturing(false);
  }

  async function triggerScanOnce() {
    if (isCapturing) return;
    setIsCapturing(true);
    setScanActive(true);
    setScanMessage(null);
    setCaptureUri(null);
    setCaptureSize(null);
    setHasCapture(false);
    setIsProcessing(true);
    try {
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePhoto();
        if (photo?.path) {
          const uri = `file://${photo.path}`;
          setCaptureUri(uri);
          if (photo.width && photo.height) {
            setCaptureSize({ width: photo.width, height: photo.height });
          }
          setScanMessage(null);
          setHasCapture(true);
          setScanActive(false);
          await runDetectionOnImage(uri);
        }
      }
    } catch (error) {
      setIsProcessing(false);
      if (!captureUri) {
        setScanMessage("Capture failed. Please try again.");
      }
    } finally {
      setIsCapturing(false);
    }
  }

  function decodeModelOutputs(outputs, names) {
    const detections = [];
    if (!Array.isArray(outputs) || outputs.length === 0) return detections;
    const output = outputs[0];
    const isTyped = ArrayBuffer.isView(output);
    const isNested = Array.isArray(output) && Array.isArray(output[0]);
    const isFlat = isTyped || Array.isArray(output);
    const normalizeBox = (raw) => {
      if (!raw) return null;
      let { x1, y1, x2, y2 } = raw;
      if ([x1, y1, x2, y2].some((v) => Number.isNaN(v) || v === null || v === undefined)) return null;
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
    };

    const pushDetection = (x1, y1, x2, y2, score, classId) => {
      const box = normalizeBox({ x1, y1, x2, y2 });
      if (!box) return;
      const name = names[classId] || `class_${classId}`;
      detections.push({ classId, name, score, box });
    };

    if (isNested && output[0].length === 6) {
      for (let i = 0; i < output.length; i += 1) {
        const row = output[i];
        const score = row[4];
        const classId = Math.round(row[5]);
        if (classId >= 0) pushDetection(row[0], row[1], row[2], row[3], score, classId);
      }
    } else if (isFlat && output.length % 6 === 0) {
      const count = output.length / 6;
      for (let i = 0; i < count; i += 1) {
        const offset = i * 6;
        const score = output[offset + 4];
        const classId = Math.round(output[offset + 5]);
        if (classId >= 0) {
          pushDetection(
            output[offset + 0],
            output[offset + 1],
            output[offset + 2],
            output[offset + 3],
            score,
            classId
          );
        }
      }
    }

    detections.sort((a, b) => b.score - a.score);
    return detections;
  }

  async function runDetectionOnImage(uri) {
    if (!model || model.state !== "loaded" || !model.model) {
      setScanError("Model not loaded. Ensure yolov8.tflite is bundled.");
      return;
    }
    setIsProcessing(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: YOLO_INPUT, height: YOLO_INPUT } }],
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
      const rgb = new Uint8Array((decoded.width || YOLO_INPUT) * (decoded.height || YOLO_INPUT) * 3);
      const src = decoded.data;
      for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
        rgb[j] = src[i];
        rgb[j + 1] = src[i + 1];
        rgb[j + 2] = src[i + 2];
      }

      const inputMeta = model.model.inputs?.[0] || {};
      const dataType = inputMeta.dataType || inputMeta.type || "uint8";
      const expectsFloat = String(dataType).toLowerCase().includes("float");
      const presets = expectsFloat
        ? [
            { name: "rgb_0_1", scale: 1 / 255, offset: 0, swapRB: false },
            { name: "rgb_0_255", scale: 1, offset: 0, swapRB: false },
            { name: "bgr_0_1", scale: 1 / 255, offset: 0, swapRB: true }
          ]
        : [{ name: "uint8", scale: 1, offset: 0, swapRB: false }];

      let outputs = null;
      let bestDetections = [];
      for (let i = 0; i < presets.length; i += 1) {
        const preset = presets[i];
        let input = rgb;
        if (expectsFloat) {
          const floatInput = new Float32Array(rgb.length);
          for (let j = 0; j < rgb.length; j += 3) {
            let r = rgb[j];
            const g = rgb[j + 1];
            let b = rgb[j + 2];
            if (preset.swapRB) {
              const tmp = r;
              r = b;
              b = tmp;
            }
            floatInput[j] = r * preset.scale + preset.offset;
            floatInput[j + 1] = g * preset.scale + preset.offset;
            floatInput[j + 2] = b * preset.scale + preset.offset;
          }
          input = floatInput;
        }
        outputs = model.model.runSync([input]);
        const trial = decodeModelOutputs(outputs, Array.isArray(yoloLabels) ? yoloLabels : []);
        if (!bestDetections.length || (trial[0]?.score || 0) > (bestDetections[0]?.score || 0)) {
          bestDetections = trial;
        }
        if ((trial[0]?.score || 0) >= YOLO_SCORE_THRESHOLD) {
          break;
        }
      }

      const names = Array.isArray(yoloLabels) ? yoloLabels : [];
      const detections = (bestDetections.length ? bestDetections : decodeModelOutputs(outputs, names)).slice(0, 10);
      handleDetections(detections);
    } catch (error) {
      setScanMessage("Photo processing failed. Try another image.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function pickPhoto() {
    setScanError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setScanError("Photo library permission was denied.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1
    });
    if (result.canceled) return;
    const asset = result.assets && result.assets[0];
    if (!asset?.uri) return;

    setScanActive(false);
    setCaptureUri(asset.uri);
    if (asset.width && asset.height) {
      setCaptureSize({ width: asset.width, height: asset.height });
    }
    setHasCapture(true);
    setScanLabels([]);
    setScanDetections([]);
    setScanItems([]);
    setScanMessage(null);
    await runDetectionOnImage(asset.uri);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.snow }}>
      {step === "onboard" && (
        <OnboardScreen
          onLocation={requestLocation}
          onEnterZip={() => setStep("enter_zip")}
        />
      )}

      {step === "enter_zip" && (
        <ZipScreen
          zip={zip}
          zipError={zipError}
          locationError={locationError}
          onZipChange={(text) => {
            setZip(text);
            setZipError(null);
          }}
          onContinue={() => chooseZip()}
          onLocation={requestLocation}
        />
      )}

      {step === "home" && pack && (
        <HomeScreen
          pack={pack}
          packId={packId}
          query={query}
          onQueryChange={setQuery}
          onSearch={runSearch}
          onScan={startScan}
          onChangeArea={() => setStep("enter_zip")}
          results={results}
        />
      )}

      {step === "scan" && (
        <ScanScreen
          device={device}
          cameraRef={cameraRef}
          scanActive={scanActive}
          scanLabels={scanLabels}
          scanMessage={scanMessage}
          captureUri={captureUri}
          captureSize={captureSize}
          hasCapture={hasCapture}
          scanItems={scanItems}
          isProcessing={isProcessing}
          scanDetections={scanDetections}
          pack={pack}
          onPrimaryAction={hasCapture ? retakeScan : triggerScanOnce}
          onPickPhoto={pickPhoto}
          onBack={() => {
            setScanActive(false);
            setStep("home");
          }}
          frameProcessor={undefined}
        />
      )}

      {scanError ? <Text style={{ color: colors.coral }}>{scanError}</Text> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
