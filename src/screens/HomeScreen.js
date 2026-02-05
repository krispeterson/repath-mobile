import React from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import CardList from "../components/CardList";
import { resolveItem } from "../domain/search";
import { resolvePlace } from "../domain/pack";
import { colors, spacing, radius, type } from "../ui/theme";

export default function HomeScreen({ pack, packId, query, onQueryChange, onSearch, onScan, onChangeArea, results }) {
  const place = resolvePlace(pack);
  const cards = results.length ? results : resolveItem(pack, packId, query);

  return (
    <View style={{ flex: 1, gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...type.h2, color: colors.ink }}>
          {place.name}{place.region ? ", " : ""}{place.region}
        </Text>
        <Text style={{ ...type.small, color: colors.mist }}>Local rules, updated with your pack.</Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search item"
          placeholderTextColor={colors.mist}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, color: colors.ink, backgroundColor: colors.white }}
        />
        <Pressable onPress={onSearch} style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.ink, borderRadius: radius.md }}>
          <Text style={{ color: colors.white, fontWeight: "700" }}>Go</Text>
        </Pressable>
      </View>

      <Pressable onPress={onScan} style={{ padding: spacing.md, backgroundColor: colors.ocean, borderRadius: radius.md }}>
        <Text style={{ color: colors.white, textAlign: "center", fontWeight: "700" }}>Scan with camera</Text>
      </Pressable>

      <CardList cards={cards} pack={pack} />

      <Pressable onPress={onChangeArea} style={{ padding: spacing.sm }}>
        <Text style={{ textAlign: "center", color: colors.ocean, textDecorationLine: "underline" }}>Change area</Text>
      </Pressable>
    </View>
  );
}
