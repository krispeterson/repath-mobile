import { tokenize } from "./text.js";

const ACTION_DEFAULT_RANK = {
  reuse: 10,
  sell: 12,
  giveaway: 14,
  exchange: 16,
  repair: 20,
  donate: 30,
  recycle: 60,
  trash: 100,
  unknown: 150
};

const ACTION_DEFAULT_TITLE = {
  reuse: "Reuse first",
  sell: "Sell or pass along",
  giveaway: "Give away locally",
  exchange: "Exchange with community",
  repair: "Repair if practical",
  donate: "Donate to a local organization",
  recycle: "Recycle",
  trash: "Trash (last resort)",
  unknown: "Need more information"
};

const LEGACY_KIND_TO_ACTION = {
  reuse: "reuse",
  sell: "sell",
  curbside_recycle: "recycle",
  dropoff_recycle: "recycle",
  dropoff_other: "recycle",
  dropoff_hhw: "recycle",
  compost: "recycle",
  trash: "trash"
};

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toCitySlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function defaultRankForAction(action) {
  return ACTION_DEFAULT_RANK[action] || ACTION_DEFAULT_RANK.unknown;
}

function defaultTitleForAction(action) {
  return ACTION_DEFAULT_TITLE[action] || ACTION_DEFAULT_TITLE.unknown;
}

function scoreItem(item, tokens) {
  if (!item || !Array.isArray(tokens) || !tokens.length) return 0;
  let score = 0;
  const nameTokens = tokenize(item.name);
  const keywordTokens = Array.isArray(item.keywords) ? item.keywords.flatMap(tokenize) : [];
  const actionTokens = Array.isArray(item.option_cards)
    ? item.option_cards.flatMap((card) =>
        Array.isArray(card.actions)
          ? card.actions.flatMap((action) => tokenize(action.text))
          : []
      )
    : [];

  const nameSet = new Set(nameTokens);
  const keywordSet = new Set(keywordTokens);
  const actionSet = new Set(actionTokens);

  tokens.forEach((token) => {
    if (nameSet.has(token)) {
      score += 5;
      return;
    }
    if (keywordSet.has(token)) {
      score += 3;
      return;
    }
    if (actionSet.has(token)) {
      score += 1;
    }
  });

  if (!score) return 0;
  const fullQuery = tokens.join(" ");
  if (String(item.name || "").toLowerCase().includes(fullQuery)) {
    score += 4;
  }
  return score;
}

function resolveItem(pack, queryText) {
  const items = Array.isArray(pack.items) ? pack.items : [];
  const query = String(queryText || "").trim();
  if (!query) return null;
  const queryLower = query.toLowerCase();

  const byId = items.find((item) => String(item.id || "").toLowerCase() === queryLower);
  if (byId) return byId;
  const byName = items.find((item) => String(item.name || "").toLowerCase() === queryLower);
  if (byName) return byName;
  const byKeyword = items.find((item) =>
    (Array.isArray(item.keywords) ? item.keywords : []).some(
      (keyword) => String(keyword || "").toLowerCase() === queryLower
    )
  );
  if (byKeyword) return byKeyword;

  const tokens = tokenize(query);
  const scored = items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length) return scored[0].item;

  return items.find((item) => String(item.name || "").toLowerCase().includes(queryLower)) || null;
}

function normalizeObsValue(value) {
  if (typeof value !== "string") return value;
  const lower = value.trim().toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  return value;
}

function ruleMatches(rule, context, item, queryTokens) {
  if (!isObject(rule)) return false;
  const when = isObject(rule.when) ? rule.when : {};

  if (Array.isArray(when.itemIds) && when.itemIds.length > 0) {
    if (!item || !when.itemIds.includes(item.id)) return false;
  }

  if (Array.isArray(when.keywords) && when.keywords.length > 0) {
    const tokenSet = new Set([
      ...queryTokens,
      ...tokenize(item && item.name),
      ...((item && Array.isArray(item.keywords) ? item.keywords : []).flatMap(tokenize))
    ]);
    const hasMatch = when.keywords.some((keyword) =>
      tokenize(keyword).some((token) => tokenSet.has(token))
    );
    if (!hasMatch) return false;
  }

  if (isObject(when.obs)) {
    const obs = isObject(context.obs) ? context.obs : {};
    for (const key of Object.keys(when.obs)) {
      if (normalizeObsValue(obs[key]) !== normalizeObsValue(when.obs[key])) {
        return false;
      }
    }
  }

  return true;
}

function filterChannelByScope(channel, context) {
  const scope = channel.scope || "global";
  if (scope === "global") return true;
  if (scope === "country") {
    if (!context.countryCode) return false;
    const countries = Array.isArray(channel.countries)
      ? channel.countries.map((code) => String(code).toUpperCase())
      : [];
    return countries.includes(context.countryCode);
  }
  if (scope === "municipality") {
    if (!context.municipalityId) return false;
    const municipalities = Array.isArray(channel.municipalityIds) ? channel.municipalityIds : [];
    return municipalities.includes(context.municipalityId);
  }
  return false;
}

function buildTemplateValues(query, context, variables) {
  const vars = isObject(variables) ? variables : {};
  const contextSlug = context.citySlug ? toCitySlug(context.citySlug) : toCitySlug(context.city);
  const fallbackSlug = toCitySlug(vars.craigslistSubdomain || "");
  return {
    ...vars,
    query: String(query || "").trim(),
    city: context.city || "",
    zip: context.zip || "",
    citySlug: contextSlug || fallbackSlug
  };
}

function renderTemplate(urlTemplate, values) {
  const missing = new Set();
  const rendered = String(urlTemplate || "").replace(/{{\s*([^}]+?)\s*}}/g, (_match, keyRaw) => {
    const key = String(keyRaw || "").trim();
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.add(key);
      return `{{${key}}}`;
    }
    return encodeURIComponent(String(value));
  });
  return {
    url: missing.size === 0 ? rendered : null,
    missing: Array.from(missing)
  };
}

function resolveRuleChannels(thenClause, pack, context, query) {
  const map = new Map(
    (Array.isArray(pack.channels) ? pack.channels : [])
      .filter((channel) => channel && channel.id)
      .map((channel) => [channel.id, channel])
  );
  const requested = Array.isArray(thenClause.channelIds) ? thenClause.channelIds : [];
  const variables = isObject(pack.variables) ? pack.variables : {};
  const channels = [];

  requested.forEach((channelId) => {
    const source = map.get(channelId);
    if (!source || !filterChannelByScope(source, context)) return;

    const requires = Array.isArray(source.requires) ? source.requires : [];
    const values = buildTemplateValues(query, context, variables);
    const missingRequired = requires.filter((field) => {
      const value = values[field];
      return value === undefined || value === null || String(value).trim() === "";
    });
    const missing = new Set(missingRequired);
    let url = null;

    if (source.urlTemplate) {
      const rendered = renderTemplate(source.urlTemplate, values);
      rendered.missing.forEach((field) => missing.add(field));
      if (missing.size === 0) {
        url = rendered.url;
      }
    }

    channels.push({
      ...source,
      url,
      missing: missing.size ? Array.from(missing) : undefined
    });
  });

  return channels;
}

function resolveRuleLocations(thenClause, pack) {
  const locations = Array.isArray(pack.locations) ? pack.locations : [];
  const byId = new Map(locations.filter((location) => location && location.id).map((location) => [location.id, location]));
  const locationIds = Array.isArray(thenClause.locationIds) ? thenClause.locationIds : [];
  const locationTypes = Array.isArray(thenClause.locationTypes) ? thenClause.locationTypes : [];

  if (locationIds.length) {
    return locationIds.map((id) => byId.get(id)).filter(Boolean);
  }
  if (locationTypes.length) {
    const wanted = new Set(locationTypes);
    return locations.filter((location) => wanted.has(location.type));
  }
  if (thenClause.action === "donate") {
    return locations.filter((location) => location.type === "donation");
  }
  return [];
}

function pathwayFromRule(rule, pack, context, query) {
  const thenClause = isObject(rule.then) ? rule.then : {};
  const action = String(thenClause.action || rule.action || "unknown");
  const rank =
    typeof thenClause.priority === "number"
      ? thenClause.priority
      : typeof rule.priority === "number"
        ? rule.priority
        : defaultRankForAction(action);
  return {
    id: String(rule.id || `${action}-${rank}`),
    action,
    title: String(thenClause.title || rule.title || defaultTitleForAction(action)),
    rationale: String(thenClause.rationale || rule.rationale || "").trim(),
    steps: Array.isArray(thenClause.steps) ? thenClause.steps.slice() : [],
    channels: resolveRuleChannels(thenClause, pack, context, query),
    locations: resolveRuleLocations(thenClause, pack),
    rank,
    source: "rule",
    ruleId: String(rule.id || "")
  };
}

function pathwaysFromLegacyCards(item, pack) {
  if (!item || !Array.isArray(item.option_cards)) return [];
  const locationMap = new Map(
    (Array.isArray(pack.locations) ? pack.locations : [])
      .filter((location) => location && location.id)
      .map((location) => [location.id, location])
  );
  return item.option_cards.map((card) => {
    const action = LEGACY_KIND_TO_ACTION[card.kind] || "unknown";
    const copyTexts = Array.isArray(card.actions)
      ? card.actions.filter((entry) => entry && entry.type === "copy_text" && entry.text).map((entry) => String(entry.text))
      : [];
    const locationIds = Array.isArray(card.actions)
      ? card.actions
          .filter((entry) => entry && entry.type === "navigate")
          .map((entry) => (entry.payload && entry.payload.location_id) || entry.location_id || null)
          .filter(Boolean)
      : [];
    return {
      id: String(card.id || `${item.id}-${action}`),
      action,
      title: String(card.title || defaultTitleForAction(action)),
      rationale: copyTexts[0] || "",
      steps: copyTexts.slice(1),
      channels: [],
      locations: locationIds.map((id) => locationMap.get(id)).filter(Boolean),
      rank: 200 + (typeof card.priority === "number" ? card.priority : defaultRankForAction(action)),
      source: "legacy_option_card",
      ruleId: null
    };
  });
}

function mergePathways(rulePathways, legacyPathways) {
  const merged = [];
  const actions = new Set();
  rulePathways.forEach((pathway) => {
    merged.push(pathway);
    actions.add(pathway.action);
  });
  legacyPathways.forEach((pathway) => {
    if (!actions.has(pathway.action)) merged.push(pathway);
  });
  return merged
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((pathway) => {
      const next = { ...pathway };
      if (!next.channels || !next.channels.length) delete next.channels;
      if (!next.locations || !next.locations.length) delete next.locations;
      if (!next.steps || !next.steps.length) delete next.steps;
      if (!next.rationale) delete next.rationale;
      return next;
    });
}

function buildQuestions(pathways) {
  if (!Array.isArray(pathways) || !pathways.length) return [];
  const topPathway = pathways[0];
  const missing = new Set();
  (Array.isArray(topPathway.channels) ? topPathway.channels : []).forEach((channel) => {
    (Array.isArray(channel.missing) ? channel.missing : []).forEach((field) => missing.add(field));
  });
  const questions = [];
  if (missing.has("city") || missing.has("citySlug")) {
    questions.push({
      id: "city",
      type: "text",
      label: "City",
      prompt: "What city are you in?"
    });
  }
  if (missing.has("zip")) {
    questions.push({
      id: "zip",
      type: "text",
      label: "ZIP code",
      prompt: "What ZIP code are you in?"
    });
  }
  return questions;
}

export function decideWithPack(pack, request = {}) {
  if (!isObject(pack)) {
    throw new Error("decideWithPack requires a pack object");
  }
  const packId = String(request.packId || pack.pack_id || "").trim();
  const queryText = String(request.label || request.queryText || "").trim();
  const contextInput = isObject(request.context) ? request.context : {};
  const context = {
    municipalityId: String(contextInput.municipalityId || packId || "").trim(),
    countryCode: String(
      contextInput.countryCode ||
        (pack.municipality && pack.municipality.country) ||
        (pack.jurisdiction && pack.jurisdiction.country) ||
        ""
    )
      .trim()
      .toUpperCase(),
    city: String(contextInput.city || "").trim(),
    zip: String(contextInput.zip || "").trim(),
    citySlug: String(contextInput.citySlug || "").trim(),
    obs: isObject(contextInput.obs) ? contextInput.obs : {}
  };

  const item = resolveItem(pack, queryText);
  const canonicalQuery = String(queryText || (item && item.name) || "").trim();
  const queryTokens = tokenize(canonicalQuery || queryText);
  const rules = Array.isArray(pack.rules) ? pack.rules : [];
  const matchedRules = rules.filter((rule) => ruleMatches(rule, context, item, queryTokens));
  const rulePathways = matchedRules.map((rule) => pathwayFromRule(rule, pack, context, canonicalQuery));
  const legacyPathways = pathwaysFromLegacyCards(item, pack);
  const pathways = mergePathways(rulePathways, legacyPathways);

  return {
    packId,
    query: canonicalQuery || queryText,
    item: item
      ? {
          id: item.id,
          name: item.name
        }
      : null,
    pathways,
    questions: buildQuestions(pathways),
    ruleTrace: {
      itemId: item ? item.id : null,
      matchedRuleIds: matchedRules.map((rule) => String(rule.id || "")),
      pathwayIds: pathways.map((pathway) => pathway.id)
    }
  };
}

