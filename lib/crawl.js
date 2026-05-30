import { fetchPage } from "./cache.js";
import { extractDeckEntries, extractLinks, isDeckResultPage } from "./deck.js";
import { isDateInEnvironment } from "./environment.js";
import { extractArchetypeNames } from "./archetype.js";

export async function crawlSources(sourceUrls, maxDecks, options = {}) {
  const pages = [];
  const errors = [];
  const cacheStats = { hits: 0, staleHits: 0, network: 0 };
  const knownArchetypes = new Set();
  const queue = [...new Set(sourceUrls.filter(Boolean))];
  const seen = new Set();
  const targetDate = options.targetDate || new Date().toISOString().slice(0, 10);
  const environmentStartDate = options.environmentStartDate || "";
  const format = options.format || "";
  let deckEntryCount = 0;

  while (queue.length && pages.length < maxDecks) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    try {
      const queueLen = queue.length;
      console.log(`[crawl] fetching (${seen.size}/${seen.size + queueLen}) decks=${deckEntryCount} ${url}`);
      const page = await fetchPage(url, options);
      for (const name of extractArchetypeNames(page.html, url)) knownArchetypes.add(name);
      const allDeckEntries = extractDeckEntries(page.html, url, page.title, sourceUrls, page.publishedDate || "");
      const deckEntries = allDeckEntries.filter((deck) => isDateInEnvironment(deck.eventDate, environmentStartDate, targetDate));
      console.log(`[crawl]   → ${deckEntries.length} decks, cache=${page.fromCache ? "hit" : "miss"}`);
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

      // 個別デッキページ以外（リスト・メタゲーム・アーキタイプ結果ページ等）からはリンクを辿る。
      // これにより「メタゲーム→アーキタイプ結果→個別デッキ」の深さ2チェーンが機能する。
      if (!isDeckResultPage(url, sourceUrls)) {
        for (const link of extractLinks(page.html, url, format).slice(0, maxDecks)) {
          if (!seen.has(link) && queue.length < maxDecks * 2) queue.push(link);
        }
      }
    } catch (error) {
      console.log(`[crawl]   ✗ error: ${error.message} ${url}`);
      errors.push({ url, message: error.message });
    }
  }

  return { pages, errors, cacheStats, deckEntryCount, knownArchetypes };
}
