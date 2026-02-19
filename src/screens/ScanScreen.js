import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, Image, Linking, ActivityIndicator } from "react-native";
import { Camera } from "react-native-vision-camera";
import { CAMERA_FPS, SHOW_DETECTION_BOXES_DEBUG } from "../domain/scan";
import { resolveLocationDetails } from "../domain/pack";
import { spacing, radius, type, useAppTheme } from "../ui/theme";

function getLocationId(action) {
  return action?.payload?.location_id || action?.location_id || null;
}

function formatHours(hours) {
  if (!hours || typeof hours !== "string") return [];
  const cleaned = hours.trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/\s*(?:;|\||\n)+\s*/).filter(Boolean);
  return parts.length ? parts : [cleaned];
}

function handleOpenUrl(url) {
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

export default function ScanScreen({
  device,
  cameraRef,
  scanActive,
  scanLabels,
  scanMessage,
  captureUri,
  captureSize,
  hasCapture,
  scanItems,
  scanDetections,
  onPrimaryAction,
  onPickPhoto,
  onBack,
  frameProcessor,
  isProcessing,
  pack
}) {
  const { colors } = useAppTheme();
  const [previewLayout, setPreviewLayout] = useState({ width: 0, height: 0 });

  const overlay = useMemo(() => {
    if (!SHOW_DETECTION_BOXES_DEBUG) return null;
    if (!captureUri || !scanDetections?.length) return null;
    const width = previewLayout.width;
    const height = previewLayout.height;
    if (!width || !height) return null;
    const sourceWidth = captureSize?.width || 0;
    const sourceHeight = captureSize?.height || 0;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const imageWidth = sourceWidth * scale;
    const imageHeight = sourceHeight * scale;
    const offsetX = (width - imageWidth) / 2;
    const offsetY = (height - imageHeight) / 2;

    return scanDetections.map((det, idx) => {
      const box = det.box;
      if (!box) return null;
      const left = offsetX + box.x1 * imageWidth;
      const top = offsetY + box.y1 * imageHeight;
      const boxWidth = (box.x2 - box.x1) * imageWidth;
      const boxHeight = (box.y2 - box.y1) * imageHeight;
      if (boxWidth <= 2 || boxHeight <= 2) return null;
      const label = `${det.name} ${(det.score * 100).toFixed(1)}%`;
      return (
        <View key={`${det.name}-${idx}`} style={{ position: "absolute", left, top, width: boxWidth, height: boxHeight, borderWidth: 2, borderColor: colors.danger }}>
          <View style={{ position: "absolute", top: -18, left: 0, backgroundColor: colors.overlayLabelBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
            <Text style={{ color: colors.textOnOverlay, fontSize: 10 }}>{label}</Text>
          </View>
        </View>
      );
    });
  }, [captureUri, scanDetections, previewLayout, captureSize]);

  return (
    <View style={{ flex: 1, gap: spacing.lg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ ...type.h2, color: colors.textPrimary }}>Scan items</Text>
        <Pressable onPress={onBack}>
          <Text style={{ color: colors.link }}>Back</Text>
        </Pressable>
      </View>

      <View
        style={{ flex: 1, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.previewBg }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setPreviewLayout({ width, height });
        }}
      >
        {device && !captureUri ? (
          <Camera
            ref={cameraRef}
            style={{ flex: 1 }}
            device={device}
            isActive={scanActive && !captureUri}
            frameProcessor={frameProcessor}
            frameProcessorFps={CAMERA_FPS}
            pixelFormat="rgb"
            enableZoomGesture
            photo
          />
        ) : !captureUri ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.textOnOverlay }}>No camera available.</Text>
          </View>
        ) : null}
        {captureUri ? (
          <Image source={{ uri: captureUri }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="contain" />
        ) : null}
        {SHOW_DETECTION_BOXES_DEBUG ? overlay : null}
      </View>

      {isProcessing ? (
        <View style={{ position: "absolute", top: 84, left: spacing.lg, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.processingPillBg, borderRadius: radius.md }}>
          <Text style={{ color: colors.textOnOverlay, fontSize: 12 }}>Processing...</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <Pressable
          onPress={onPrimaryAction}
          style={{
            padding: spacing.md,
            backgroundColor: isProcessing ? colors.disabledBg : colors.textPrimary,
            borderRadius: radius.md,
            flex: 1
          }}
          disabled={isProcessing}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs }}>
            {isProcessing ? <ActivityIndicator size="small" color={colors.disabledText} /> : null}
            <Text style={{ color: isProcessing ? colors.disabledText : colors.textInverse, fontWeight: "700", textAlign: "center" }}>
              {isProcessing ? "Processing..." : hasCapture ? "Retake" : "Capture"}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onPickPhoto} style={{ padding: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} disabled={isProcessing}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>Pick photo</Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: colors.textPlaceholder }}>Pinch to zoom</Text>
      </View>

      <Pressable onPress={onBack} style={{ alignSelf: "flex-start" }}>
        <Text style={{ color: colors.link, textDecorationLine: "underline" }}>Use text search instead</Text>
      </Pressable>

      {scanLabels.length ? (
        <Text style={{ ...type.small, color: colors.textPlaceholder }}>Detected: {scanLabels.join(", ")}</Text>
      ) : null}
      {scanMessage ? <Text style={{ color: colors.danger }}>{scanMessage}</Text> : null}

      {scanItems.length ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing.md }}>
          {scanItems.map((item) => (
            <View key={item.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface }}>
              <Text style={{ ...type.h3, color: colors.textPrimary }}>{item.name}</Text>
              {(item.option_cards || []).map((c) => (
                <View key={`${item.id}-${c.id}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceMuted }}>
                  <Text style={{ ...type.h3, color: colors.textPrimary }}>{c.title}</Text>
                  {c.subtitle ? <Text style={{ color: colors.textMuted }}>{c.subtitle}</Text> : null}
                  {(c.actions || []).map((action, idx) => {
                    if (action.type === "copy_text") {
                      return (
                        <Text key={`action-${idx}`} style={{ color: colors.textPrimary }}>{action.text}</Text>
                      );
                    }
                    if (action.type === "navigate") {
                      const locationId = getLocationId(action);
                      const details = resolveLocationDetails(pack, locationId);
                      if (!details) {
                        return (
                          <Text key={`action-${idx}`} style={{ color: colors.textPrimary }}>Location: {locationId || "Unknown"}</Text>
                        );
                      }
                      const hourLines = formatHours(details.hours);
                      return (
                        <View key={`action-${idx}`} style={{ gap: 4 }}>
                          <View style={{ gap: 2 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{details.name}</Text>
                            {details.address ? <Text style={{ color: colors.textPrimary }}>{details.address}</Text> : null}
                            {(details.city || details.region || details.postal_code) ? (
                              <Text style={{ color: colors.textPrimary }}>{[details.city, details.region].filter(Boolean).join(", ")}{details.postal_code ? ` ${details.postal_code}` : ""}</Text>
                            ) : null}
                          </View>
                          {hourLines.length ? (
                            <View style={{ gap: 2 }}>
                              <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Hours</Text>
                              {hourLines.map((line, lineIdx) => (
                                <Text key={`hours-${lineIdx}`} style={{ color: colors.textMuted }}>{line}</Text>
                              ))}
                            </View>
                          ) : null}
                          {details.website ? (
                            <Pressable onPress={() => handleOpenUrl(details.website)}>
                              <Text style={{ color: colors.link, textDecorationLine: "underline" }}>{details.website}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    }
                    return null;
                  })}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
