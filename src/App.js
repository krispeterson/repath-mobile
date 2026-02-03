import React, { useState } from "react";
import { SafeAreaView, View, Text, TextInput, Pressable, ScrollView } from "react-native";
import * as Location from "expo-location";

import manifest from "../assets/packs/manifest.json";
import searchIndex from "../assets/packs/search.json";
import glenwoodPack from "../assets/packs/glenwood-springs-co-us.pack.json";
import fortPack from "../assets/packs/fort-collins-co-us.pack.json";

function resolvePackFromZip(zip) {
  return manifest.jurisdictions[String(zip || "").trim()] || null;
}

function getBundledPack(packId) {
  if (packId === "glenwood-springs-co-us") return glenwoodPack;
  if (packId === "fort-collins-co-us") return fortPack;
  return null;
}

function normalizeToken(token) {
  if (!token) return "";
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => normalizeToken(token.trim()))
    .filter((token) => token.length > 0);
}

function rankCards(cards) {
  return (cards || [])
    .map((c) => ({ ...c, score: (c.priority || 0) - ((c.confidence || 0.5) * 10) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
}

function resolveByHeuristic(pack, q) {
  let best = null;
  let bestScore = 0;
  for (const it of pack.items || []) {
    let score = 0;
    const name = (it.name || "").toLowerCase();
    if (name === q) score += 100;
    if (name.includes(q)) score += 50;
    for (const k of it.keywords || []) {
      const kk = String(k).toLowerCase();
      if (kk === q) score += 70;
      else if (kk.includes(q)) score += 25;
    }
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }

  if (bestScore >= 25 && best) return rankCards(best.option_cards);
  return null;
}

function resolveItem(pack, packId, text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return [];

  const packSearch = searchIndex.packs && searchIndex.packs[packId];
  const tokens = tokenize(q);

  if (packSearch && packSearch.index && tokens.length) {
    const scores = {};
    tokens.forEach((token) => {
      const ids = packSearch.index[token] || [];
      ids.forEach((id) => {
        scores[id] = (scores[id] || 0) + 1;
      });
    });

    let bestId = null;
    let bestScore = 0;
    Object.keys(scores).forEach((id) => {
      const score = scores[id];
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    });

    if (bestId) {
      const best = (pack.items || []).find((it) => it.id === bestId);
      if (best && best.option_cards) {
        return rankCards(best.option_cards);
      }
    }
  }

  const fallback = resolveByHeuristic(pack, q);
  if (fallback) return fallback;

  return rankCards([
    {
      id: "unknown-item",
      kind: "unknown",
      title: "Not sure what this is",
      subtitle: "Try a different keyword.",
      priority: 200,
      confidence: 0.3,
      actions: [{ type: "copy_text", label: "Tip", text: "When in doubt, don't put it in recycling." }]
    },
    {
      id: "unknown-trash",
      kind: "trash",
      title: "Trash (last resort)",
      priority: 900,
      confidence: 0.7,
      actions: [{ type: "copy_text", label: "Note", text: "Better than contaminating recycling streams." }]
    }
  ]);
}

export default function App() {
  const [step, setStep] = useState("onboard");
  const [zip, setZip] = useState("");
  const [packId, setPackId] = useState(null);
  const [pack, setPack] = useState(null);
  const [query, setQuery] = useState("cardboard");
  const [results, setResults] = useState([]);
  const [zipError, setZipError] = useState(null);
  const [locationError, setLocationError] = useState(null);

  async function requestLocation() {
    setLocationError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationError("Location permission was denied.");
      setStep("enter_zip");
      return;
    }

    try {
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude
      });
      const postal = place && place.postalCode ? String(place.postalCode) : "";
      if (!postal) {
        setLocationError("Couldn't determine your ZIP code.");
        setStep("enter_zip");
        return;
      }
      setZip(postal);
      chooseZip(postal);
    } catch (error) {
      setLocationError("Unable to access current location.");
      setStep("enter_zip");
    }
  }

  function chooseZip(nextZip) {
    const zipValue = String(nextZip !== undefined ? nextZip : zip).trim();
    if (!zipValue) {
      setZipError("Enter a ZIP code.");
      setPackId(null);
      setPack(null);
      return;
    }
    if (!/^\d{5}$/.test(zipValue)) {
      setZipError("Enter a valid 5-digit ZIP.");
      setPackId(null);
      setPack(null);
      return;
    }

    const pid = resolvePackFromZip(zipValue);
    if (!pid) {
      setZipError("No pack available for that ZIP yet.");
      setPackId(null);
      setPack(null);
      setStep("enter_zip");
      return;
    }

    const p = getBundledPack(pid);
    setZipError(null);
    setPackId(pid);
    setPack(p);
    setStep(p ? "home" : "enter_zip");
  }

  function run() {
    if (!pack || !packId) return;
    setResults(resolveItem(pack, packId, query));
  }

  const placeName = pack?.jurisdiction?.name || pack?.municipality?.name || "";
  const placeRegion =
    pack?.jurisdiction?.admin_areas?.[0]?.code || pack?.municipality?.region || pack?.jurisdiction?.country || "";

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      {step === "onboard" && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: "700" }}>RePath</Text>
          <Text style={{ fontSize: 16 }}>Reuse, sell, recycle, drop-off, or trash—based on local rules.</Text>
          <Pressable onPress={requestLocation} style={{ padding: 12, backgroundColor: "#111", borderRadius: 8 }}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>Use my location</Text>
          </Pressable>
          <Pressable onPress={() => setStep("enter_zip")} style={{ padding: 12, borderWidth: 1, borderColor: "#111", borderRadius: 8 }}>
            <Text style={{ textAlign: "center", fontWeight: "600" }}>Enter location</Text>
          </Pressable>
        </View>
      )}

      {step === "enter_zip" && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "700" }}>Choose your area</Text>
          <TextInput value={zip} onChangeText={(text) => { setZip(text); setZipError(null); }} placeholder="ZIP code" keyboardType="number-pad"
            style={{ borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 10 }} />
          {zipError ? <Text style={{ color: "#b00020" }}>{zipError}</Text> : null}
          {locationError ? <Text style={{ color: "#b00020" }}>{locationError}</Text> : null}
          <Pressable onPress={() => chooseZip()} style={{ padding: 12, backgroundColor: "#111", borderRadius: 8 }}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>Continue</Text>
          </Pressable>
          <Pressable onPress={requestLocation} style={{ padding: 10 }}>
            <Text style={{ textAlign: "center", color: "#111", textDecorationLine: "underline" }}>Use my location instead</Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: "#555" }}>Prototype uses bundled packs; replace with remote downloads + cache.</Text>
        </View>
      )}

      {step === "home" && pack && (
        <View style={{ flex: 1, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>{placeName}{placeRegion ? ", " : ""}{placeRegion}</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput value={query} onChangeText={setQuery} placeholder="Search item"
              style={{ flex: 1, borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 10 }} />
            <Pressable onPress={run} style={{ padding: 12, backgroundColor: "#111", borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Go</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10 }}>
            {(results.length ? results : resolveItem(pack, packId, query)).map((c) => (
              <View key={c.id} style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, gap: 6 }}>
                <Text style={{ fontSize: 16, fontWeight: "700" }}>{c.title}</Text>
                {c.subtitle ? <Text style={{ color: "#555" }}>{c.subtitle}</Text> : null}
                <Text style={{ fontSize: 12, color: "#777" }}>{c.kind} • conf {Math.round((c.confidence || 0) * 100)}%</Text>
                {c.prep_steps?.length ? <Text style={{ color: "#333" }}>Prep: {c.prep_steps.join(" • ")}</Text> : null}
                {c.actions?.length ? <Text style={{ color: "#333" }}>Actions: {c.actions.map((a) => a.type).join(", ")}</Text> : null}
              </View>
            ))}
          </ScrollView>

          <Pressable onPress={() => setStep("enter_zip")} style={{ padding: 10 }}>
            <Text style={{ textAlign: "center", color: "#111", textDecorationLine: "underline" }}>Change area</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
