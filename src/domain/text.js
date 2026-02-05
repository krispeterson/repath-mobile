export function normalizeToken(token) {
  if (!token) return "";
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => normalizeToken(token.trim()))
    .filter((token) => token.length > 0);
}
