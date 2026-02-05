export function resolvePlace(pack) {
  return {
    name: pack?.jurisdiction?.name || pack?.municipality?.name || "",
    region:
      pack?.jurisdiction?.admin_areas?.[0]?.code ||
      pack?.municipality?.region ||
      pack?.jurisdiction?.country ||
      ""
  };
}

export function resolveLocationDetails(pack, locationId) {
  if (!pack || !locationId) return null;
  const match = (pack.locations || []).find((loc) => loc.id === locationId);
  if (!match) return null;
  return {
    name: match.name || null,
    address: match.address || null,
    city: match.city || null,
    region: match.region || null,
    postal_code: match.postal_code || null,
    hours: match.hours || null,
    website: match.website || null
  };
}
