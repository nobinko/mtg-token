import { relative } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { port, publicDir, maxMatchedCards } from "./lib/config.js";
import { defaultSources } from "./lib/data.js";
import { toIsoDate } from "./lib/util.js";
import { clearPageCache } from "./lib/cache.js";
import { formatEnvironmentInfo } from "./lib/environment.js";
import { buildArchetypeProfiles, classifyByProfile, overallArchetypeStats } from "./lib/archetype.js";
import { fetchFinderCandidates, fetchJapaneseName } from "./lib/scryfall.js";
import { buildBulkObjects, groupObjectsBySet } from "./lib/tokens.js";
import { findCardMentions, deckResultsFromPages } from "./lib/search.js";
import { crawlSources } from "./lib/crawl.js";

const app = new Hono();

app.get("/api/default-sources", (c) => c.json(defaultSources));

app.post("/api/cache/clear", async (c) => {
  await clearPageCache();
  return c.json({ ok: true });
});

app.post("/api/token-cards", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const format = String(body.format || "standard").toLowerCase();
  const sourceUrls = Array.isArray(body.sources) && body.sources.length
    ? body.sources
    : defaultSources[format] ?? defaultSources.standard;
  const maxChildPages = Math.min(Number(body.maxChildPages || 300), 600);
  const useCache = body.useCache !== false;
  const refreshCache = body.refreshCache === true;
  const targetDate = toIsoDate(body.targetDate) || new Date().toISOString().slice(0, 10);
  const environment = formatEnvironmentInfo(format, targetDate);
  const environmentStartDate = toIsoDate(body.environmentStartDate) || environment.startDate || "0000-00-00";
  environment.startDate = environmentStartDate;

  const [candidates, crawl] = await Promise.all([
    fetchFinderCandidates(format),
    crawlSources(sourceUrls, maxChildPages, { useCache, refreshCache, targetDate, environmentStartDate })
  ]);

  const allDeckEntries = crawl.pages.flatMap((page) => page.deckEntries ?? []);
  const profiles = buildArchetypeProfiles(allDeckEntries);
  for (const deck of allDeckEntries) {
    if (!deck.archetype || deck.archetype === "Unknown") {
      deck.archetype = classifyByProfile(deck.cards ?? [], profiles);
    }
  }

  const matched = findCardMentions(candidates, crawl.pages);
  for (const card of matched.slice(0, maxMatchedCards)) {
    card.japaneseName = await fetchJapaneseName(card.name);
  }

  const objects = await buildBulkObjects(matched.slice(0, maxMatchedCards));
  const deckResults = deckResultsFromPages(crawl.pages).slice(0, maxChildPages);
  const archetypes = overallArchetypeStats(deckResults);

  return c.json({
    format,
    targetDate,
    environmentStartDate,
    environment,
    sourceUrls,
    scannedPages: crawl.pages.map((page) => page.url),
    errors: crawl.errors,
    cacheStats: crawl.cacheStats,
    searchedDecks: deckResults,
    searchedDeckCount: deckResults.length,
    archetypes,
    candidateCount: candidates.length,
    cards: matched.map(({ raw: _raw, ...card }) => card),
    objects,
    groups: groupObjectsBySet(objects)
  });
});

app.use("/*", serveStatic({ root: relative(process.cwd(), publicDir) }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`MTG Token Finder running at http://localhost:${port}`);
});
