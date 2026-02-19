const ENTITY_ARRAY_KEYS = new Set(["channels", "locations", "rules", "items", "aliases"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeEntityArrays(baseEntries, childEntries) {
  const base = Array.isArray(baseEntries) ? baseEntries : [];
  const child = Array.isArray(childEntries) ? childEntries : [];
  const out = base.map((entry) => clone(entry));
  const indexById = new Map();

  out.forEach((entry, idx) => {
    if (isObject(entry) && typeof entry.id === "string" && entry.id) {
      indexById.set(entry.id, idx);
    }
  });

  child.forEach((entry) => {
    const copied = clone(entry);
    if (isObject(copied) && typeof copied.id === "string" && copied.id) {
      const existingIdx = indexById.get(copied.id);
      if (existingIdx !== undefined) {
        out[existingIdx] = copied;
      } else {
        indexById.set(copied.id, out.length);
        out.push(copied);
      }
      return;
    }
    out.push(copied);
  });

  return out;
}

export function mergePacks(basePack, childPack) {
  const base = isObject(basePack) ? basePack : {};
  const child = isObject(childPack) ? childPack : {};
  const merged = clone(base);

  Object.keys(child).forEach((key) => {
    const value = child[key];
    if (ENTITY_ARRAY_KEYS.has(key)) {
      merged[key] = mergeEntityArrays(base[key], value);
      return;
    }
    if (key === "variables") {
      merged.variables = {
        ...(isObject(base.variables) ? base.variables : {}),
        ...(isObject(value) ? value : {})
      };
      return;
    }
    if (key === "extends") {
      merged.extends = Array.isArray(value) ? value.slice() : [];
      return;
    }
    merged[key] = clone(value);
  });

  return merged;
}

export function resolvePackWithExtends(packId, packRegistry, cache = new Map(), stack = []) {
  if (stack.includes(packId)) {
    throw new Error(`Pack inheritance cycle detected: ${[...stack, packId].join(" -> ")}`);
  }
  if (cache.has(packId)) {
    return clone(cache.get(packId));
  }
  const current = packRegistry[packId];
  if (!current) return null;

  const parentIds = Array.isArray(current.extends) ? current.extends : [];
  let merged = {};
  parentIds.forEach((parentId) => {
    const parentPack = resolvePackWithExtends(parentId, packRegistry, cache, [...stack, packId]);
    if (parentPack) {
      merged = mergePacks(merged, parentPack);
    }
  });
  merged = mergePacks(merged, current);
  cache.set(packId, merged);
  return clone(merged);
}

