import { fetchPage } from "./cache.js";
import { fetchTimeoutMs } from "./config.js";
import { extractDeckEntries, extractLinks, isDeckResultPage } from "./deck.js";
import { isDateInEnvironment } from "./environment.js";
import { extractArchetypeNames } from "./archetype.js";

const BATCH_CONCURRENCY = 5;

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

  async function processUrl(url) {
    try {
      console.log(`[crawl] fetching ${url}`);
      const page = await fetchPage(url, options);
      for (const name of extractArchetypeNames(page.html, url)) knownArchetypes.add(name);
      const allDeckEntries = extractDeckEntries(page.html, url, page.title, sourceUrls, page.publishedDate || "");
      const deckEntries = allDeckEntries.filter((deck) => isDateInEnvironment(deck.eventDate, environmentStartDate, targetDate));
      console.log(`[crawl]   → ${deckEntries.length} decks, cache=${page.fromCache ? "hit" : "miss"} ${url}`);

      if (page.fromCache) cacheStats.hits += 1;
      else cacheStats.network += 1;
      if (page.staleCache) cacheStats.staleHits += 1;

      const newLinks = isDeckResultPage(url, sourceUrls)
        ? []
        : extractLinks(page.html, url, format).slice(0, maxDecks);

      return {
        page: {
          url,
          title: page.title,
          publishedDate: page.publishedDate || "",
          text: page.text,
          fetchedAt: page.fetchedAt,
          fromCache: page.fromCache,
          staleCache: page.staleCache,
          deckEntries
        },
        newLinks
      };
    } catch (error) {
      const reason = error.name === "AbortError" ? `timeout (${fetchTimeoutMs / 1000}s)` : error.message;
      console.log(`[crawl]   ✗ ${reason} ${url}`);
      errors.push({ url, message: reason });
      return { page: null, newLinks: [] };
    }
  }

  while (queue.length > 0 && pages.length < maxDecks) {
    // 現在のキューからバッチを切り出す（seen 済みはスキップ）
    const batch = [];
    while (queue.length > 0 && batch.length < BATCH_CONCURRENCY) {
      const url = queue.shift();
      if (url && !seen.has(url)) {
        seen.add(url);
        batch.push(url);
      }
    }
    if (batch.length === 0) break;

    const total = seen.size + queue.length;
    console.log(`[crawl] batch ${batch.length} urls (seen=${seen.size}/${total} decks=${deckEntryCount})`);

    // バッチ内は並列フェッチ
    const results = await Promise.all(batch.map(processUrl));

    for (const { page, newLinks } of results) {
      if (!page) continue;
      if (pages.length >= maxDecks) break;
      pages.push(page);
      deckEntryCount += page.deckEntries.length;

      for (const link of newLinks) {
        if (!seen.has(link) && queue.length < maxDecks * 2) {
          queue.push(link);
        }
      }
    }
  }

  return { pages, errors, cacheStats, deckEntryCount, knownArchetypes };
}
