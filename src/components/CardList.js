import React from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { spacing, radius, type, useAppTheme } from "../ui/theme";

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

function renderChannelCard(channel, query, colors) {
  const openTarget = getChannelOpenUrl(channel);
  const buttonLabel = getChannelButtonLabel(channel);
  const helperText = getChannelHelperText(channel, query);
  const disabled = !openTarget;
  const normalizedCategory = normalizeChannelCategory(channel && channel.category ? channel.category : "");
  const chipLabel = getChannelChipLabel(normalizedCategory);

  return (
    <View key={channel.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, backgroundColor: colors.surfaceMuted }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", flex: 1 }}>{channel.name}</Text>
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
          <Text style={{ color: colors.textMuted, fontWeight: "600", fontSize: 12 }}>{chipLabel}</Text>
        </View>
      </View>
      {channel.notes ? <Text style={{ color: colors.textMuted }}>{channel.notes}</Text> : null}
      <Pressable
        onPress={() => openUrl(openTarget)}
        disabled={disabled}
        style={{
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: disabled ? colors.disabledBg : colors.textPrimary,
          alignSelf: "flex-start"
        }}
      >
        <Text style={{ color: disabled ? colors.disabledText : colors.textInverse, fontWeight: "700" }}>{buttonLabel}</Text>
      </Pressable>
      {helperText ? <Text style={{ color: colors.textMuted }}>{helperText}</Text> : null}
      {Array.isArray(channel.missing) && channel.missing.length ? (
        <Text style={{ color: colors.danger }}>Needs: {channel.missing.join(", ")}</Text>
      ) : null}
    </View>
  );
}

function renderChannelGroup(title, channels, query, colors) {
  const list = Array.isArray(channels) ? channels : [];
  if (!list.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.textMuted, fontWeight: "700" }}>{title}</Text>
      {list.map((channel) => renderChannelCard(channel, query, colors))}
    </View>
  );
}

function renderLocations(locations, colors) {
  const list = Array.isArray(locations) ? locations : [];
  if (!list.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...type.h3, color: colors.textPrimary }}>Places</Text>
      {list.map((location) => {
        const hourLines = formatHours(location.hours);
        return (
          <View key={location.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, backgroundColor: colors.surfaceMuted }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{location.name}</Text>
            {location.address ? <Text style={{ color: colors.textSecondary }}>{location.address}</Text> : null}
            {(location.city || location.region || location.postal_code) ? (
              <Text style={{ color: colors.textSecondary }}>
                {[location.city, location.region].filter(Boolean).join(", ")}
                {location.postal_code ? ` ${location.postal_code}` : ""}
              </Text>
            ) : null}
            {hourLines.length ? (
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Hours</Text>
                {hourLines.map((line, idx) => (
                  <Text key={`${location.id}-hours-${idx}`} style={{ color: colors.textMuted }}>{line}</Text>
                ))}
              </View>
            ) : null}
            {location.website ? (
              <Pressable onPress={() => openUrl(location.website)}>
                <Text style={{ color: colors.link, textDecorationLine: "underline" }}>{location.website}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function renderChannels(channels, query, colors) {
  const list = Array.isArray(channels) ? channels : [];
  if (!list.length) return null;

  const listingChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "list");
  const repairChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "repair");
  const donationChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "donation");
  const otherChannels = list.filter((channel) => normalizeChannelCategory(channel.category) === "other");

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...type.h3, color: colors.textPrimary }}>Online/community options</Text>
      {renderChannelGroup("List / give away options", listingChannels, query, colors)}
      {renderChannelGroup("Repair options", repairChannels, query, colors)}
      {renderChannelGroup("Donation directories", donationChannels, query, colors)}
      {renderChannelGroup("Other options", otherChannels, query, colors)}
    </View>
  );
}

function getPriorityMeta(pathway, index, colors) {
  const rank = typeof pathway.rank === "number" ? pathway.rank : 999;
  const action = String(pathway.action || "");
  if (index === 0) {
    return {
      label: "Best next step",
      borderColor: colors.badgeBestBorder,
      backgroundColor: colors.badgeBestBg,
      textColor: colors.badgeBestText
    };
  }
  if (rank <= 25 || ["reuse", "sell", "giveaway", "exchange", "repair"].includes(action)) {
    return {
      label: "High impact",
      borderColor: colors.badgeHighBorder,
      backgroundColor: colors.badgeHighBg,
      textColor: colors.badgeHighText
    };
  }
  if (rank <= 60 || action === "donate" || action === "recycle") {
    return {
      label: "Good fallback",
      borderColor: colors.badgeFallbackBorder,
      backgroundColor: colors.badgeFallbackBg,
      textColor: colors.badgeFallbackText
    };
  }
  return {
    label: "Last resort",
    borderColor: colors.badgeLastBorder,
    backgroundColor: colors.badgeLastBg,
    textColor: colors.badgeLastText
  };
}

function shouldCollapseByDefault(pathway) {
  const stepsCount = Array.isArray(pathway.steps) ? pathway.steps.length : 0;
  const channelsCount = Array.isArray(pathway.channels) ? pathway.channels.length : 0;
  const locationsCount = Array.isArray(pathway.locations) ? pathway.locations.length : 0;
  return stepsCount > 2 || channelsCount > 2 || locationsCount > 1;
}

function PathwayCard({ pathway, query, index, colors }) {
  const collapseByDefault = shouldCollapseByDefault(pathway) && index > 0;
  const [expanded, setExpanded] = React.useState(!collapseByDefault);
  const steps = Array.isArray(pathway.steps) ? pathway.steps : [];
  const visibleSteps = expanded ? steps : steps.slice(0, 2);
  const hiddenStepsCount = Math.max(steps.length - visibleSteps.length, 0);
  const priority = getPriorityMeta(pathway, index, colors);
  const channelCount = Array.isArray(pathway.channels) ? pathway.channels.length : 0;
  const locationCount = Array.isArray(pathway.locations) ? pathway.locations.length : 0;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ ...type.h3, color: colors.textPrimary, flex: 1 }}>{pathway.title}</Text>
        <View style={{ borderWidth: 1, borderColor: priority.borderColor, borderRadius: radius.md, backgroundColor: priority.backgroundColor, paddingVertical: 2, paddingHorizontal: spacing.sm }}>
          <Text style={{ color: priority.textColor, fontWeight: "700", fontSize: 12 }}>{priority.label}</Text>
        </View>
      </View>
      <Text style={{ color: colors.textPlaceholder, textTransform: "capitalize" }}>{pathway.action}</Text>
      {pathway.rationale ? <Text style={{ color: colors.textPrimary }}>{pathway.rationale}</Text> : null}
      {visibleSteps.length ? (
        <View style={{ gap: 2 }}>
          {visibleSteps.map((step, idx) => (
            <Text key={`${pathway.id}-step-${idx}`} style={{ color: colors.textSecondary }}>
              {idx + 1}. {step}
            </Text>
          ))}
          {hiddenStepsCount > 0 ? (
            <Text style={{ color: colors.textMuted }}>
              +{hiddenStepsCount} more step{hiddenStepsCount === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
      ) : null}
      {!expanded && (locationCount > 0 || channelCount > 0) ? (
        <Text style={{ color: colors.textMuted }}>
          Includes {locationCount} place{locationCount === 1 ? "" : "s"} and {channelCount} online/community option{channelCount === 1 ? "" : "s"}.
        </Text>
      ) : null}
      {collapseByDefault ? (
        <Pressable onPress={() => setExpanded((current) => !current)} style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingVertical: 4, paddingHorizontal: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
            {expanded ? "Hide details" : "Show details"}
          </Text>
        </Pressable>
      ) : null}
      {expanded ? renderLocations(pathway.locations, colors) : null}
      {expanded ? renderChannels(pathway.channels, query, colors) : null}
    </View>
  );
}

export default function CardList({ pathways, query }) {
  const { colors } = useAppTheme();
  const cards = Array.isArray(pathways) ? pathways : [];
  if (!cards.length) {
    return (
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface }}>
        <Text style={{ color: colors.textMuted }}>No recommendations yet. Search for an item to continue.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {cards.map((pathway, index) => (
        <PathwayCard key={pathway.id} pathway={pathway} query={query} index={index} colors={colors} />
      ))}
    </View>
  );
}
