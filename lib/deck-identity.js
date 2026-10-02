function normalized(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function eventIdentity(value) {
  return normalized(value).replace(/\b(?:mtgo|magic online|modern|standard|pioneer|legacy)\b/g, "")
    .replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function rowsIdentity(rows) {
  const merged = new Map();
  for (const row of rows || []) {
    if (!row.name || !Number.isInteger(row.count) || row.count <= 0) return null;
    const name = normalized(row.name);
    merged.set(name, (merged.get(name) || 0) + row.count);
  }
  return [...merged].sort(([a], [b]) => a.localeCompare(b));
}

function reprintKey(deck) {
  const main = rowsIdentity(deck.mainboard);
  const side = rowsIdentity(deck.sideboard);
  // Do not merge different players, undated lists, partial parses, or distinct
  // events just because they happen to share a stock decklist.
  if (!deck.player || !deck.eventName || !deck.eventDate || !main?.length || !side
    || main.reduce((sum, [, count]) => sum + count, 0) < 60) return "";
  return JSON.stringify([normalized(deck.format), deck.eventDate, eventIdentity(deck.eventName),
    normalized(deck.player), main, side]);
}

function samePublisher(a, b) {
  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const publishers = new Set((a.sourceDeckUrls || [a.url]).map(host).filter(Boolean));
  return (b.sourceDeckUrls || [b.url]).some((url) => publishers.has(host(url)));
}

export function createDeckDeduplicator() {
  const byUrl = new Map();
  const byReprint = new Map();
  const decks = [];
  return {
    decks,
    add(deck) {
      const key = reprintKey(deck);
      // A player may enter two Challenges with the same display name on the
      // same day. Distinct lists published by one site remain separate events.
      const existing = byUrl.get(deck.url) || (key && byReprint.get(key)?.find((entry) => !samePublisher(entry, deck)));
      if (existing) {
        existing.sourceUrls = [...new Set([...(existing.sourceUrls || [existing.pageUrl]), ...(deck.sourceUrls || [deck.pageUrl])].filter(Boolean))];
        existing.sourceDeckUrls = [...new Set([...(existing.sourceDeckUrls || [existing.url]), ...(deck.sourceDeckUrls || [deck.url])].filter(Boolean))];
        for (const url of existing.sourceDeckUrls) byUrl.set(url, existing);
        return false;
      }
      decks.push(deck);
      byUrl.set(deck.url, deck);
      for (const url of deck.sourceDeckUrls || []) byUrl.set(url, deck);
      if (key) {
        if (!byReprint.has(key)) byReprint.set(key, []);
        byReprint.get(key).push(deck);
      }
      return true;
    }
  };
}
