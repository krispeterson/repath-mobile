import React from "react";
import { View, Text, Pressable } from "react-native";
import { colors, spacing, radius, type } from "../ui/theme";

export default function OnboardScreen({ onLocation, onEnterZip, isLocating }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...type.h1, color: colors.ink }}>RePath</Text>
        <Text style={{ ...type.body, color: colors.fog }}>
          Reuse, sell, recycle, drop-off, or trash—based on local rules.
        </Text>
      </View>

      <View style={{ backgroundColor: colors.snow, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.cloud, gap: spacing.md }}>
        <Pressable
          onPress={onLocation}
          disabled={isLocating}
          style={{ padding: spacing.md, backgroundColor: colors.ink, borderRadius: radius.md, opacity: isLocating ? 0.7 : 1 }}
        >
          <Text style={{ color: colors.white, textAlign: "center", fontWeight: "700" }}>
            {isLocating ? "Locating..." : "Use my location"}
          </Text>
        </Pressable>
        {isLocating ? <Text style={{ ...type.small, color: colors.fog, textAlign: "center" }}>Getting your ZIP from GPS...</Text> : null}
        <Pressable onPress={onEnterZip} style={{ padding: spacing.md, borderWidth: 1, borderColor: colors.ink, borderRadius: radius.md }}>
          <Text style={{ textAlign: "center", fontWeight: "700", color: colors.ink }}>Enter location</Text>
        </Pressable>
      </View>

      <View style={{ backgroundColor: colors.mint, borderRadius: radius.lg, padding: spacing.lg }}>
        <Text style={{ ...type.h3, color: colors.white }}>Quick tip</Text>
        <Text style={{ ...type.body, color: colors.white }}>
          Keep a small box for hard-to-recycle items and scan them all at once.
        </Text>
      </View>
    </View>
  );
}
