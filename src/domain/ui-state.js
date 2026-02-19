const DEFAULT_SCAN_EXAMPLE_PRIORITY = [
  "Tin Can",
  "Aluminum Can",
  "Cardboard",
  "Pizza Box",
  "Paperboard",
  "Paper Egg Carton"
];

const DEFAULT_QUICK_TIPS = [
  {
    id: "search-specific",
    category: "Search",
    text: "Use specific item names. \"Aluminum can\" works better than \"can\"."
  },
  {
    id: "reuse-first",
    category: "Reuse",
    text: "If an item is clean and working, try listing or giving it away before recycling."
  },
  {
    id: "donate-prep",
    category: "Donate",
    text: "Bundle accessories like cords, lids, and manuals to improve donation acceptance."
  },
  {
    id: "safety-check",
    category: "Safety",
    text: "Wipe personal data from electronics before selling, donating, or recycling."
  },
  {
    id: "clean-stream",
    category: "Recycle",
    text: "Rinse out food or liquids first. Contamination can send recyclables to landfill."
  }
];

function normalizeLabel(value) {
  return String(value || "").trim();
}

function normalizeTip(tip) {
  if (!tip || typeof tip !== "object") return null;
  const id = String(tip.id || "").trim();
  const category = String(tip.category || "").trim();
  const text = String(tip.text || "").trim();
  if (!id || !category || !text) return null;
  return { id, category, text };
}

function toDaySeed(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.floor(timestamp / 86400000);
}

export function resolveScanSupportedExamples(labels, maxCount = 4) {
  const safeMax = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 4;
  const available = Array.isArray(labels) ? labels.map(normalizeLabel).filter(Boolean) : [];
  if (!available.length) return [];

  const byLower = new Map(available.map((label) => [label.toLowerCase(), label]));
  const prioritized = DEFAULT_SCAN_EXAMPLE_PRIORITY
    .map((label) => byLower.get(label.toLowerCase()))
    .filter(Boolean);

  if (prioritized.length >= safeMax) {
    return prioritized.slice(0, safeMax);
  }

  const seen = new Set(prioritized.map((label) => label.toLowerCase()));
  const extras = available.filter((label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return [...prioritized, ...extras].slice(0, safeMax);
}

export function shouldShowScanNotice(hasSeenScanNotice) {
  return !Boolean(hasSeenScanNotice);
}

export function resolveRotatingQuickTip(now = new Date(), tips = DEFAULT_QUICK_TIPS) {
  const availableTips = Array.isArray(tips) ? tips.map(normalizeTip).filter(Boolean) : [];
  if (!availableTips.length) return null;
  const index = Math.abs(toDaySeed(now)) % availableTips.length;
  return availableTips[index];
}
