import React from "react";
import { View, Text, Pressable, ScrollView, Image, Linking } from "react-native";
import { Camera } from "react-native-vision-camera";
import { CAMERA_FPS } from "../domain/scan";
import { resolveLocationDetails } from "../domain/pack";
import { colors, spacing, radius, type } from "../ui/theme";

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
  hasCapture,
  scanItems,
  onPrimaryAction,
  onBack,
  frameProcessor,
  isProcessing,
  pack
}) {
  return (
    <View style={{ flex: 1, gap: spacing.lg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ ...type.h2, color: colors.ink }}>Scan items</Text>
        <Pressable onPress={onBack}>
          <Text style={{ color: colors.ocean }}>Back</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.cloud, backgroundColor: colors.charcoal }}>
        {device ? (
          <Camera
            ref={cameraRef}
            style={{ flex: 1 }}
            device={device}
            isActive={scanActive}
            frameProcessor={frameProcessor}
            frameProcessorFps={CAMERA_FPS}
            pixelFormat="rgb"
            enableZoomGesture
            photo
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.white }}>No camera available.</Text>
          </View>
        )}
        {captureUri ? (
          <Image source={{ uri: captureUri }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
        ) : null}
      </View>

      {isProcessing ? (
        <View style={{ position: "absolute", top: 84, left: spacing.lg, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.md }}>
          <Text style={{ color: colors.white, fontSize: 12 }}>Processing…</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <Pressable onPress={onPrimaryAction} style={{ padding: spacing.md, backgroundColor: colors.ink, borderRadius: radius.md, flex: 1 }}>
          <Text style={{ color: colors.white, fontWeight: "700", textAlign: "center" }}>{hasCapture ? "Retake" : "Capture"}</Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: colors.mist }}>Pinch to zoom</Text>
      </View>

      {scanLabels.length ? (
        <Text style={{ ...type.small, color: colors.mist }}>Detected: {scanLabels.join(", ")}</Text>
      ) : null}
      {scanMessage ? <Text style={{ color: colors.coral }}>{scanMessage}</Text> : null}

      {scanItems.length ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing.md }}>
          {scanItems.map((item) => (
            <View key={item.id} style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white }}>
              <Text style={{ ...type.h3, color: colors.ink }}>{item.name}</Text>
              {(item.option_cards || []).map((c) => (
                <View key={`${item.id}-${c.id}`} style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
                  <Text style={{ ...type.h3, color: colors.ink }}>{c.title}</Text>
                  {c.subtitle ? <Text style={{ color: colors.fog }}>{c.subtitle}</Text> : null}
                  {(c.actions || []).map((action, idx) => {
                    if (action.type === "copy_text") {
                      return (
                        <Text key={`action-${idx}`} style={{ color: colors.ink }}>{action.text}</Text>
                      );
                    }
                    if (action.type === "navigate") {
                      const locationId = getLocationId(action);
                      const details = resolveLocationDetails(pack, locationId);
                      if (!details) {
                        return (
                          <Text key={`action-${idx}`} style={{ color: colors.ink }}>Location: {locationId || "Unknown"}</Text>
                        );
                      }
                      const hourLines = formatHours(details.hours);
                      return (
                        <View key={`action-${idx}`} style={{ gap: 4 }}>
                          <View style={{ gap: 2 }}>
                            <Text style={{ color: colors.ink, fontWeight: "700" }}>{details.name}</Text>
                            {details.address ? <Text style={{ color: colors.ink }}>{details.address}</Text> : null}
                            {(details.city || details.region || details.postal_code) ? (
                              <Text style={{ color: colors.ink }}>{[details.city, details.region].filter(Boolean).join(", ")}{details.postal_code ? ` ${details.postal_code}` : ""}</Text>
                            ) : null}
                          </View>
                          {hourLines.length ? (
                            <View style={{ gap: 2 }}>
                              <Text style={{ color: colors.fog, fontWeight: "600" }}>Hours</Text>
                              {hourLines.map((line, lineIdx) => (
                                <Text key={`hours-${lineIdx}`} style={{ color: colors.fog }}>{line}</Text>
                              ))}
                            </View>
                          ) : null}
                          {details.website ? (
                            <Pressable onPress={() => handleOpenUrl(details.website)}>
                              <Text style={{ color: colors.ocean, textDecorationLine: "underline" }}>{details.website}</Text>
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
