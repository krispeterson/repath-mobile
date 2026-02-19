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
  decision,
  packNotice,
  questionAnswers,
  onQuestionChange,
  onResolveQuestions,
  getQuestionSuggestions
}) {
  const place = resolvePlace(pack);
  const pathways = decision && Array.isArray(decision.pathways) ? decision.pathways : [];
  const questions = decision && Array.isArray(decision.questions) ? decision.questions : [];

  return (
    <View style={{ flex: 1, gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...type.h2, color: colors.ink }}>
          {place.name}{place.region ? ", " : ""}{place.region}
        </Text>
        <Text style={{ ...type.small, color: colors.mist }}>Local rules, updated with your pack.</Text>
      </View>

      {packNotice ? (
        <View style={{ borderWidth: 1, borderColor: colors.sun, backgroundColor: "#FFF7E8", borderRadius: radius.md, padding: spacing.sm }}>
          <Text style={{ color: colors.sunDark }}>{packNotice}</Text>
        </View>
      ) : null}

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

      {decision && decision.item && decision.item.name ? (
        <Text style={{ ...type.small, color: colors.mist }}>Matched item: {decision.item.name}</Text>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}>
        {questions.length ? (
          <View style={{ borderWidth: 1, borderColor: colors.cloud, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.white }}>
            <Text style={{ ...type.h3, color: colors.ink }}>More info needed</Text>
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
                    <Text style={{ color: colors.fog }}>
                      City not found in bundled municipalities. You can still continue, or provide ZIP for best results.
                    </Text>
                  ) : null}
                </View>
              );
            })}
            <Pressable onPress={onResolveQuestions} style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.ink, alignSelf: "flex-start" }}>
              <Text style={{ color: colors.white, fontWeight: "700" }}>Update recommendations</Text>
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
