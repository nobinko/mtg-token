// Keep individual deck IDs (including MTGO fragments) separate from event pages.
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
