import { decideWithPack } from "./decide-core.js";

function resolvePackCountry(pack) {
  if (pack && pack.municipality && pack.municipality.country) {
    return String(pack.municipality.country).toUpperCase();
  }
  if (pack && pack.jurisdiction && pack.jurisdiction.country) {
    return String(pack.jurisdiction.country).toUpperCase();
  }
  return "";
}

export function decideItem(pack, packId, queryText, contextOverrides = {}) {
  if (!pack || !packId) {
    return {
      packId: packId || "",
      query: String(queryText || ""),
      item: null,
      pathways: [],
      questions: [],
      ruleTrace: {
        itemId: null,
        matchedRuleIds: [],
        pathwayIds: []
      }
    };
  }

  const countryCode = contextOverrides.countryCode || resolvePackCountry(pack);
  return decideWithPack(pack, {
    packId,
    queryText,
    context: {
      municipalityId: packId,
      countryCode,
      city: contextOverrides.city,
      zip: contextOverrides.zip,
      citySlug: contextOverrides.citySlug,
      obs: contextOverrides.obs
    }
  });
}

