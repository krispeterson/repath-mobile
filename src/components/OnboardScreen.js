import React from "react";
import { View, Text, Pressable } from "react-native";
import { spacing, radius, type, useAppTheme } from "../ui/theme";

const DEFAULT_QUICK_TIP = {
  category: "Search",
  text: "Use specific item names. \"Aluminum can\" works better than \"can\"."
};

export default function OnboardScreen({ onLocation, onEnterZip, isLocating, quickTip }) {
  const { colors } = useAppTheme();
  const tip = quickTip && typeof quickTip === "object" ? quickTip : DEFAULT_QUICK_TIP;
  const tipCategory = String(tip.category || DEFAULT_QUICK_TIP.category);
  const tipText = String(tip.text || DEFAULT_QUICK_TIP.text);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...type.h1, color: colors.textPrimary }}>RePath</Text>
        <Text style={{ ...type.body, color: colors.textMuted }}>
          Reuse, repair, sell, recycle, drop-off, or trash based on local rules and options.
        </Text>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md }}>
        <Pressable
          onPress={onLocation}
          disabled={isLocating}
          style={{ padding: spacing.md, backgroundColor: colors.textPrimary, borderRadius: radius.md, opacity: isLocating ? 0.7 : 1 }}
        >
          <Text style={{ color: colors.textInverse, textAlign: "center", fontWeight: "700" }}>
            {isLocating ? "Locating..." : "Use my location"}
          </Text>
        </Pressable>
        {isLocating ? <Text style={{ ...type.small, color: colors.textMuted, textAlign: "center" }}>Getting your ZIP from GPS...</Text> : null}
        <Pressable onPress={onEnterZip} style={{ padding: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}>
          <Text style={{ textAlign: "center", fontWeight: "700", color: colors.textPrimary }}>Enter location</Text>
        </Pressable>
      </View>

      <View style={{ backgroundColor: colors.accent, borderRadius: radius.lg, padding: spacing.lg }}>
        <Text style={{ ...type.h3, color: colors.textInverse }}>Quick tip</Text>
        <Text style={{ ...type.small, color: colors.textInverse, fontWeight: "700" }}>{tipCategory}</Text>
        <Text style={{ ...type.body, color: colors.textInverse }}>
          {tipText}
        </Text>
      </View>
    </View>
  );
}
