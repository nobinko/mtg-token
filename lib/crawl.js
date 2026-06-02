import { fetchPage } from "./cache.js";
import { fetchTimeoutMs } from "./config.js";
import { extractDeckEntries, extractLinks, isDeckResultPage } from "./deck.js";
import { isDateInEnvironment } from "./environment.js";
import { extractArchetypeNames } from "./archetype.js";

const BATCH_CONCURRENCY = 5;

/**
 * JavaScriptチャレンジ（WAF bot検知・JS必須ページ）かどうかを判定する。
 * これらはコンテンツがなく、デッキデータを一切提供しない。
 */
function isBotChallengePage(page) {
  if (page.html && /window\.MTGO\.decklists\.data\s*=/.test(page.html)) return false;
  const text = (page.text || "").trim();
  if (text.length > 2000) return false;
  return /javascript\s+(is\s+)?(disabled|required)|enable\s+javascript/i.test(text);
}

/**
 * URLのドメイン部分（サイト識別用）を返す。
 */
function siteDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function isMtgTop8EventPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") === "mtgtop8.com"
      && parsed.pathname.includes("event")
      && parsed.searchParams.has("e")
      && !parsed.searchParams.has("d");
  } catch {
    return false;
  }
}

function isMtgTop8DeckPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") === "mtgtop8.com"
      && parsed.pathname.includes("event")
      && parsed.searchParams.has("e")
      && parsed.searchParams.has("d");
  } catch {
    return false;
  }
}

function mtgTop8ParentEventUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "") !== "mtgtop8.com") return "";
    if (!parsed.pathname.includes("event") || !parsed.searchParams.has("e")) return "";
    const eventId = parsed.searchParams.get("e");
    const formatCode = parsed.searchParams.get("f");
    if (!eventId || !formatCode) return "";
    return `${parsed.origin}${parsed.pathname}?e=${eventId}&f=${formatCode}`;
  } catch {
    return "";
  }
}

function extractMtgTop8EventDate(html) {
  const match = html.match(/\bplayers\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i)
    || html.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

export async function crawlSources(sourceUrls, maxPages, options = {}) {
  const pages = [];
  const errors = [];
  const cacheStats = { hits: 0, staleHits: 0, network: 0 };
  const siteStats = {};          // サイト別 { pages, decks } 集計
  const knownArchetypes = new Set();
  let unparsedDeckCount = 0;
  const queue = [...new Set(sourceUrls.filter(Boolean))];
  const seen = new Set();
  const targetDate = options.targetDate || new Date().toISOString().slice(0, 10);
  const environmentStartDate = options.environmentStartDate || "";
  const format = options.format || "";
  let deckEntryCount = 0;
  const maxFetchPages = Math.max(maxPages * 5, maxPages + BATCH_CONCURRENCY);
  const mtgTop8EventDateCache = new Map();

  async function mtgTop8EventDateFor(url) {
    const eventUrl = mtgTop8ParentEventUrl(url);
    if (!eventUrl) return "";
    if (mtgTop8EventDateCache.has(eventUrl)) return mtgTop8EventDateCache.get(eventUrl);
    try {
      const eventPage = await fetchPage(eventUrl, options);
      const eventDate = extractMtgTop8EventDate(eventPage.html);
      mtgTop8EventDateCache.set(eventUrl, eventDate);
      return eventDate;
    } catch {
      mtgTop8EventDateCache.set(eventUrl, "");
      return "";
    }
  }

  async function processUrl(url) {
    try {
      console.log(`[crawl] fetching ${url}`);
      const page = await fetchPage(url, options);

      // WAF / JS必須ページ（コンテンツなし）は集計対象外としてスキップ。
      // ただし取得自体は発生しているのでキャッシュ統計には反映する。
      if (isBotChallengePage(page)) {
        console.log(`[crawl]   ✗ bot-challenge (JS blocked) ${url}`);
        errors.push({ url, message: "bot-challenge" });
        if (page.fromCache) cacheStats.hits += 1;
        else cacheStats.network += 1;
        if (page.staleCache) cacheStats.staleHits += 1;
        return { page: null, newLinks: [] };
      }

      for (const name of extractArchetypeNames(page.html, url)) knownArchetypes.add(name);
      const allDeckEntries = extractDeckEntries(page.html, url, page.title, sourceUrls, page.publishedDate || "", format);
      if (isMtgTop8DeckPage(url)) {
        const eventDate = await mtgTop8EventDateFor(url);
        for (const deck of allDeckEntries) {
          if (!deck.eventDate && eventDate) deck.eventDate = eventDate;
        }
      }

      const parsedDeckEntries = allDeckEntries.filter((deck) => (deck.cards || []).length > 0);
      const unparsedOnPage = allDeckEntries.length - parsedDeckEntries.length;
      unparsedDeckCount += unparsedOnPage;
      const deckEntries = parsedDeckEntries.filter((deck) => isDateInEnvironment(deck.eventDate, environmentStartDate, targetDate));

      if (page.fromCache) cacheStats.hits += 1;
      else cacheStats.network += 1;
      if (page.staleCache) cacheStats.staleHits += 1;

      console.log(`[crawl]   → ${deckEntries.length} decks${unparsedOnPage ? `, unparsed=${unparsedOnPage}` : ""}, cache=${page.fromCache ? "hit" : "miss"} ${url}`);

      const eventDate = isMtgTop8EventPage(url) ? extractMtgTop8EventDate(page.html) : "";
      const skipChildLinks = eventDate && !isDateInEnvironment(eventDate, environmentStartDate, targetDate);
      if (skipChildLinks) {
        console.log(`[crawl]   ↳ skip child links outside environment (${eventDate}) ${url}`);
      }
      const newLinks = isDeckResultPage(url, sourceUrls) || skipChildLinks
        ? []
        : extractLinks(page.html, url, format, sourceUrls).slice(0, maxPages);

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

  while (queue.length > 0 && deckEntryCount < maxPages && pages.length < maxFetchPages) {
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
      if (pages.length >= maxFetchPages) break;
      const remainingDecks = maxPages - deckEntryCount;
      const deckEntries = page.deckEntries.length > remainingDecks
        ? page.deckEntries.slice(0, Math.max(remainingDecks, 0))
        : page.deckEntries;
      const acceptedPage = { ...page, deckEntries };
      pages.push(acceptedPage);
      deckEntryCount += acceptedPage.deckEntries.length;
      const domain = siteDomain(acceptedPage.url);
      if (!siteStats[domain]) siteStats[domain] = { pages: 0, decks: 0 };
      siteStats[domain].pages += 1;
      siteStats[domain].decks += acceptedPage.deckEntries.length;
      if (deckEntryCount >= maxPages) break;

      for (const link of newLinks) {
        if (!seen.has(link) && queue.length < maxFetchPages * 2) {
          queue.push(link);
        }
      }
    }
  }

  const sourceExhausted = queue.length === 0 && deckEntryCount < maxPages;
  if (sourceExhausted) {
    console.log(`[crawl] source exhausted at ${deckEntryCount}/${maxPages} decks`);
  } else if (deckEntryCount >= maxPages) {
    console.log(`[crawl] deck target reached ${deckEntryCount}/${maxPages}`);
  } else if (pages.length >= maxFetchPages) {
    console.log(`[crawl] page safety limit reached ${pages.length}/${maxFetchPages} pages, decks=${deckEntryCount}/${maxPages}`);
  }

  return { pages, errors, cacheStats, siteStats, deckEntryCount, knownArchetypes, unparsedDeckCount, sourceExhausted };
}
