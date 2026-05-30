import { fetchPage } from "./cache.js";
import { extractDeckEntries, extractLinks } from "./deck.js";
import { isDateInEnvironment } from "./environment.js";

export async function crawlSources(sourceUrls, maxDecks, options = {}) {
  const pages = [];
  const errors = [];
  const cacheStats = { hits: 0, staleHits: 0, network: 0 };
  const queue = [...new Set(sourceUrls.filter(Boolean))];
  const seen = new Set();
  const targetDate = options.targetDate || new Date().toISOString().slice(0, 10);
  const environmentStartDate = options.environmentStartDate || "";
  let deckEntryCount = 0;

  while (queue.length && deckEntryCount < maxDecks) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    try {
      const page = await fetchPage(url, options);
      const allDeckEntries = extractDeckEntries(page.html, url, page.title, sourceUrls, page.publishedDate || "");
      const deckEntries = allDeckEntries.filter((deck) => isDateInEnvironment(deck.eventDate, environmentStartDate, targetDate));
      pages.push({
        url,
        title: page.title,
        publishedDate: page.publishedDate || "",
        text: page.text,
        fetchedAt: page.fetchedAt,
        fromCache: page.fromCache,
        staleCache: page.staleCache,
        deckEntries
      });
      deckEntryCount += deckEntries.length;
      if (page.fromCache) cacheStats.hits += 1;
      else cacheStats.network += 1;
      if (page.staleCache) cacheStats.staleHits += 1;

      if (pages.length <= sourceUrls.length) {
        for (const link of extractLinks(page.html, url).slice(0, maxDecks)) {
          if (!seen.has(link) && queue.length < maxDecks * 2) queue.push(link);
        }
      }
    } catch (error) {
      errors.push({ url, message: error.message });
    }
  }

  return { pages, errors, cacheStats, deckEntryCount };
}
