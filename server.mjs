import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(".");
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 5177);

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const userAgent = "mtg-token-finder/0.2 (+local broadcast prep tool)";
const scryfallDelayMs = 80;

const candidateCache = new Map();
const japaneseCache = new Map();
const pageCache = new Map();
const relatedCache = new Map();

const defaultSources = {
  standard: [
    "https://www.mtggoldfish.com/metagame/standard",
    "https://mtgdecks.net/Standard/decklists",
    "https://magic.gg/decklists"
  ],
  pioneer: [
    "https://www.mtggoldfish.com/metagame/pioneer",
    "https://mtgdecks.net/Pioneer/decklists",
    "https://magic.gg/decklists"
  ],
  modern: [
    "https://www.mtggoldfish.com/metagame/modern",
    "https://mtgdecks.net/Modern/decklists",
    "https://magic.gg/decklists"
  ],
  legacy: [
    "https://www.mtggoldfish.com/metagame/legacy",
    "https://mtgdecks.net/Legacy/decklists",
    "https://magic.gg/decklists"
  ]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function sendJson(res, status, body) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchText(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "text/html,text/plain,*/*" }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const text = await response.text();
  pageCache.set(url, text);
  return text;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "application/json" }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function normalizeText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function extractTitle(html, url) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return new URL(url).pathname.replace(/^\/+/, "") || url;
  return normalizeText(match[1]).trim() || url;
}

function isDeckResultPage(url, sourceUrls) {
  const lower = url.toLowerCase();
  const sourceSet = new Set(sourceUrls.map((source) => source.toLowerCase()));
  if (lower.includes("mtggoldfish.com/deck/")) return true;
  if (lower.includes("magic.gg/decklists/") && !lower.endsWith("/decklists")) return true;
  if (/mtgdecks\.net\/(standard|pioneer|modern|legacy)\/(?!decklists)/i.test(url)) return true;
  return sourceSet.has(lower) && !/\/metagame\/|\/decklists\/?$/i.test(lower);
}

function deckResultsFromPages(pages, sourceUrls) {
  const deckPages = pages
    .filter((page) => isDeckResultPage(page.url, sourceUrls))
    .map((page) => ({ title: page.title, url: page.url }));
  const unique = new Map(deckPages.map((page) => [page.url, page]));
  return [...unique.values()];
}

function extractLinks(html, baseUrl) {
  const links = [];
  const base = new URL(baseUrl);
  const pattern = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], base).toString();
      if (url.startsWith(base.origin)) links.push(url);
    } catch {
      // Ignore malformed links from source sites.
    }
  }
  return [...new Set(links)].filter((url) => {
    const lower = url.toLowerCase();
    if (lower.includes("mtggoldfish.com/deck/")) return true;
    if (lower.includes("mtgdecks.net/standard/")) return true;
    if (lower.includes("mtgdecks.net/pioneer/")) return true;
    if (lower.includes("mtgdecks.net/modern/")) return true;
    if (lower.includes("mtgdecks.net/legacy/")) return true;
    if (lower.includes("magic.gg/decklists/")) return true;
    return false;
  });
}

async function crawlSources(sourceUrls, maxChildPages) {
  const pages = [];
  const errors = [];
  const queue = [...new Set(sourceUrls.filter(Boolean))];
  const seen = new Set();

  while (queue.length && pages.length < maxChildPages + sourceUrls.length) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    try {
      const html = await fetchText(url);
      pages.push({ url, title: extractTitle(html, url), text: normalizeText(html) });

      if (pages.length <= sourceUrls.length) {
        for (const link of extractLinks(html, url).slice(0, maxChildPages)) {
          if (!seen.has(link) && queue.length < maxChildPages * 2) queue.push(link);
        }
      }
    } catch (error) {
      errors.push({ url, message: error.message });
    }
  }

  return { pages, errors };
}

async function fetchFinderCandidates(format) {
  const cacheKey = format;
  if (candidateCache.has(cacheKey)) return candidateCache.get(cacheKey);

  const q = [
    `legal:${format}`,
    "(",
    "o:token",
    "or o:Treasure",
    "or o:Food",
    "or o:Clue",
    "or o:Blood",
    "or o:Map",
    "or o:Powerstone",
    "or o:Incubator",
    "or o:Amass",
    "or o:Offspring",
    "or o:Role",
    "or o:emblem",
    "or o:\"gets an emblem\"",
    "or o:\"create a copy\"",
    "or o:\"copy of\"",
    "or o:\"Manifest\"",
    "or o:\"Cloak\"",
    "or o:\"Disguise\"",
    ")"
  ].join(" ");

  let url = `https://api.scryfall.com/cards/search?unique=cards&order=name&q=${encodeURIComponent(q)}`;
  const cards = [];
  while (url) {
    const data = await fetchJson(url);
    cards.push(...data.data);
    url = data.has_more ? data.next_page : null;
    if (url) await sleep(scryfallDelayMs);
  }

  candidateCache.set(cacheKey, cards);
  return cards;
}

async function fetchJapaneseName(cardName) {
  if (japaneseCache.has(cardName)) return japaneseCache.get(cardName);

  await sleep(scryfallDelayMs);
  const q = `!"${cardName}" lang:ja`;
  const url = `https://api.scryfall.com/cards/search?unique=prints&include_multilingual=true&q=${encodeURIComponent(q)}`;

  try {
    const data = await fetchJson(url);
    const printedName = data.data?.find((card) => card.printed_name)?.printed_name || "";
    japaneseCache.set(cardName, printedName);
    return printedName;
  } catch {
    japaneseCache.set(cardName, "");
    return "";
  }
}

async function fetchRelatedCard(part) {
  if (!part?.uri) return null;
  if (relatedCache.has(part.uri)) return relatedCache.get(part.uri);
  await sleep(scryfallDelayMs);
  const card = await fetchJson(part.uri);
  relatedCache.set(part.uri, card);
  return card;
}

function cardText(card) {
  return [card.oracle_text, ...(card.card_faces || []).map((face) => face.oracle_text)]
    .filter(Boolean)
    .join("\n");
}

function objectKind(cardOrPart) {
  const type = cardOrPart?.type_line || "";
  if (/emblem/i.test(type)) return "Emblem";
  if (/token/i.test(type)) return "Token";
  return "Marker";
}

function objectCategory(item) {
  const haystack = `${item.name} ${item.typeLine}`.toLowerCase();
  if (haystack.includes("emblem")) return "紋章";
  if (haystack.includes("copy")) return "コピー";
  if (haystack.includes("treasure")) return "宝物";
  if (haystack.includes("food")) return "食物";
  if (haystack.includes("clue")) return "手掛かり";
  if (haystack.includes("blood")) return "血";
  if (haystack.includes("map")) return "地図";
  if (haystack.includes("incubator")) return "培養器";
  if (haystack.includes("role")) return "役割";
  if (haystack.includes("army")) return "軍団";
  if (haystack.includes("manifest") || haystack.includes("cloak") || haystack.includes("disguise")) return "裏向き";
  return item.kind === "Emblem" ? "紋章" : "トークン";
}

function tokenHints(card) {
  const text = cardText(card);
  const hints = [];
  const patterns = [
    [/Treasure/gi, "Treasure"],
    [/Food/gi, "Food"],
    [/Clue/gi, "Clue"],
    [/Blood/gi, "Blood"],
    [/\bMap\b/gi, "Map"],
    [/Powerstone/gi, "Powerstone"],
    [/Incubator/gi, "Incubator"],
    [/Role/gi, "Role"],
    [/Amass/gi, "Army"],
    [/Offspring/gi, "Offspring copy"],
    [/emblem/gi, "Emblem"],
    [/copy of|create a copy/gi, "Copy marker"],
    [/Manifest|Cloak|Disguise/gi, "Face-down marker"]
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) hints.push(label);
  }

  const createMatches = text.match(/create[s]? (?:a|an|one|two|three|four|x|that many) [^.]*?(?:token|copy|emblem)[s]?/gi) || [];
  for (const phrase of createMatches.slice(0, 3)) hints.push(phrase.replace(/\s+/g, " "));

  return [...new Set(hints)].slice(0, 8);
}

function imageFor(card) {
  if (card.image_uris?.normal) return card.image_uris.normal;
  return card.card_faces?.find((face) => face.image_uris?.normal)?.image_uris.normal || "";
}

function officialExpansionCode(setCode) {
  const code = String(setCode || "").toUpperCase();
  if (/^T[A-Z0-9]{3,}$/.test(code)) return code.slice(1);
  return code;
}

function officialExpansionName(setName) {
  return String(setName || "").replace(/\s+Tokens$/i, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCardMentions(cards, pages) {
  const pageTexts = pages.map((page) => page.text.toLowerCase());
  const results = [];

  for (const card of cards) {
    const names = [card.name, ...(card.card_faces || []).map((face) => face.name)].filter(Boolean);
    const mentionedSources = [];

    for (let index = 0; index < pages.length; index += 1) {
      const text = pageTexts[index];
      const found = names.some((name) => {
        const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(name.toLowerCase())}([^a-z0-9]|$)`, "i");
        return pattern.test(text);
      });
      if (found) mentionedSources.push(pages[index].url);
    }

    if (mentionedSources.length) {
      results.push({
        id: card.id,
        raw: card,
        name: card.name,
        manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost || "",
        typeLine: card.type_line,
        set: officialExpansionCode(card.set),
        setName: officialExpansionName(card.set_name),
        releasedAt: card.released_at || "",
        rarity: card.rarity,
        image: imageFor(card),
        oracleText: card.oracle_text || card.card_faces?.map((face) => `${face.name}: ${face.oracle_text}`).join("\n\n") || "",
        scryfallUri: card.scryfall_uri,
        tokenHints: tokenHints(card),
        sources: [...new Set(mentionedSources)].slice(0, 8)
      });
    }
  }

  return results.sort((a, b) => b.sources.length - a.sources.length || a.name.localeCompare(b.name));
}

function makeVirtualObject(sourceCard, kind, name, note) {
  return {
    id: `${sourceCard.id}-${kind.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    japaneseName: "",
    kind,
    category: kind === "Emblem" ? "紋章" : "コピー/補助",
    typeLine: `${kind} helper`,
    set: sourceCard.set,
    setName: `${sourceCard.setName} / 補助`,
    releasedAt: sourceCard.releasedAt || "",
    image: imageFor(sourceCard),
    scryfallUri: sourceCard.scryfallUri,
    note
  };
}

async function objectsForSource(source) {
  const produced = [];
  const parts = source.raw.all_parts || [];

  for (const part of parts) {
    const typeLine = part.type_line || "";
    if (!/token|emblem/i.test(typeLine) && !/token|emblem/i.test(part.component || "")) continue;
    try {
      const related = await fetchRelatedCard(part);
      if (!related) continue;
      const item = {
        id: related.id,
        name: related.name,
        japaneseName: "",
        kind: objectKind(related),
        typeLine: related.type_line,
        set: officialExpansionCode(related.set || source.set),
        setName: officialExpansionName(related.set_name || source.setName),
        releasedAt: related.released_at || source.releasedAt || "",
        image: imageFor(related),
        scryfallUri: related.scryfall_uri || source.scryfallUri,
        note: ""
      };
      item.category = objectCategory(item);
      item.japaneseName = await fetchJapaneseName(item.name);
      produced.push(item);
    } catch {
      // Keep going if Scryfall omits a related object.
    }
  }

  const text = cardText(source.raw);
  if (/copy of|create a copy|token that's a copy|Offspring/i.test(text) && !produced.some((item) => /copy/i.test(item.name + item.typeLine))) {
    produced.push(makeVirtualObject(source, "Marker", "Copy token / copy marker", "コピー系。汎用コピー・トークンや空白トークンを探す。"));
  }

  if (/emblem/i.test(text) && !produced.some((item) => item.kind === "Emblem")) {
    produced.push(makeVirtualObject(source, "Emblem", `${source.name} Emblem`, "紋章。該当プレインズウォーカーの紋章を探す。"));
  }

  if (/Manifest|Cloak|Disguise/i.test(text)) {
    produced.push(makeVirtualObject(source, "Marker", "Face-down / Manifest helper", "予示・偽装・変装など。必要なら裏向き用の補助カードを用意。"));
  }

  return produced;
}

async function buildBulkObjects(matchedCards) {
  const byKey = new Map();

  for (const source of matchedCards) {
    const objects = await objectsForSource(source);
    for (const object of objects) {
      const key = `${object.set}|${object.name}|${object.typeLine}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          ...object,
          sources: [],
          sourceCards: []
        });
      }

      const existing = byKey.get(key);
      existing.sources.push(...source.sources);
      existing.sourceCards.push({
        name: source.name,
        japaneseName: source.japaneseName || "",
        set: source.set,
        setName: source.setName,
        releasedAt: source.releasedAt,
        oracleText: source.oracleText,
        scryfallUri: source.scryfallUri,
        image: source.image,
        hints: source.tokenHints
      });
      existing.sources = [...new Set(existing.sources)].slice(0, 12);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const setOrder = a.setName.localeCompare(b.setName);
    if (setOrder) return setOrder;
    const categoryOrder = a.category.localeCompare(b.category, "ja");
    if (categoryOrder) return categoryOrder;
    return a.name.localeCompare(b.name);
  });
}

function groupObjectsBySet(objects) {
  const groups = [];
  const bySet = new Map();

  for (const object of objects) {
    const key = `${object.set}|${object.setName}`;
    if (!bySet.has(key)) {
      const group = {
        set: object.set,
        setName: object.setName,
        releasedAt: object.releasedAt || "",
        count: 0,
        objects: []
      };
      bySet.set(key, group);
      groups.push(group);
    }
    const group = bySet.get(key);
    group.objects.push(object);
    group.count += 1;
    if (!group.releasedAt || (object.releasedAt && object.releasedAt < group.releasedAt)) {
      group.releasedAt = object.releasedAt;
    }
  }

  return groups;
}

async function handleTokenCards(req, res) {
  const body = JSON.parse(await readBody(req) || "{}");
  const format = String(body.format || "standard").toLowerCase();
  const sourceUrls = Array.isArray(body.sources) && body.sources.length
    ? body.sources
    : defaultSources[format] || defaultSources.standard;
  const maxChildPages = Math.min(Number(body.maxChildPages || 24), 48);

  const [candidates, crawl] = await Promise.all([
    fetchFinderCandidates(format),
    crawlSources(sourceUrls, maxChildPages)
  ]);

  const matched = findCardMentions(candidates, crawl.pages);
  for (const card of matched.slice(0, 100)) {
    card.japaneseName = await fetchJapaneseName(card.name);
  }

  const objects = await buildBulkObjects(matched.slice(0, 100));
  const deckResults = deckResultsFromPages(crawl.pages, sourceUrls);

  sendJson(res, 200, {
    format,
    sourceUrls,
    scannedPages: crawl.pages.map((page) => page.url),
    errors: crawl.errors,
    searchedDecks: deckResults,
    searchedDeckCount: deckResults.length,
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
