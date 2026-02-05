import searchIndex from "../../assets/packs/search.json";
import { mapLabelsToItemsFromIndex, resolveItemFromIndex } from "./search-core";

export function resolveItem(pack, packId, text) {
  return resolveItemFromIndex(searchIndex, pack, packId, text);
}

export function mapLabelsToItems(labels, packId, pack) {
  return mapLabelsToItemsFromIndex(searchIndex, labels, packId, pack);
}
