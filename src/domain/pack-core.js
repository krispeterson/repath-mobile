export function resolvePlace(pack) {
  const jurisdiction = pack && pack.jurisdiction ? pack.jurisdiction : null;
  const municipality = pack && pack.municipality ? pack.municipality : null;
  const adminAreas = jurisdiction && Array.isArray(jurisdiction.admin_areas) ? jurisdiction.admin_areas : [];
  const adminAreaCode = adminAreas[0] && adminAreas[0].code ? adminAreas[0].code : "";

  return {
    name: (municipality && municipality.name) || (jurisdiction && jurisdiction.name) || "",
    region: (municipality && municipality.region) || adminAreaCode || (jurisdiction && jurisdiction.country) || ""
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
