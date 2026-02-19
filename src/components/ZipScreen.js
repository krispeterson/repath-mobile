import React from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { spacing, radius, type, useAppTheme } from "../ui/theme";

export default function ZipScreen({
  zip,
  zipError,
  locationError,
  onZipChange,
  onContinue,
  onLocation,
  isLocating,
  isResolvingPack
}) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...type.h2, color: colors.textPrimary }}>Choose your area</Text>
        <Text style={{ ...type.body, color: colors.textMuted }}>We use ZIP to pick local rules.</Text>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md }}>
        <TextInput
          value={zip}
          onChangeText={onZipChange}
          placeholder="ZIP code"
          placeholderTextColor={colors.textPlaceholder}
          keyboardType="number-pad"
          maxLength={5}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary, backgroundColor: colors.surfaceMuted }}
        />
        {zipError ? <Text style={{ color: colors.danger }}>{zipError}</Text> : null}
        {locationError ? <Text style={{ color: colors.danger }}>{locationError}</Text> : null}
        <Pressable
          onPress={onContinue}
          disabled={isResolvingPack}
          style={{ padding: spacing.md, backgroundColor: colors.textPrimary, borderRadius: radius.md, opacity: isResolvingPack ? 0.7 : 1 }}
        >
          <Text style={{ color: colors.textInverse, textAlign: "center", fontWeight: "700" }}>
            {isResolvingPack ? "Loading..." : "Continue"}
          </Text>
        </Pressable>
        <Pressable onPress={onLocation} disabled={isLocating} style={{ padding: spacing.sm, opacity: isLocating ? 0.7 : 1 }}>
          <Text style={{ textAlign: "center", color: colors.link, textDecorationLine: "underline" }}>
            {isLocating ? "Locating..." : "Use my location instead"}
          </Text>
        </Pressable>
        {isLocating ? <Text style={{ ...type.small, color: colors.textMuted, textAlign: "center" }}>Getting your ZIP from GPS...</Text> : null}
      </View>

      <Text style={{ ...type.small, color: colors.textPlaceholder }}>
        Prototype uses bundled packs; replace with remote downloads + cache.
      </Text>
    </View>
  );
}
