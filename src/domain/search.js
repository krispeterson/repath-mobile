import searchIndex from "../../assets/packs/search.json";
import modelLabelMap from "../../assets/models/poc-curbside.label-map.json";
import { mapLabelsToItemsFromIndex, resolveItemFromIndex } from "./search-core.js";

const mappedPackId = String((modelLabelMap && modelLabelMap.pack_id) || "");
const mappedLabelToItemId = buildMappedLabelIndex((modelLabelMap && modelLabelMap.labels_to_item_ids) || {});

export function resolveItem(pack, packId, text) {
  return resolveItemFromIndex(searchIndex, pack, packId, text);
}

export function mapLabelsToItems(labels, packId, pack) {
  return mapLabelsToItemsFromIndex(searchIndex, labels, packId, pack);
}

export function resolveDetectedLabelsToItems(labels, packId, pack) {
  if (!packId || !pack) return [];

  if (packId === mappedPackId) {
    const exactMatches = resolveExactLabelMatches(labels, pack, mappedLabelToItemId);
    if (exactMatches.length) return exactMatches;
  }

  return mapLabelsToItemsFromIndex(searchIndex, labels, packId, pack);
}

// Backward-compatible alias during migration from older call sites.
export const mapModelLabelsToItems = resolveDetectedLabelsToItems;

function buildMappedLabelIndex(rawMap) {
  const normalized = new Map();
  Object.keys(rawMap).forEach((label) => {
    normalized.set(String(label).toLowerCase(), rawMap[label]);
  });
  return normalized;
}

function resolveExactLabelMatches(labels, pack, labelToItemId) {
  const exactMatches = [];
  const seenItemIds = new Set();
  (Array.isArray(labels) ? labels : []).forEach((label) => {
    const normalizedLabel = String(label || "").toLowerCase();
    const itemId = labelToItemId.get(normalizedLabel);
    if (!itemId || seenItemIds.has(itemId)) return;
    const item = (pack.items || []).find((entry) => entry.id === itemId);
    if (!item) return;
    exactMatches.push(item);
    seenItemIds.add(item.id);
  });
  return exactMatches;
}
