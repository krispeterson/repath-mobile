import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useTensorflowModel } from "react-native-fast-tflite";
import yoloLabels from "../assets/models/yolo-repath.labels.json";
import { OnboardScreen, ZipScreen } from "./components";
import { colors, spacing } from "./ui/theme";
import { HomeScreen, ScanScreen } from "./screens";
import {
  decideItem,
  getBundledPack,
  listBundledMunicipalities,
  loadImageUriAsRgb,
  resolveDetectedLabelsToItems,
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
  const [decision, setDecision] = useState(null);
  const [decisionAnswers, setDecisionAnswers] = useState({});
  const [questionDraftAnswers, setQuestionDraftAnswers] = useState({});
  const [packNotice, setPackNotice] = useState(null);
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
  const [isLocating, setIsLocating] = useState(false);
  const MIN_DETECTION_SCORE = YOLO_SCORE_THRESHOLD;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef(null);
  const model = useTensorflowModel(require("../assets/models/yolo-repath.tflite"));
  const municipalitySuggestions = useMemo(() => listBundledMunicipalities(), []);

  useEffect(() => {
    if (model.state === "loaded") {
      debugLogModel();
    }
  }, [model.state]);

  const goBackOneStep = useCallback(() => {
    if (step === "scan") {
      setScanActive(false);
      setStep("home");
      return true;
    }
    if (step === "home") {
      setStep("enter_zip");
      return true;
    }
    if (step === "enter_zip") {
      setStep("onboard");
      return true;
    }
    return false;
  }, [step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => goBackOneStep());
    return () => subscription.remove();
  }, [goBackOneStep]);

  const getQuestionSuggestions = useCallback((questionId, value) => {
    if (questionId !== "city") return [];
    const input = String(value || "").trim().toLowerCase();
    if (!input) return municipalitySuggestions.slice(0, 6);
    return municipalitySuggestions
      .filter((entry) => {
        const name = String(entry.name || "").toLowerCase();
        const label = String(entry.label || "").toLowerCase();
        return name.includes(input) || label.includes(input);
      })
      .slice(0, 6);
  }, [municipalitySuggestions]);


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

  function extractZip(postalCode) {
    const raw = String(postalCode || "").trim();
    if (!raw) return "";
    const match = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
    return match ? match[1] : "";
  }

  async function requestLocation() {
    if (isLocating) return;
    setIsLocating(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission was denied.");
        setStep("enter_zip");
        return;
      }

      let position = await Location.getLastKnownPositionAsync();
      if (!position) {
        position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
      if (!position || !position.coords) {
        setLocationError("Unable to access current location.");
        setStep("enter_zip");
        return;
      }

      const { coords } = position;
      const [place] = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude
      });
      const postal = extractZip(place && place.postalCode ? place.postalCode : "");
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
    } finally {
      setIsLocating(false);
    }
  }

  function resolvePackForZip(nextZip) {
    const zipValue = String(nextZip !== undefined ? nextZip : zip).trim();
    if (!zipValue) {
      setZipError("Enter a ZIP code.");
      setPackId(null);
      setPack(null);
      setDecision(null);
      setDecisionAnswers({});
      setQuestionDraftAnswers({});
      setPackNotice(null);
      return;
    }
    if (!/^\d{5}$/.test(zipValue)) {
      setZipError("Enter a valid 5-digit ZIP.");
      setPackId(null);
      setPack(null);
      setDecision(null);
      setDecisionAnswers({});
      setQuestionDraftAnswers({});
      setPackNotice(null);
      return;
    }

    const selection = resolvePackFromZip(zipValue);
    const pid = selection && selection.packId ? selection.packId : null;

    if (!pid) {
      setZipError("No pack available for that ZIP yet.");
      setPackId(null);
      setPack(null);
      setDecision(null);
      setDecisionAnswers({});
      setQuestionDraftAnswers({});
      setPackNotice(null);
      setStep("enter_zip");
      return;
    }

    const p = getBundledPack(pid);
    if (!p) {
      setZipError("Pack configuration is unavailable right now.");
      setPackId(null);
      setPack(null);
      setDecision(null);
      setDecisionAnswers({});
      setQuestionDraftAnswers({});
      setPackNotice(null);
      setStep("enter_zip");
      return;
    }

    setZipError(null);
    setPackId(pid);
    setPack(p);
    setDecision(null);
    const seededAnswers = /^\d{5}$/.test(zipValue) ? { zip: zipValue } : {};
    setDecisionAnswers(seededAnswers);
    setQuestionDraftAnswers(seededAnswers);
    setPackNotice(selection && selection.notice ? selection.notice : null);
    setStep("home");
  }

  function runDecision(overrides) {
    if (!pack || !packId) return;
    const seedAnswers = /^\d{5}$/.test(zip) ? { zip } : {};
    const nextAnswers = {
      ...seedAnswers,
      ...decisionAnswers,
      ...(overrides || {})
    };
    if (overrides) {
      setDecisionAnswers(nextAnswers);
      setQuestionDraftAnswers(nextAnswers);
    }
    setDecision(decideItem(pack, packId, query, nextAnswers));
  }

  function handleQuestionChange(questionId, value) {
    setQuestionDraftAnswers((prev) => ({
      ...prev,
      [questionId]: value
    }));
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
          isLocating={isLocating}
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
          isLocating={isLocating}
        />
      )}

      {step === "home" && pack && (
        <HomeScreen
          pack={pack}
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            setDecision(null);
          }}
          onSearch={() => runDecision(questionDraftAnswers)}
          onScan={startScan}
          onChangeArea={() => setStep("enter_zip")}
          decision={decision || decideItem(pack, packId, query, decisionAnswers)}
          packNotice={packNotice}
          questionAnswers={questionDraftAnswers}
          onQuestionChange={handleQuestionChange}
          onResolveQuestions={() => runDecision(questionDraftAnswers)}
          getQuestionSuggestions={getQuestionSuggestions}
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
          onBack={goBackOneStep}
          frameProcessor={undefined}
        />
      )}

      {scanError ? <Text style={{ color: colors.coral }}>{scanError}</Text> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
