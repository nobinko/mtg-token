const normalizeName = (name) => String(name || "").replace(/\s+/g, " ").trim().toLowerCase();
const FIELDS = ["typeLine", "imageUrl", "oracleText", "manaCost", "power", "toughness", "faces"];

export function mergeCardMetadata(rows, cards) {
  const byName = new Map();
  for (const card of cards || []) {
    if (card.unavailable) continue;
    for (const name of [card.requestedName, card.name, ...(card.faces || []).map((face) => face.name)].filter(Boolean)) {
      byName.set(normalizeName(name), card);
    }
  }
  return (rows || []).map((row) => {
    const card = byName.get(normalizeName(row.name));
    if (!card) return { ...row };
    // Preserve deck names/counts and game state; metadata never changes identity.
    return { ...row, ...Object.fromEntries(FIELDS.filter((key) => card[key] !== undefined).map((key) => [key, card[key]])) };
  });
}
