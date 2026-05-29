import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(".");
const publicDir = join(root, "public");
const cacheDir = join(root, ".cache", "pages");
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
    "https://www.hareruyamtg.com/ja/deck/",
    "https://article.hareruyamtg.com/article/?s=%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%80%E3%83%BC%E3%83%89",
    "https://mtg-jp.com/coverage/",
    "https://www.mtggoldfish.com/metagame/standard",
    "https://mtgdecks.net/Standard/decklists",
    "https://magic.gg/decklists",
    "https://mtgtop8.com/format?f=ST",
    "https://www.mtgo.com/decklists",
    "https://mtgazone.com/decks/standard/"
  ],
  pioneer: [
    "https://www.hareruyamtg.com/ja/deck/",
    "https://article.hareruyamtg.com/article/?s=%E3%83%91%E3%82%A4%E3%82%AA%E3%83%8B%E3%82%A2",
    "https://mtg-jp.com/coverage/",
    "https://www.mtggoldfish.com/metagame/pioneer",
    "https://mtgdecks.net/Pioneer/decklists",
    "https://magic.gg/decklists",
    "https://mtgtop8.com/format?f=PI",
    "https://www.mtgo.com/decklists",
    "https://mtgazone.com/decks/pioneer/"
  ],
  modern: [
    "https://www.hareruyamtg.com/ja/deck/",
    "https://article.hareruyamtg.com/article/?s=%E3%83%A2%E3%83%80%E3%83%B3",
    "https://mtg-jp.com/coverage/",
    "https://www.mtggoldfish.com/metagame/modern",
    "https://mtgdecks.net/Modern/decklists",
    "https://magic.gg/decklists",
    "https://mtgtop8.com/format?f=MO",
    "https://www.mtgo.com/decklists",
    "https://mtgazone.com/decks/modern/"
  ],
  legacy: [
    "https://www.hareruyamtg.com/ja/deck/",
    "https://article.hareruyamtg.com/article/?s=%E3%83%AC%E3%82%AC%E3%82%B7%E3%83%BC",
    "https://mtg-jp.com/coverage/",
    "https://www.mtggoldfish.com/metagame/legacy",
    "https://mtgdecks.net/Legacy/decklists",
    "https://magic.gg/decklists",
    "https://mtgtop8.com/format?f=LE",
    "https://www.mtgo.com/decklists"
  ]
};

const formatEnvironmentEvents = {
  standard: [
    {
      date: "2025-07-25",
      affectsFormat: true,
      type: "rotation",
      title: "2025 Standard rotation at Edge of Eternities prerelease",
      reason: "Edge of Eternities prerelease caused Standard rotation for tabletop play.",
      sourceUrl: "https://magic.gg/news/metagame-mentor-the-winners-and-losers-from-standards-2025-rotation"
    },
    {
      date: "2026-04-24",
      affectsFormat: true,
      type: "set-release",
      title: "Secrets of Strixhaven tabletop release",
      reason: "Secrets of Strixhaven became Standard legal, adding a new Standard-legal set.",
      sourceUrl: "https://magic.wizards.com/en/news/feature/collecting-secrets-of-strixhaven"
    },
    {
      date: "2026-05-18",
      affectsFormat: false,
      type: "banned-restricted",
      title: "Banned and Restricted Announcement - May 18, 2026",
      reason: "The latest B&R announcement did not change Standard, so it is shown as context but does not reset the environment start.",
      sourceUrl: "https://magic.wizards.com/en/news/announcements/banned-and-restricted-may-18-2026"
    }
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

function cacheFileForUrl(url) {
  const hash = createHash("sha256").update(url).digest("hex");
  return join(cacheDir, `${hash}.json`);
}

async function readCachedPage(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  try {
    const raw = await readFile(cacheFileForUrl(url), "utf8");
    const cached = JSON.parse(raw);
    if (cached?.url === url && cached.html) {
      pageCache.set(url, cached);
      return cached;
    }
  } catch {
    // Cache miss.
  }
  return null;
}

async function writeCachedPage(entry) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFileForUrl(entry.url), JSON.stringify(entry), "utf8");
  pageCache.set(entry.url, entry);
}

async function fetchPage(url, options = {}) {
  const useCache = options.useCache !== false;
  const refreshCache = options.refreshCache === true;
  const cached = useCache && !refreshCache ? await readCachedPage(url) : null;
  if (cached) return { ...cached, fromCache: true, staleCache: false };

  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "text/html,text/plain,*/*" }
  }).catch(async (error) => {
    const fallback = useCache ? await readCachedPage(url) : null;
    if (fallback) return { fallback, error };
    throw error;
  });

  if (response.fallback) {
    return { ...response.fallback, fromCache: true, staleCache: true };
  }

  if (!response.ok) {
    const fallback = useCache ? await readCachedPage(url) : null;
    if (fallback) return { ...fallback, fromCache: true, staleCache: true };
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const entry = {
    url,
    title: extractTitle(html, url),
    publishedDate: extractPublishedDate(html),
    html,
    text: normalizeText(html),
    fetchedAt: new Date().toISOString()
  };
  await writeCachedPage(entry);
  return { ...entry, fromCache: false, staleCache: false };
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

function toIsoDate(value) {
  if (!value) return "";
  const direct = String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function extractPublishedDate(html) {
  const patterns = [
    /publishedDate:"([^"]+)"/i,
    /"publishedDate":"([^"]+)"/i,
    /property="article:published_time"\s+content="([^"]+)"/i,
    /name="date"\s+content="([^"]+)"/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const date = toIsoDate(match?.[1]);
    if (date) return date;
  }
  return "";
}

function isDateInEnvironment(date, environmentStartDate, targetDate) {
  if (!date) return true;
  const target = new Date(`${targetDate}T00:00:00Z`);
  const start = new Date(`${environmentStartDate}T00:00:00Z`);
  const current = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return true;
  return current >= start && current <= target;
}

function formatEnvironmentInfo(format, targetDate) {
  const events = formatEnvironmentEvents[format] || [];
  const applicable = events
    .filter((event) => event.date <= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const resetEvent = [...applicable].reverse().find((event) => event.affectsFormat);
  const contextEvents = applicable
    .filter((event) => !event.affectsFormat && event.date >= (resetEvent?.date || "0000-00-00"))
    .slice(-3);

  if (!resetEvent) {
    return {
      format,
      targetDate,
      startDate: "",
      reason: "環境開始日を自動判定できませんでした。日付の取れるデッキは大会日以前として扱います。",
      resetEvent: null,
      contextEvents
    };
  }

  return {
    format,
    targetDate,
    startDate: resetEvent.date,
    reason: `${resetEvent.date} の ${resetEvent.title} により現在の${format.toUpperCase()}環境が始まったものとして扱います。`,
    resetEvent,
    contextEvents
  };
}

function isDeckResultPage(url, sourceUrls) {
  const lower = url.toLowerCase();
  const sourceSet = new Set(sourceUrls.map((source) => source.toLowerCase()));
  if (lower.includes("mtggoldfish.com/deck/")) return true;
  if (lower.includes("magic.gg/decklists/") && !lower.endsWith("/decklists")) return true;
  if (/mtgdecks\.net\/(standard|pioneer|modern|legacy)\/(?!decklists)/i.test(url)) return true;
  return sourceSet.has(lower) && !/\/metagame\/|\/decklists\/?$/i.test(lower);
}

function decodeEmbeddedDeckMarkup(html) {
  return html
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\"/g, "\"")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&");
}

function extractDeckEntries(html, pageUrl, pageTitle, sourceUrls, pageDate = "") {
  const decoded = decodeEmbeddedDeckMarkup(html);
  const entries = [];
  const pattern = /<deck-list\b([^>]*)>([\s\S]*?)<\/deck-list>/gi;
  let match;
  let index = 0;

  while ((match = pattern.exec(decoded))) {
    const attrs = match[1];
    const body = match[2] || "";
    const title = attrs.match(/\bdeck-title="([^"]+)"/i)?.[1]?.trim() || `Deck ${index + 1}`;
    const subtitle = attrs.match(/\bsubtitle="([^"]+)"/i)?.[1]?.trim() || "";
    const eventDate = toIsoDate(attrs.match(/\bevent-date="([^"]+)"/i)?.[1]) || pageDate;
    entries.push({
      title: subtitle ? `${title} - ${subtitle}` : title,
      url: `${pageUrl}#deck-${index + 1}`,
      pageTitle,
      pageUrl,
      eventDate,
      text: normalizeText(body)
    });
    index += 1;
  }

  if (!entries.length && isDeckResultPage(pageUrl, sourceUrls)) {
    entries.push({ title: pageTitle, url: pageUrl, pageTitle, pageUrl, eventDate: pageDate, text: normalizeText(html) });
  }

  return entries;
}

function deckResultsFromPages(pages) {
  const deckPages = pages.flatMap((page) => page.deckEntries || []);
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
    if (lower.includes("mtgtop8.com/event")) return true;
    if (lower.includes("mtgtop8.com/format")) return true;
    if (lower.includes("mtgo.com/decklist/")) return true;
    if (lower.includes("mtgo.com/decklists")) return true;
    if (lower.includes("mtgazone.com/deck/")) return true;
    if (lower.includes("mtgazone.com/decks/")) return true;
    if (lower.includes("hareruyamtg.com/ja/deck/")) return true;
    if (lower.includes("hareruyamtg.com/en/deck/")) return true;
    if (lower.includes("article.hareruyamtg.com/article/")) return true;
    if (lower.includes("mtg-jp.com/coverage/")) return true;
    if (lower.includes("melee.gg/decklist/")) return true;
    if (lower.includes("melee.gg/tournament/view/")) return true;
    if (lower.includes("melee.gg/tournament/")) return true;
    if (lower.includes("spellbinder.gg/events/")) return true;
    if (lower.includes("spellbinder.gg/decks/")) return true;
    return false;
  });
}

async function crawlSources(sourceUrls, maxDecks, options = {}) {
  const pages = [];
  const errors = [];
  const cacheStats = { hits: 0, staleHits: 0, network: 0 };
  const queue = [...new Set(sourceUrls.filter(Boolean))];
  const seen = new Set();
  const targetDate = options.targetDate || new Date().toISOString().slice(0, 10);
  const environmentStartDate = options.environmentStartDate || "2026-04-24";
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

function displayCategory(item) {
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

function findNameInText(names, text) {
  return names.some((name) => {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(name.toLowerCase())}([^a-z0-9]|$)`, "i");
    return pattern.test(text);
  });
}

function findCardMentions(cards, pages) {
  const pageTexts = pages.map((page) => page.text.toLowerCase());
  const deckEntries = pages.flatMap((page) => page.deckEntries || []);
  const results = [];

  for (const card of cards) {
    const names = [card.name, ...(card.card_faces || []).map((face) => face.name)].filter(Boolean);
    const mentionedSources = [];
    const mentionedDecks = [];

    for (const deck of deckEntries) {
      if (findNameInText(names, String(deck.text || "").toLowerCase())) {
        mentionedDecks.push({
          title: deck.title,
          url: deck.url,
          pageTitle: deck.pageTitle,
          pageUrl: deck.pageUrl
        });
        mentionedSources.push(deck.pageUrl);
      }
    }

    if (!mentionedDecks.length) {
      for (let index = 0; index < pages.length; index += 1) {
        if (findNameInText(names, pageTexts[index])) {
          mentionedSources.push(pages[index].url);
        }
      }
    }

    if (mentionedSources.length) {
      const uniqueDecks = [...new Map(mentionedDecks.map((deck) => [deck.url, deck])).values()];
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
        deckCount: uniqueDecks.length || mentionedSources.length,
        decks: uniqueDecks.slice(0, 24),
        sources: [...new Set(mentionedSources)].slice(0, 8)
      });
    }
  }

  return results.sort((a, b) => b.sources.length - a.sources.length || a.name.localeCompare(b.name));
}

function makeVirtualObject(sourceCard, kind, name, note) {
  const category = name.includes("Copy") ? "コピー" : kind === "Emblem" ? "紋章" : "裏向き";
  return {
    id: `${sourceCard.id}-${kind.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    japaneseName: "",
    kind,
    category,
    typeLine: `${kind} helper`,
    set: sourceCard.set,
    setName: sourceCard.setName,
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
      item.category = displayCategory(item);
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

  for (const item of produced) {
    item.category = displayCategory(item);
    if (item.name === "Copy token / copy marker") item.note = "コピー系。汎用コピー・トークンや空白トークンを探す。";
    if (item.name.endsWith(" Emblem")) item.note = "紋章。該当プレインズウォーカーの紋章を探す。";
    if (item.name === "Face-down / Manifest helper") item.note = "予示・偽装・変装など。必要なら裏向き用の補助カードを用意。";
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
          deckCount: 0,
          decks: [],
          sources: [],
          sourceCards: []
        });
      }

      const existing = byKey.get(key);
      existing.deckCount += source.deckCount || 0;
      existing.decks.push(...(source.decks || []));
      existing.sources.push(...source.sources);
      existing.sourceCards.push({
        name: source.name,
        japaneseName: source.japaneseName || "",
        deckCount: source.deckCount || 0,
        decks: source.decks || [],
        set: source.set,
        setName: source.setName,
        releasedAt: source.releasedAt,
        oracleText: source.oracleText,
        scryfallUri: source.scryfallUri,
        image: source.image,
        hints: source.tokenHints
      });
      existing.decks = [...new Map(existing.decks.map((deck) => [deck.url, deck])).values()].slice(0, 36);
      existing.deckCount = existing.decks.length || existing.deckCount;
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

  const matched = findCardMentions(candidates, crawl.pages);
  for (const card of matched.slice(0, 100)) {
    card.japaneseName = await fetchJapaneseName(card.name);
  }

  const objects = await buildBulkObjects(matched.slice(0, 100));
  const deckResults = deckResultsFromPages(crawl.pages).slice(0, maxChildPages);

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
      await rm(cacheDir, { recursive: true, force: true });
      pageCache.clear();
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
