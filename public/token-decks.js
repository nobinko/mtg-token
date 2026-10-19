// Keep individual deck IDs (including MTGO fragments) separate from event pages.
export function deckDisplayName(deck) {
  if (deck.imported) return deck.title || "デッキ名未登録";
  // MTGO publishes event/player labels, not archetype names. The inferred
  // classification must not become the actual list's title in the viewer.
  try { if (new URL(deck.pageUrl || deck.url).hostname.replace(/^www\./, "") === "mtgo.com") return deck.title || (deck.player ? `${deck.player}のリスト` : "取得したリスト"); } catch {}
  return deck.archetype && deck.archetype !== "Unknown" ? deck.archetype : deck.title;
}

export function decksForToken(object, deckIndex) {
  const urls = object.deckUrls || (object.decks || []).map((deck) => deck.url);
  return [...new Set(urls)].map((url) => deckIndex.get(url)).filter(Boolean);
}

export function sourcesForDeck(object, deck) {
  return (object.sourceCards || []).filter((source) => {
    const urls = source.deckUrls || (source.decks || []).map((entry) => entry.url);
    return urls.includes(deck.url);
  });
}

export function boardCount(rows) {
  return (rows || []).reduce((count, row) => count + row.count, 0);
}
