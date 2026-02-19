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

function getPriorityMeta(pathway, index) {
  const rank = typeof pathway.rank === "number" ? pathway.rank : 999;
  const action = String(pathway.action || "");
  if (index === 0) {
    return {
      label: "Best next step",
      borderColor: colors.mint,
      backgroundColor: "#E8FBF5",
      textColor: colors.mintDark
    };
  }
  if (rank <= 25 || ["reuse", "sell", "giveaway", "exchange", "repair"].includes(action)) {
    return {
      label: "High impact",
      borderColor: colors.ocean,
      backgroundColor: "#EEF4FF",
      textColor: colors.ocean
    };
  }
  if (rank <= 60 || action === "donate" || action === "recycle") {
    return {
      label: "Good fallback",
      borderColor: colors.cloud,
      backgroundColor: colors.snow,
      textColor: colors.fog
    };
  }
  return {
    label: "Last resort",
    borderColor: colors.sun,
    backgroundColor: "#FFF7E8",
    textColor: colors.sunDark
  };
}

function shouldCollapseByDefault(pathway) {
  const stepsCount = Array.isArray(pathway.steps) ? pathway.steps.length : 0;
  const channelsCount = Array.isArray(pathway.channels) ? pathway.channels.length : 0;
  const locationsCount = Array.isArray(pathway.locations) ? pathway.locations.length : 0;
  return stepsCount > 2 || channelsCount > 2 || locationsCount > 1;
}

function PathwayCard({ pathway, query, index }) {
  const collapseByDefault = shouldCollapseByDefault(pathway) && index > 0;
  const [expanded, setExpanded] = React.useState(!collapseByDefault);
  const steps = Array.isArray(pathway.steps) ? pathway.steps : [];
  const visibleSteps = expanded ? steps : steps.slice(0, 2);
  const hiddenStepsCount = Math.max(steps.length - visibleSteps.length, 0);
  const priority = getPriorityMeta(pathway, index);
  const channelCount = Array.isArray(pathway.channels) ? pathway.channels.length : 0;
  const locationCount = Array.isArray(pathway.locations) ? pathway.locations.length : 0;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ ...type.h3, color: colors.ink, flex: 1 }}>{pathway.title}</Text>
        <View style={{ borderWidth: 1, borderColor: priority.borderColor, borderRadius: radius.md, backgroundColor: priority.backgroundColor, paddingVertical: 2, paddingHorizontal: spacing.sm }}>
          <Text style={{ color: priority.textColor, fontWeight: "700", fontSize: 12 }}>{priority.label}</Text>
        </View>
      </View>
      <Text style={{ color: colors.mist, textTransform: "capitalize" }}>{pathway.action}</Text>
      {pathway.rationale ? <Text style={{ color: colors.ink }}>{pathway.rationale}</Text> : null}
      {visibleSteps.length ? (
        <View style={{ gap: 2 }}>
          {visibleSteps.map((step, idx) => (
            <Text key={`${pathway.id}-step-${idx}`} style={{ color: colors.slate }}>
              {idx + 1}. {step}
            </Text>
          ))}
          {hiddenStepsCount > 0 ? (
            <Text style={{ color: colors.fog }}>
              +{hiddenStepsCount} more step{hiddenStepsCount === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
      ) : null}
      {!expanded && (locationCount > 0 || channelCount > 0) ? (
        <Text style={{ color: colors.fog }}>
          Includes {locationCount} place{locationCount === 1 ? "" : "s"} and {channelCount} online/community option{channelCount === 1 ? "" : "s"}.
        </Text>
      ) : null}
      {collapseByDefault ? (
        <Pressable onPress={() => setExpanded((current) => !current)} style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, backgroundColor: colors.snow, paddingVertical: 4, paddingHorizontal: spacing.sm }}>
          <Text style={{ color: colors.ink, fontWeight: "600" }}>
            {expanded ? "Hide details" : "Show details"}
          </Text>
        </Pressable>
      ) : null}
      {expanded ? renderLocations(pathway.locations) : null}
      {expanded ? renderChannels(pathway.channels, query) : null}
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
      {cards.map((pathway, index) => (
        <PathwayCard key={pathway.id} pathway={pathway} query={query} index={index} />
      ))}
    </View>
  );
}
