import manifest from "../../assets/packs/manifest.json";
import glenwoodPack from "../../assets/packs/glenwood-springs-co-us.pack.json";
import primaryMunicipalPack from "../../assets/packs/fort-collins-co-us.pack.json";
import baseChannelsPack from "../../assets/packs/repath.base.channels.v1.pack.json";
import usChannelsPack from "../../assets/packs/repath.country.us.channels.v1.pack.json";
import usFallbackPack from "../../assets/packs/repath.country.us.default.v1.pack.json";
import fortCollinsTemplatePack from "../../assets/packs/repath.muni.us-co-fort-collins.v1.pack.json";
import { resolveLocationDetails, resolvePlace } from "./pack-core.js";
import { resolvePackWithExtends } from "./pack-merge.js";
import { resolvePackSelection } from "./pack-selection.js";

const PackRegistry = {
  "glenwood-springs-co-us": glenwoodPack,
  "fort-collins-co-us": primaryMunicipalPack,
  "repath.base.channels.v1": baseChannelsPack,
  "repath.country.us.channels.v1": usChannelsPack,
  "repath.country.us.default.v1": usFallbackPack,
  "repath.muni.us-co-fort-collins.v1": fortCollinsTemplatePack
};

const MergedPackCache = new Map();

export function resolvePackFromZip(zip) {
  return resolvePackSelection(manifest, zip);
}

export function getBundledPack(packId) {
  return resolvePackWithExtends(packId, PackRegistry, MergedPackCache);
}

export function listBundledMunicipalities() {
  const seen = new Set();
  const list = [];

  Object.values(PackRegistry).forEach((pack) => {
    const municipality = pack && pack.municipality ? pack.municipality : null;
    const name = municipality && municipality.name ? String(municipality.name).trim() : "";
    if (!name) return;

    const region = municipality && municipality.region ? String(municipality.region).trim() : "";
    const country = municipality && municipality.country ? String(municipality.country).trim() : "";
    const dedupeKey = `${name.toLowerCase()}|${region.toLowerCase()}|${country.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    list.push({
      name,
      region,
      country,
      value: name,
      label: region ? `${name}, ${region}` : name
    });
  });

  return list.sort((a, b) => a.label.localeCompare(b.label));
}

export { resolvePlace, resolveLocationDetails };
