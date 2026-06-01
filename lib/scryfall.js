import { scryfallDelayMs, scryfallCacheTtlMs } from "./config.js";
import { tokenJapaneseNameMap } from "./data.js";
import { sleep, escapeRegex } from "./util.js";
import { fetchJson } from "./cache.js";

const candidateCache = new Map();
const japaneseCache = new Map();
const relatedCache = new Map();
const scryfallJsonTimeoutMs = 45_000;
const scryfallRetryCount = 2;

function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { map.delete(key); return undefined; }
  return entry.value;
}

function cacheSet(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + scryfallCacheTtlMs });
}

async function fetchScryfallJson(url, label = "request") {
  let lastError;
  for (let attempt = 0; attempt <= scryfallRetryCount; attempt += 1) {
    try {
      if (attempt > 0) {
        const waitMs = scryfallDelayMs * (attempt + 4);
        console.log(`[scryfall] retry ${attempt}/${scryfallRetryCount} ${label}`);
        await sleep(waitMs);
      }
      return await fetchJson(url, { timeoutMs: scryfallJsonTimeoutMs });
    } catch (error) {
      lastError = error;
      const retryable = error.name === "AbortError" || /429|5\d\d/.test(error.message || "");
      if (!retryable || attempt === scryfallRetryCount) break;
    }
  }
  throw lastError;
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
    "or o:daybound",
    "or o:nightbound",
    "or o:\"Job Select\"",
    ")"
  ].join(" ");

  let url = `https://api.scryfall.com/cards/search?unique=cards&order=name&q=${encodeURIComponent(q)}`;
  const cards = [];
  while (url) {
    const data = await fetchScryfallJson(url, "candidate search");
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

  // 実カードの日本語名は fetchJapanesePrint に集約する（同一クエリの二重呼び出しを避ける）。
  const print = await fetchJapanesePrint(cardName);
  const printedName = print?.printed_name || "";
  cacheSet(japaneseCache, cardName, printedName);
  return printedName;
}

export async function fetchRelatedCard(part) {
  if (!part?.uri) return null;
  const cached = cacheGet(relatedCache, part.uri);
  if (cached !== undefined) return cached;
  await sleep(scryfallDelayMs);
  const card = await fetchScryfallJson(part.uri, `related ${part.name || "card"}`);
  cacheSet(relatedCache, part.uri, card);
  return card;
}

async function fetchJapaneseObjectPrint(cardName, objectType) {
  const objectName = String(cardName || "").replace(/\s+Token$/i, "").trim();
  if (!objectName) return null;
  const q = `type:${objectType} name:"${objectName}" lang:ja`;
  const url = `https://api.scryfall.com/cards/search?unique=prints&include_multilingual=true&q=${encodeURIComponent(q)}`;
  const data = await fetchScryfallJson(url, `ja ${objectType} print ${cardName}`);
  const typePattern = objectType === "emblem" ? /emblem/i : /token/i;
  return data.data?.find((item) => item.lang === "ja" && typePattern.test(item.type_line || "")) || null;
}

export async function fetchJapanesePrint(cardName, options = {}) {
  const objectKind = String(options.objectKind || "").toLowerCase();
  const preferObjectType = objectKind === "token" || objectKind === "emblem";
  const cacheKey = `print:${objectKind || "card"}:${cardName}`;
  const cached = cacheGet(japaneseCache, cacheKey);
  if (cached !== undefined) return cached;
  await sleep(scryfallDelayMs);
  const objectType = objectKind === "emblem" ? "emblem" : "token";
  let objectLookupAttempted = false;

  if (preferObjectType) {
    try {
      objectLookupAttempted = true;
      const objectCard = await fetchJapaneseObjectPrint(cardName, objectType);
      if (objectCard) {
        cacheSet(japaneseCache, cacheKey, objectCard);
        return objectCard;
      }
    } catch {
      // Fall back to exact card-name lookup below.
    }
  }

  const exactQ = `!"${cardName}" lang:ja`;
  try {
    const url = `https://api.scryfall.com/cards/search?unique=prints&include_multilingual=true&q=${encodeURIComponent(exactQ)}`;
    const data = await fetchScryfallJson(url, `ja print ${cardName}`);
    const card = data.data?.find((item) => item.lang === "ja") || null;
    if (card) {
      cacheSet(japaneseCache, cacheKey, card);
      return card;
    }
  } catch {
    // Token object names commonly include "Token" in English while Scryfall's
    // multilingual token prints are named by the object itself, e.g. "Treasure".
  }

  const tokenName = String(cardName || "").replace(/\s+Token$/i, "").trim();
  if (tokenName && !objectLookupAttempted && (tokenName !== cardName || preferObjectType)) {
    try {
      const tokenCard = await fetchJapaneseObjectPrint(cardName, objectType);
      cacheSet(japaneseCache, cacheKey, tokenCard);
      return tokenCard;
    } catch {
      // Fall through to the shared null cache below.
    }
  }

  cacheSet(japaneseCache, cacheKey, null);
  return null;
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
    return jaRelated?.printed_name || "";
  } catch {
    return "";
  }
}
