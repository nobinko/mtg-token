import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { port, jsonHeaders, mimeTypes, publicDir } from "./lib/config.js";
import { defaultSources } from "./lib/data.js";
import { toIsoDate } from "./lib/util.js";
import { clearPageCache } from "./lib/cache.js";
import { formatEnvironmentInfo } from "./lib/environment.js";
import { buildArchetypeProfiles, classifyByProfile, overallArchetypeStats } from "./lib/archetype.js";
import { fetchFinderCandidates, fetchJapaneseName } from "./lib/scryfall.js";
import { buildBulkObjects, groupObjectsBySet } from "./lib/tokens.js";
import { findCardMentions, deckResultsFromPages } from "./lib/search.js";
import { crawlSources } from "./lib/crawl.js";

function sendJson(res, status, body) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleTokenCards(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const format = String(body.format || "standard").toLowerCase();
  const sourceUrls = Array.isArray(body.sources) && body.sources.length
    ? body.sources
    : defaultSources[format] || defaultSources.standard;
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

  const allDeckEntries = crawl.pages.flatMap((page) => page.deckEntries || []);
  const profiles = buildArchetypeProfiles(allDeckEntries);
  for (const deck of allDeckEntries) {
    if (!deck.archetype || deck.archetype === "Unknown") {
      deck.archetype = classifyByProfile(deck.cards || [], profiles);
    }
  }

  const matched = findCardMentions(candidates, crawl.pages);
  for (const card of matched.slice(0, 100)) {
    card.japaneseName = await fetchJapaneseName(card.name);
  }

  const objects = await buildBulkObjects(matched.slice(0, 100));
  const deckResults = deckResultsFromPages(crawl.pages).slice(0, maxChildPages);
  const archetypes = overallArchetypeStats(deckResults);

  sendJson(res, 200, {
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
    cards: matched.map(({ raw, ...card }) => card),
    objects,
    groups: groupObjectsBySet(objects)
  });
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://localhost:${port}`).pathname;
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = resolve(publicDir, `.${safePath}`);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/default-sources") {
      sendJson(res, 200, defaultSources);
      return;
    }
    if (req.method === "POST" && req.url === "/api/cache/clear") {
      await clearPageCache();
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && req.url === "/api/token-cards") {
      await handleTokenCards(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`MTG Token Finder running at http://localhost:${port}`);
});
