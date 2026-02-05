import React from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { colors, spacing, radius, type } from "../ui/theme";

export default function ZipScreen({ zip, zipError, locationError, onZipChange, onContinue, onLocation }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...type.h2, color: colors.ink }}>Choose your area</Text>
        <Text style={{ ...type.body, color: colors.fog }}>We use ZIP to pick local rules.</Text>
      </View>

      <View style={{ backgroundColor: colors.snow, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.cloud, gap: spacing.md }}>
        <TextInput
          value={zip}
          onChangeText={onZipChange}
          placeholder="ZIP code"
          placeholderTextColor={colors.mist}
          keyboardType="number-pad"
          style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, color: colors.ink, backgroundColor: colors.white }}
        />
        {zipError ? <Text style={{ color: colors.coral }}>{zipError}</Text> : null}
        {locationError ? <Text style={{ color: colors.coral }}>{locationError}</Text> : null}
        <Pressable onPress={onContinue} style={{ padding: spacing.md, backgroundColor: colors.ink, borderRadius: radius.md }}>
          <Text style={{ color: colors.white, textAlign: "center", fontWeight: "700" }}>Continue</Text>
        </Pressable>
        <Pressable onPress={onLocation} style={{ padding: spacing.sm }}>
          <Text style={{ textAlign: "center", color: colors.ocean, textDecorationLine: "underline" }}>Use my location instead</Text>
        </Pressable>
      </View>

      <Text style={{ ...type.small, color: colors.mist }}>
        Prototype uses bundled packs; replace with remote downloads + cache.
      </Text>
    </View>
  );
}
