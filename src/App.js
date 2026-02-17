import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useTensorflowModel } from "react-native-fast-tflite";
import yoloLabels from "../assets/models/yolo-repath.labels.json";
import { OnboardScreen, ZipScreen } from "./components";
import { colors, spacing } from "./ui/theme";
import { HomeScreen, ScanScreen } from "./screens";
import {
  getBundledPack,
  loadImageUriAsRgb,
  resolveDetectedLabelsToItems,
  resolveItem,
  resolvePackFromZip,
  runDetectionWithBestPreset,
  YOLO_INPUT,
  YOLO_SCORE_THRESHOLD
} from "./domain";
import * as ImagePicker from "expo-image-picker";

const NO_DETECTION_MESSAGE = "No objects detected. Can you or someone else reuse it or compost it? If not, put it in the trash.";
const LOW_CONFIDENCE_MESSAGE = "We couldn't match this confidently. Can you or someone else reuse it or compost it? If not, put it in the trash.";

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
  const model = useTensorflowModel(require("../assets/models/yolo-repath.tflite"));

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
      resolvePackForZip(postal);
    } catch (error) {
      setLocationError("Unable to access current location.");
      setStep("enter_zip");
    }
  }

  function resolvePackForZip(nextZip) {
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

  function searchInSelectedPack() {
    if (!pack || !packId) return;
    setResults(resolveItem(pack, packId, query));
  }

  async function startScan() {
    setScanError(null);
    resetScanState();

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
      setScanError("Model not loaded. Ensure yolo-repath.tflite is bundled.");
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
      setScanMessage(NO_DETECTION_MESSAGE);
    } else if (!items.length) {
      setScanMessage(LOW_CONFIDENCE_MESSAGE);
    } else {
      setScanMessage(null);
    }
  };

  function retakeScan() {
    setScanActive(true);
    resetScanState();
  }

  async function triggerScanOnce() {
    if (isCapturing) return;
    setIsCapturing(true);
    setScanActive(true);
    clearCaptureState();
    setScanMessage(null);
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

  async function runDetectionOnImage(uri) {
    if (!model || model.state !== "loaded" || !model.model) {
      setScanError("Model not loaded. Ensure yolo-repath.tflite is bundled.");
      return;
    }
    setIsProcessing(true);
    try {
      const names = Array.isArray(yoloLabels) ? yoloLabels : [];
      const rgb = await loadImageUriAsRgb(uri, YOLO_INPUT);
      const bestDetections = runDetectionWithBestPreset({
        model: model.model,
        labels: names,
        rgb,
        scoreThreshold: YOLO_SCORE_THRESHOLD,
        inputSize: YOLO_INPUT
      });
      const detections = bestDetections.slice(0, 10);
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
    clearScanResults();
    setScanMessage(null);
    await runDetectionOnImage(asset.uri);
  }

  function resetScanState() {
    clearScanResults();
    clearCaptureState();
    setIsProcessing(false);
    setIsCapturing(false);
  }

  function clearScanResults() {
    setScanLabels([]);
    setScanDetections([]);
    setScanItems([]);
    setScanMessage(null);
  }

  function clearCaptureState() {
    setCaptureUri(null);
    setCaptureSize(null);
    setHasCapture(false);
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
          onContinue={() => resolvePackForZip()}
          onLocation={requestLocation}
        />
      )}

      {step === "home" && pack && (
        <HomeScreen
          pack={pack}
          packId={packId}
          query={query}
          onQueryChange={setQuery}
          onSearch={searchInSelectedPack}
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
