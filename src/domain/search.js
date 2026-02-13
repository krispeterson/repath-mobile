import searchIndex from "../../assets/packs/search.json";
import modelLabelMap from "../../assets/models/poc-curbside.label-map.json";
import { mapLabelsToItemsFromIndex, resolveItemFromIndex } from "./search-core";

export function resolveItem(pack, packId, text) {
  return resolveItemFromIndex(searchIndex, pack, packId, text);
}

export function mapLabelsToItems(labels, packId, pack) {
  return mapLabelsToItemsFromIndex(searchIndex, labels, packId, pack);
}

export function mapModelLabelsToItems(labels, packId, pack) {
  if (!packId || !pack) return [];
  const normalized = new Map();
  const mapPackId = String(modelLabelMap?.pack_id || "");
  const rawMap = modelLabelMap?.labels_to_item_ids || {};
  if (packId === mapPackId) {
    Object.keys(rawMap).forEach((label) => {
      normalized.set(String(label).toLowerCase(), rawMap[label]);
    });
  }

  const exactMatches = [];
  const seen = new Set();
  (Array.isArray(labels) ? labels : []).forEach((label) => {
    const key = String(label || "").toLowerCase();
    const itemId = normalized.get(key);
    if (!itemId || seen.has(itemId)) return;
    const item = (pack.items || []).find((entry) => entry.id === itemId);
    if (!item) return;
    exactMatches.push(item);
    seen.add(item.id);
  });

  if (exactMatches.length) return exactMatches;
  return mapLabelsToItemsFromIndex(searchIndex, labels, packId, pack);
}
