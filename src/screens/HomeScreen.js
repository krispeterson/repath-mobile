import React from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import CardList from "../components/CardList";
import { resolvePlace } from "../domain/pack";
import { colors, spacing, radius, type } from "../ui/theme";

export default function HomeScreen({
  pack,
  query,
  onQueryChange,
  onSearch,
  onScan,
  onChangeArea,
  onUseMyLocation,
  onClearLocation,
  onSelectRecentQuery,
  recentQueries,
  decision,
  packNotice,
  isFallbackPack,
  questionAnswers,
  onQuestionChange,
  onResolveQuestions,
  getQuestionSuggestions,
  onUseZipInsteadForCity,
  canUseZipInsteadForCity,
  isEvaluatingDecision,
  scanSupportedExamples
}) {
  const place = resolvePlace(pack);
  const pathways = decision && Array.isArray(decision.pathways) ? decision.pathways : [];
  const questions = decision && Array.isArray(decision.questions) ? decision.questions : [];
  const recent = Array.isArray(recentQueries) ? recentQueries.filter(Boolean) : [];
  const showFallbackBanner = Boolean(isFallbackPack || packNotice);
  const scanExamples = Array.isArray(scanSupportedExamples)
    ? scanSupportedExamples.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  const scanExamplesText = scanExamples.length
    ? `Works best with common items such as ${scanExamples.join(", ")}.`
    : null;

  return (
    <View style={{ flex: 1, gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...type.h2, color: colors.ink }}>
          {place.name}{place.region ? ", " : ""}{place.region}
        </Text>
        <Text style={{ ...type.small, color: colors.mist }}>Local rules, updated with your pack.</Text>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
        {showFallbackBanner ? (
          <View style={{ borderWidth: 1, borderColor: colors.sun, backgroundColor: "#FFF7E8", borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs }}>
            {isFallbackPack ? <Text style={{ color: colors.sunDark, fontWeight: "700" }}>Limited local accuracy for this ZIP</Text> : null}
            <Text style={{ color: colors.sunDark }}>{packNotice || "Using nationwide guidance for this location until a municipality pack is available."}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Item name"
            placeholderTextColor={colors.mist}
            style={{ flex: 1, borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, color: colors.ink, backgroundColor: colors.white }}
          />
          <Pressable
            onPress={onSearch}
            disabled={isEvaluatingDecision}
            style={{
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              backgroundColor: colors.ink,
              borderRadius: radius.md,
              opacity: isEvaluatingDecision ? 0.7 : 1
            }}
          >
            <Text style={{ color: colors.white, fontWeight: "700" }}>
              {isEvaluatingDecision ? "Loading..." : "Get guidance"}
            </Text>
          </Pressable>
        </View>

        {recent.length ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ ...type.small, color: colors.fog }}>Recent searches</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {recent.map((entry) => (
                <Pressable
                  key={`recent-${entry}`}
                  onPress={() => onSelectRecentQuery(entry)}
                  style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, backgroundColor: colors.white, paddingVertical: 4, paddingHorizontal: spacing.sm }}
                >
                  <Text style={{ color: colors.ink }}>{entry}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          <Pressable onPress={onUseMyLocation} style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, backgroundColor: colors.white }}>
            <Text style={{ color: colors.ocean, fontWeight: "600" }}>Use current location again</Text>
          </Pressable>
          <Pressable onPress={onClearLocation} style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, backgroundColor: colors.white }}>
            <Text style={{ color: colors.ocean, fontWeight: "600" }}>Clear location</Text>
          </Pressable>
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, backgroundColor: colors.white, padding: spacing.sm, gap: spacing.xs }}>
          <Text style={{ ...type.small, color: colors.fog, fontWeight: "700" }}>More options</Text>
          <Pressable
            onPress={onScan}
            style={{
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              borderWidth: 1,
              borderColor: colors.cloud,
              borderRadius: radius.md,
              backgroundColor: colors.snow,
              alignSelf: "flex-start"
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: "600" }}>Try camera scan (Beta)</Text>
          </Pressable>
          <Text style={{ ...type.small, color: colors.mist }}>
            Experimental: best for one item in good lighting with close framing. Verify results before disposal.
          </Text>
          {scanExamplesText ? (
            <Text style={{ ...type.small, color: colors.mist }}>{scanExamplesText}</Text>
          ) : null}
        </View>

        {decision && decision.item && decision.item.name ? (
          <Text style={{ ...type.small, color: colors.mist }}>Matched item: {decision.item.name}</Text>
        ) : null}

        {questions.length ? (
          <View style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.white }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ ...type.h3, color: colors.ink }}>More info needed</Text>
              <Pressable
                onPress={onResolveQuestions}
                disabled={isEvaluatingDecision}
                style={{
                  paddingVertical: spacing.xs,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.ink,
                  opacity: isEvaluatingDecision ? 0.7 : 1
                }}
              >
                <Text style={{ color: colors.white, fontWeight: "700" }}>
                  {isEvaluatingDecision ? "Updating..." : "Update"}
                </Text>
              </Pressable>
            </View>
            {questions.map((question) => {
              const answerValue = String(questionAnswers[question.id] || "");
              const isCityQuestion = question.id === "city";
              const suggestions = getQuestionSuggestions ? getQuestionSuggestions(question.id, answerValue) : [];
              const showUnknownCityHint = isCityQuestion && answerValue.trim().length >= 4 && suggestions.length === 0;

              return (
                <View key={question.id} style={{ gap: spacing.xs }}>
                  <Text style={{ color: colors.fog }}>{question.prompt}</Text>
                  <TextInput
                    value={answerValue}
                    onChangeText={(value) => onQuestionChange(question.id, value)}
                    placeholder={question.label}
                    placeholderTextColor={colors.mist}
                    style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.sm, color: colors.ink, backgroundColor: colors.white }}
                  />
                  {isCityQuestion && suggestions.length ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                      {suggestions.map((suggestion) => (
                        <Pressable
                          key={`${question.id}-${suggestion.label}`}
                          onPress={() => onQuestionChange(question.id, suggestion.value)}
                          style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, backgroundColor: colors.snow, paddingVertical: 4, paddingHorizontal: spacing.sm }}
                        >
                          <Text style={{ color: colors.ink }}>{suggestion.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {showUnknownCityHint ? (
                    <View style={{ gap: spacing.xs }}>
                      <Text style={{ color: colors.fog }}>
                        City not found in bundled municipalities. We can still provide broader guidance.
                      </Text>
                      {canUseZipInsteadForCity ? (
                        <Pressable onPress={onUseZipInsteadForCity} style={{ alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cloud, backgroundColor: colors.snow }}>
                          <Text style={{ color: colors.ink, fontWeight: "600" }}>Use city inferred from ZIP</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Pressable
              onPress={onResolveQuestions}
              disabled={isEvaluatingDecision}
              style={{
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.ink,
                alignSelf: "flex-start",
                opacity: isEvaluatingDecision ? 0.7 : 1
              }}
            >
              <Text style={{ color: colors.white, fontWeight: "700" }}>
                {isEvaluatingDecision ? "Updating recommendations..." : "Update recommendations"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <CardList pathways={pathways} query={decision && decision.query ? decision.query : query} />

        <Pressable onPress={onChangeArea} style={{ padding: spacing.sm }}>
          <Text style={{ textAlign: "center", color: colors.ocean, textDecorationLine: "underline" }}>Change area</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
