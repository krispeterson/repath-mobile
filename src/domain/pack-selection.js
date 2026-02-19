export const DEFAULT_US_FALLBACK_PACK_ID = "repath.country.us.default.v1";

const FALLBACK_NOTICE =
  "Using nationwide guidance for this ZIP. Local rules may differ until a municipality-specific pack is available.";

export function resolvePackSelection(manifest, zip) {
  const normalizedZip = String(zip || "").trim();
  const jurisdictions = manifest && manifest.jurisdictions ? manifest.jurisdictions : {};
  const exactPackId = jurisdictions[normalizedZip] || null;

  if (exactPackId) {
    return {
      packId: exactPackId,
      isFallback: false,
      notice: null
    };
  }

  if (/^\d{5}$/.test(normalizedZip)) {
    return {
      packId: DEFAULT_US_FALLBACK_PACK_ID,
      isFallback: true,
      notice: FALLBACK_NOTICE
    };
  }

  return {
    packId: null,
    isFallback: false,
    notice: null
  };
}

