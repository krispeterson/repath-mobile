import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { colors, spacing, radius, type } from "../ui/theme";

function formatHours(hours) {
  if (!hours || typeof hours !== "string") return [];
  const cleaned = hours.trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/\s*(?:;|\||\n)+\s*/).filter(Boolean);
  return parts.length ? parts : [cleaned];
}

function openUrl(url) {
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

function getChannelOpenUrl(channel) {
  if (channel && channel.url) return channel.url;
  if (channel && channel.urlTemplate && !String(channel.urlTemplate).includes("{{")) {
    return channel.urlTemplate;
  }
  return null;
}

function getChannelButtonLabel(channel) {
  const name = channel && channel.name ? channel.name : "channel";
  const category = channel && channel.category ? String(channel.category) : "";
  if (category === "donation_directory") return "Find donation sites";
  if (category === "repair_directory") return "Find repair options";
  if (category === "marketplace" || category === "giveaway" || category === "exchange") {
    return `List on ${name}`;
  }
  return `Open ${name}`;
}

function getChannelHelperText(channel, query) {
  const text = String(query || "").trim();
  if (!text) return null;
  const category = channel && channel.category ? String(channel.category) : "";
  if (category === "donation_directory" || category === "repair_directory") return null;
  if (category === "marketplace" || category === "giveaway" || category === "exchange") {
    return `Suggested listing term: ${text}`;
  }
  return `Suggested item term: ${text}`;
}

function normalizeChannelCategory(category) {
  const value = String(category || "");
  if (value === "marketplace" || value === "giveaway" || value === "exchange") return "list";
  if (value === "repair_directory") return "repair";
  if (value === "donation_directory") return "donation";
  return "other";
}

function getChannelChipLabel(category) {
  if (category === "list") return "Sell/Share";
  if (category === "repair") return "Repair";
  if (category === "donation") return "Donate";
  return "Option";
}

function renderChannelCard(channel, query) {
  const openTarget = getChannelOpenUrl(channel);
  const buttonLabel = getChannelButtonLabel(channel);
  const helperText = getChannelHelperText(channel, query);
  const disabled = !openTarget;
  const normalizedCategory = normalizeChannelCategory(channel && channel.category ? channel.category : "");
  const chipLabel = getChannelChipLabel(normalizedCategory);

  return (
    <View key={channel.id} style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={{ color: colors.ink, fontWeight: "700", flex: 1 }}>{channel.name}</Text>
        <View style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, backgroundColor: colors.snow, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
          <Text style={{ color: colors.fog, fontWeight: "600", fontSize: 12 }}>{chipLabel}</Text>
        </View>
      </View>
      {channel.notes ? <Text style={{ color: colors.fog }}>{channel.notes}</Text> : null}
      <Pressable
        onPress={() => openUrl(openTarget)}
        disabled={disabled}
        style={{
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: disabled ? colors.cloud : colors.ink,
          alignSelf: "flex-start"
        }}
      >
        <Text style={{ color: disabled ? colors.fog : colors.white, fontWeight: "700" }}>{buttonLabel}</Text>
      </Pressable>
      {helperText ? <Text style={{ color: colors.fog }}>{helperText}</Text> : null}
      {Array.isArray(channel.missing) && channel.missing.length ? (
        <Text style={{ color: colors.coral }}>Needs: {channel.missing.join(", ")}</Text>
      ) : null}
    </View>
  );
}

function renderChannelGroup(title, channels, query) {
  const list = Array.isArray(channels) ? channels : [];
  if (!list.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.fog, fontWeight: "700" }}>{title}</Text>
      {list.map((channel) => renderChannelCard(channel, query))}
    </View>
  );
}

function renderLocations(locations) {
  const list = Array.isArray(locations) ? locations : [];
  if (!list.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...type.h3, color: colors.ink }}>Places</Text>
      {list.map((location) => {
        const hourLines = formatHours(location.hours);
        return (
          <View key={location.id} style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }}>
            <Text style={{ color: colors.ink, fontWeight: "700" }}>{location.name}</Text>
            {location.address ? <Text style={{ color: colors.ink }}>{location.address}</Text> : null}
            {(location.city || location.region || location.postal_code) ? (
              <Text style={{ color: colors.ink }}>
                {[location.city, location.region].filter(Boolean).join(", ")}
                {location.postal_code ? ` ${location.postal_code}` : ""}
              </Text>
            ) : null}
            {hourLines.length ? (
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.fog, fontWeight: "600" }}>Hours</Text>
                {hourLines.map((line, idx) => (
                  <Text key={`${location.id}-hours-${idx}`} style={{ color: colors.fog }}>{line}</Text>
                ))}
              </View>
            ) : null}
            {location.website ? (
              <Pressable onPress={() => openUrl(location.website)}>
                <Text style={{ color: colors.ocean, textDecorationLine: "underline" }}>{location.website}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function renderChannels(channels, query) {
  const list = Array.isArray(channels) ? channels : [];
  if (!list.length) return null;

  const listingChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "list");
  const repairChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "repair");
  const donationChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "donation");
  const otherChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "other");

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...type.h3, color: colors.ink }}>Online/community options</Text>
      {renderChannelGroup("List / give away options", listingChannels, query)}
      {renderChannelGroup("Repair options", repairChannels, query)}
      {renderChannelGroup("Donation directories", donationChannels, query)}
      {renderChannelGroup("Other options", otherChannels, query)}
    </View>
  );
}

export default function CardList({ pathways, query }) {
  const cards = Array.isArray(pathways) ? pathways : [];
  if (!cards.length) {
    return (
      <View style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.white }}>
        <Text style={{ color: colors.fog }}>No recommendations yet. Search for an item to continue.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {cards.map((pathway) => (
        <View key={pathway.id} style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white }}>
          <Text style={{ ...type.h3, color: colors.ink }}>{pathway.title}</Text>
          <Text style={{ color: colors.mist, textTransform: "capitalize" }}>{pathway.action}</Text>
          {pathway.rationale ? <Text style={{ color: colors.ink }}>{pathway.rationale}</Text> : null}
          {Array.isArray(pathway.steps) && pathway.steps.length ? (
            <View style={{ gap: 2 }}>
              {pathway.steps.map((step, idx) => (
                <Text key={`${pathway.id}-step-${idx}`} style={{ color: colors.slate }}>
                  {idx + 1}. {step}
                </Text>
              ))}
            </View>
          ) : null}
          {renderLocations(pathway.locations)}
          {renderChannels(pathway.channels, query)}
        </View>
      ))}
    </View>
  );
}
