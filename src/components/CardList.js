import React from "react";
import { ScrollView, View, Text, Pressable, Linking } from "react-native";
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

function renderActions(card, pack) {
  const actions = card.actions || [];
  if (!actions.length) return null;
  return actions.map((action, idx) => {
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
          <View style={{ gap: 0 }}>
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
  });
}

export default function CardList({ cards, pack }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing.md }}>
      {cards.map((c) => (
        <View key={c.id} style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white }}>
          <Text style={{ ...type.h3, color: colors.ink }}>{c.title}</Text>
          {c.subtitle ? <Text style={{ color: colors.fog }}>{c.subtitle}</Text> : null}
          {c.prep_steps?.length ? <Text style={{ color: colors.slate }}>Prep: {c.prep_steps.join(" • ")}</Text> : null}
          {renderActions(c, pack)}
        </View>
      ))}
    </ScrollView>
  );
}
