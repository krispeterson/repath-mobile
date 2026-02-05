import { tokenize } from "./text.js";

export const LABEL_ALIASES = {
  laptop: ["electronics", "e-waste", "computer"],
  tv: ["electronics", "e-waste", "television"],
  cell: ["electronics", "e-waste", "phone"],
  phone: ["electronics", "e-waste", "cell phone"],
  keyboard: ["electronics", "e-waste"],
  mouse: ["electronics", "e-waste"],
  remote: ["electronics", "e-waste"],
  microwave: ["electronics", "appliance"],
  oven: ["appliance"],
  toaster: ["appliance"],
  refrigerator: ["appliance"],
  sink: ["plumbing", "metal"],
  book: ["books", "paper"],
  chair: ["furniture"],
  couch: ["furniture", "sofa"],
  bottle: ["glass", "plastic"],
  "wine glass": ["glass"],
  cup: ["glass", "mug"],
  bowl: ["ceramic", "dish"],
  fork: ["metal"],
  knife: ["metal"],
  spoon: ["metal"],
  scissors: ["metal"],
  teddy: ["textile", "toy"],
  backpack: ["textile", "bag"],
  umbrella: ["textile", "metal"],
  bicycle: ["metal"],
  motorcycle: ["metal"],
  car: ["auto", "metal"],
  truck: ["auto", "metal"],
  bus: ["auto", "metal"],
  train: ["metal"],
  skateboard: ["sports", "wood"],
  surfboard: ["sports"],
  "tennis racket": ["sports"],
  vase: ["glass", "ceramic"],
  plant: ["plant"],
  "potted plant": ["plant"],
  bed: ["furniture"],
  table: ["furniture"],
  clock: ["electronics", "e-waste"],
  "hair drier": ["electronics", "e-waste"],
  toothbrush: ["plastic"]
};

export const PREFERRED_ITEM_BY_LABEL = {
  laptop: "electronics"
};

export function expandLabelTokens(label) {
  const tokens = tokenize(label);
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    const aliases = LABEL_ALIASES[token];
    if (aliases) {
      aliases.forEach((alias) => tokenize(alias).forEach((t) => expanded.add(t)));
    }
  });
  return Array.from(expanded);
}

export function rankCards(cards) {
  return (cards || [])
    .map((c) => ({ ...c, score: (c.priority || 0) - ((c.confidence || 0.5) * 10) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
}

export function resolveByHeuristic(pack, q) {
  let best = null;
  let bestScore = 0;
  for (const it of pack.items || []) {
    let score = 0;
    const name = (it.name || "").toLowerCase();
    if (name === q) score += 100;
    if (name.includes(q)) score += 50;
    for (const k of it.keywords || []) {
      const kk = String(k).toLowerCase();
      if (kk === q) score += 70;
      else if (kk.includes(q)) score += 25;
    }
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }

  if (bestScore >= 25 && best) return rankCards(best.option_cards);
  return null;
}

export function resolveItemFromIndex(searchIndex, pack, packId, text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return [];

  const packSearch = searchIndex.packs && searchIndex.packs[packId];
  const tokens = tokenize(q);

  if (packSearch && packSearch.index && tokens.length) {
    const scores = {};
    tokens.forEach((token) => {
      const ids = packSearch.index[token] || [];
      ids.forEach((id) => {
        scores[id] = (scores[id] || 0) + 1;
      });
    });

    let bestId = null;
    let bestScore = 0;
    Object.keys(scores).forEach((id) => {
      const score = scores[id];
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    });

    if (bestId) {
      const best = (pack.items || []).find((it) => it.id === bestId);
      if (best && best.option_cards) {
        return rankCards(best.option_cards);
      }
    }
  }

  const fallback = resolveByHeuristic(pack, q);
  if (fallback) return fallback;

  return rankCards([
    {
      id: "unknown-item",
      kind: "unknown",
      title: "Not sure what this is",
      subtitle: "Try a different keyword.",
      priority: 200,
      confidence: 0.3,
      actions: [{ type: "copy_text", label: "Tip", text: "When in doubt, don't put it in recycling." }]
    },
    {
      id: "unknown-trash",
      kind: "trash",
      title: "Trash (last resort)",
      priority: 900,
      confidence: 0.7,
      actions: [{ type: "copy_text", label: "Note", text: "Better than contaminating recycling streams." }]
    }
  ]);
}

export function mapLabelsToItemsFromIndex(searchIndex, labels, packId, pack) {
  if (!packId || !pack) return [];
  const packSearch = searchIndex.packs && searchIndex.packs[packId];
  if (!packSearch || !packSearch.index) return [];

  for (const label of labels) {
    const key = String(label || "").toLowerCase();
    const preferredId = PREFERRED_ITEM_BY_LABEL[key];
    if (preferredId) {
      const item = (pack.items || []).find((it) => it.id === preferredId);
      if (item) return [item];
    }
  }

  const scores = {};
  labels.forEach((label) => {
    const tokens = expandLabelTokens(label);
    tokens.forEach((token) => {
      const ids = packSearch.index[token] || [];
      ids.forEach((id) => {
        scores[id] = (scores[id] || 0) + 1;
      });
    });
  });

  const ranked = Object.keys(scores)
    .map((id) => ({ id, score: scores[id] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return ranked
    .map((entry) => (pack.items || []).find((item) => item.id === entry.id))
    .filter(Boolean);
}
