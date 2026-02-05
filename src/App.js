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
import { getBundledPack, resolvePackFromZip, mapLabelsToItems, resolveItem } from "./domain";
import useScanProcessor from "./hooks/useScanProcessor";

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
  const [scanActive, setScanActive] = useState(false);
  const [scanMode, setScanMode] = useState("idle");
  const [scanItems, setScanItems] = useState([]);
  const [scanMessage, setScanMessage] = useState(null);
  const [captureUri, setCaptureUri] = useState(null);
  const [hasCapture, setHasCapture] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef(null);
  const model = useTensorflowModel(require("../assets/models/yolov8.tflite"));

  if (Array.isArray(yoloLabels) && yoloLabels.length !== 80) {
    console.log("[TFLite] Warning: expected 80 labels, got", yoloLabels.length);
  }

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
    setScanItems([]);
    setScanMessage(null);
    setCaptureUri(null);
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

    setScanMode("idle");
    setScanActive(true);
    setStep("scan");
  }

  const handleDetections = (labels) => {
    setScanLabels(labels);
    const items = mapLabelsToItems(labels, packId, pack);
    setScanItems(items);
    if (!labels.length) {
      setScanMessage("No objects detected. Try better lighting or move closer.");
    } else if (!items.length) {
      setScanMessage("Detected objects, but no matching items in this pack.");
    } else {
      setScanMessage(null);
    }
  };

  function finalizeCapture() {
    setScanActive(false);
    setScanMode("idle");
  }

  function retakeScan() {
    setScanActive(true);
    setScanMode("idle");
    setScanLabels([]);
    setScanItems([]);
    setScanMessage(null);
    setCaptureUri(null);
    setHasCapture(false);
    setIsCapturing(false);
  }

  async function triggerScanOnce() {
    if (isCapturing) return;
    setIsCapturing(true);
    setScanMode("idle");
    setScanActive(true);
    setScanMessage(null);
    setCaptureUri(null);
    setHasCapture(false);
    try {
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePhoto();
        if (photo?.path) {
          setCaptureUri(`file://${photo.path}`);
          setScanMessage(null);
          setHasCapture(true);
          setScanMode("capture");
          setScanActive(true);
        }
      }
    } catch (error) {
      if (!captureUri) {
        setScanMessage("Capture failed. Please try again.");
      }
    } finally {
      setIsCapturing(false);
    }
  }

  const frameProcessor = useScanProcessor({
    model,
    labelNames: yoloLabels,
    scanActive,
    scanMode,
    onDetections: handleDetections,
    onFinalize: finalizeCapture
  });

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
          hasCapture={hasCapture}
          scanItems={scanItems}
          pack={pack}
          onPrimaryAction={hasCapture ? retakeScan : triggerScanOnce}
          onBack={() => {
            setScanActive(false);
            setStep("home");
          }}
          frameProcessor={frameProcessor}
        />
      )}

      {scanError ? <Text style={{ color: colors.coral }}>{scanError}</Text> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
