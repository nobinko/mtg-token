import { scryfallDelayMs, scryfallCacheTtlMs } from "./config.js";
import { tokenJapaneseNameMap } from "./data.js";
import { sleep, escapeRegex } from "./util.js";
import { fetchJson } from "./cache.js";

const candidateCache = new Map();
const japaneseCache = new Map();
const relatedCache = new Map();

function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { map.delete(key); return undefined; }
  return entry.value;
}

function cacheSet(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + scryfallCacheTtlMs });
}

export async function fetchFinderCandidates(format) {
  const cached = cacheGet(candidateCache, format);
  if (cached) return cached;

  const q = [
    `legal:${format}`,
    "game:paper",
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
    "or keyword:adventure",
    "or keyword:omen",
    "or o:\"Start Your Engines\"",
    "or keyword:exhaust",
    "or keyword:plot",
    "or o:Endure",
    "or o:Mobilize",
    "or o:Behold",
    "or o:Impending",
    "or o:daybound",
    "or o:nightbound",
    "or o:\"Job Select\"",
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

  cacheSet(candidateCache, format, cards);
  return cards;
}

export async function fetchJapaneseName(cardName) {
  const cached = cacheGet(japaneseCache, cardName);
  if (cached !== undefined) return cached;

  if (tokenJapaneseNameMap.has(cardName)) {
    const mapped = tokenJapaneseNameMap.get(cardName);
    cacheSet(japaneseCache, cardName, mapped);
    return mapped;
  }

  for (const [english, japanese] of tokenJapaneseNameMap.entries()) {
    const pattern = new RegExp(`(^|[^A-Za-z])${escapeRegex(english)}([^A-Za-z]|$)`, "i");
    if (pattern.test(cardName)) {
      cacheSet(japaneseCache, cardName, japanese);
      return japanese;
    }
  }

  if (/ Emblem$/i.test(cardName)) {
    const baseName = cardName.replace(/ Emblem$/i, "");
    const baseJapanese = await fetchJapaneseName(baseName);
    const mapped = baseJapanese ? `${baseJapanese}の紋章` : `${baseName}の紋章`;
    cacheSet(japaneseCache, cardName, mapped);
    return mapped;
  }

  await sleep(scryfallDelayMs);
  const q = `!"${cardName}" lang:ja`;
  const url = `https://api.scryfall.com/cards/search?unique=prints&include_multilingual=true&q=${encodeURIComponent(q)}`;

  try {
    const data = await fetchJson(url);
    const printedName = data.data?.find((card) => card.printed_name)?.printed_name || "";
    cacheSet(japaneseCache, cardName, printedName);
    return printedName;
  } catch {
    cacheSet(japaneseCache, cardName, "");
    return "";
  }
}

export async function fetchRelatedCard(part) {
  if (!part?.uri) return null;
  const cached = cacheGet(relatedCache, part.uri);
  if (cached !== undefined) return cached;
  await sleep(scryfallDelayMs);
  const card = await fetchJson(part.uri);
  cacheSet(relatedCache, part.uri, card);
  return card;
}

async function fetchJapanesePrint(cardName) {
  const cacheKey = `print:${cardName}`;
  const cached = cacheGet(japaneseCache, cacheKey);
  if (cached !== undefined) return cached;
  await sleep(scryfallDelayMs);
  const q = `!"${cardName}" lang:ja`;
  const url = `https://api.scryfall.com/cards/search?unique=prints&include_multilingual=true&q=${encodeURIComponent(q)}`;
  try {
    const data = await fetchJson(url);
    const card = data.data?.find((item) => item.lang === "ja") || null;
    cacheSet(japaneseCache, cacheKey, card);
    return card;
  } catch {
    cacheSet(japaneseCache, cacheKey, null);
    return null;
  }
}

function relatedPartKey(part) {
  return `${part.name || ""}|${part.type_line || ""}`.toLowerCase();
}

export async function fetchJapaneseRelatedObjectName(sourceName, relatedObject) {
  const sourceJa = await fetchJapanesePrint(sourceName);
  const relatedParts = sourceJa?.all_parts || [];
  const targetKey = relatedPartKey(relatedObject);
  const targetName = String(relatedObject.name || "").toLowerCase();
  const targetType = String(relatedObject.type_line || "").toLowerCase();
  const match = relatedParts.find((part) => {
    const partKey = relatedPartKey(part);
    if (partKey === targetKey) return true;
    const partName = String(part.name || "").toLowerCase();
    const partType = String(part.type_line || "").toLowerCase();
    return partName === targetName && partType === targetType;
  });

  if (!match?.uri) return "";
  try {
    const jaRelated = await fetchRelatedCard(match);
    return jaRelated?.printed_name || jaRelated?.name || "";
  } catch {
    return "";
  }
}
