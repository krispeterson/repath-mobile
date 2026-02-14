import manifest from "../../assets/packs/manifest.json";
import glenwoodPack from "../../assets/packs/glenwood-springs-co-us.pack.json";
import primaryMunicipalPack from "../../assets/packs/fort-collins-co-us.pack.json";
import { resolveLocationDetails, resolvePlace } from "./pack-core";

const PackRegistry = {
  "glenwood-springs-co-us": glenwoodPack,
  "fort-collins-co-us": primaryMunicipalPack
};

export function resolvePackFromZip(zip) {
  return manifest.jurisdictions[String(zip || "").trim()] || null;
}

export function getBundledPack(packId) {
  return PackRegistry[packId] || null;
}

export { resolvePlace, resolveLocationDetails };
