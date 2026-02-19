import React from "react";
import { View, Text, Pressable } from "react-native";
import { colors, spacing, radius, type } from "../ui/theme";

const DEFAULT_QUICK_TIP = {
  category: "Search",
  text: "Use specific item names. \"Aluminum can\" works better than \"can\"."
};

export default function OnboardScreen({ onLocation, onEnterZip, isLocating, quickTip }) {
  const tip = quickTip && typeof quickTip === "object" ? quickTip : DEFAULT_QUICK_TIP;
  const tipCategory = String(tip.category || DEFAULT_QUICK_TIP.category);
  const tipText = String(tip.text || DEFAULT_QUICK_TIP.text);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...type.h1, color: colors.ink }}>RePath</Text>
        <Text style={{ ...type.body, color: colors.fog }}>
          Reuse, repair, sell, recycle, drop-off, or trash — based on local rules and options.
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
        <Text style={{ ...type.small, color: colors.white, fontWeight: "700" }}>{tipCategory}</Text>
        <Text style={{ ...type.body, color: colors.white }}>
          {tipText}
        </Text>
      </View>
    </View>
  );
}
