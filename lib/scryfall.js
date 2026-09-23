import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scryfallDelayMs, scryfallSearchDelayMs, scryfallCacheTtlMs } from "./config.js";
import { mtgJpProductIds, officialJapaneseCardOverrides, tokenJapaneseNameMap } from "./data.js";
import { sleep, escapeRegex } from "./util.js";
import { fetchJson } from "./cache.js";
import { chooseTokenPrint, tokenPrintRank } from "./token-prints.js";

const candidateCache = new Map();
const candidateRequests = new Map();
const japaneseCache = new Map();
const relatedCache = new Map();
const tokenPrintCache = new Map();
const mtgJpCardCache = new Map();
const cardMetadataCache = new Map();
const scryfallJsonTimeoutMs = 45_000;
const scryfallRetryCount = 4;
const scryfallDiskCacheDir = resolve(".cache", "scryfall");
// 候補検索クエリを変えたら +1 する。TTL内の古いクエリ結果を新規取得の代わりに使わないための版数。
// 取得失敗時の代替（allowStale）では版違いでも使う。
const candidateQueryVersion = 3;
const slowScryfallPaths = new Set([
  "/cards/search",
  "/cards/named",
  "/cards/random",
  "/cards/collection"
]);
let lastScryfallRequestAt = 0;
let scryfallThrottle = Promise.resolve();

function scryfallDelayFor(url) {
  try {
    return slowScryfallPaths.has(new URL(url).pathname)
      ? scryfallSearchDelayMs
      : scryfallDelayMs;
  } catch {
    return scryfallDelayMs;
  }
}

async function waitForScryfallSlot(url) {
  const delayMs = scryfallDelayFor(url);
  const wait = scryfallThrottle.then(async () => {
    const elapsed = Date.now() - lastScryfallRequestAt;
    if (elapsed < delayMs) await sleep(delayMs - elapsed);
    lastScryfallRequestAt = Date.now();
  });
  scryfallThrottle = wait.catch(() => {});
  return wait;
}

function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { map.delete(key); return undefined; }
  return entry.value;
}

function cacheSet(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + scryfallCacheTtlMs });
}

function candidateDiskCachePath(format) {
  return join(scryfallDiskCacheDir, `candidates-${format}.json`);
}

async function readCandidateDiskCache(format, { allowStale = false } = {}) {
  try {
    const raw = await readFile(candidateDiskCachePath(format), "utf8");
    const entry = JSON.parse(raw);
    if (!Array.isArray(entry?.cards)) return null;
    if (!allowStale && Date.now() > Number(entry.expiresAt || 0)) return null;
    if (!allowStale && Number(entry.queryVersion || 0) !== candidateQueryVersion) return null;
    return entry.cards;
  } catch {
    return null;
  }
}

async function writeCandidateDiskCache(format, cards) {
  await mkdir(scryfallDiskCacheDir, { recursive: true });
  await writeFile(candidateDiskCachePath(format), JSON.stringify({
    format,
    queryVersion: candidateQueryVersion,
    fetchedAt: new Date().toISOString(),
    expiresAt: Date.now() + scryfallCacheTtlMs,
    cards
  }), "utf8");
}

export function printedNameFor(card) {
  if (!card) return "";
  if (card.printed_name) return card.printed_name;
  const faceNames = (card.card_faces || [])
    .map((face) => face.printed_name || "")
    .filter(Boolean);
  return faceNames.join(" // ");
}

function normalizeCardName(name) {
  return String(name || "")
    .replace(/\s+\/\/\s+/g, " // ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;|&#47;/g, "/")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function printedTextFor(card) {
  if (!card) return "";
  if (card.printed_text) return card.printed_text;
  return (card.card_faces || [])
    .map((face) => face.printed_text || "")
    .filter(Boolean)
    .join("\n");
}

async function fetchScryfallJson(url, label = "request", options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= scryfallRetryCount; attempt += 1) {
    try {
      if (attempt > 0) {
        const waitMs = Math.min(10_000, scryfallDelayMs * (attempt + 4) * attempt);
        console.log(`[scryfall] retry ${attempt}/${scryfallRetryCount} ${label}`);
        await sleep(waitMs);
      }
      await waitForScryfallSlot(url);
      return await fetchJson(url, { timeoutMs: scryfallJsonTimeoutMs, ...options });
    } catch (error) {
      lastError = error;
      const retryable = error.name === "AbortError" || error.status === 429 || /5\d\d/.test(error.message || "");
      if (!retryable || attempt === scryfallRetryCount) break;
      if (error.status === 429) {
        const retryAfterSeconds = Number(error.retryAfter || 0);
        const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, 30_000)
          : Math.min(30_000, 2_000 * (attempt + 1));
        console.log(`[scryfall] rate limited; waiting ${waitMs}ms ${label}`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

export async function fetchFinderCandidates(format, { refresh = false, persist = true } = {}) {
  if (refresh) return fetchFinderCandidatesUncached(format, { strict: true, persist });
  const cached = cacheGet(candidateCache, format);
  if (cached) return cached;
  const diskCached = await readCandidateDiskCache(format);
  if (diskCached) {
    cacheSet(candidateCache, format, diskCached);
    return diskCached;
  }
  if (candidateRequests.has(format)) return candidateRequests.get(format);

  const request = fetchFinderCandidatesUncached(format)
    .finally(() => candidateRequests.delete(format));
  candidateRequests.set(format, request);
  return request;
}

function metadataImage(card) {
  return card?.image_uris?.normal
    || card?.card_faces?.find((face) => face.image_uris?.normal)?.image_uris?.normal
    || "";
}

function publicCardMetadata(card) {
  return {
    name: card.name,
    typeLine: card.type_line || "",
    imageUrl: metadataImage(card),
    oracleText: card.oracle_text || card.card_faces?.map((face) => face.oracle_text || "").filter(Boolean).join("\n\n") || "",
    manaCost: card.mana_cost || card.card_faces?.[0]?.mana_cost || "",
    power: card.power || card.card_faces?.[0]?.power || "",
    toughness: card.toughness || card.card_faces?.[0]?.toughness || "",
    faces: (card.card_faces || []).map((face) => ({
      name: face.name || "",
      typeLine: face.type_line || "",
      imageUrl: face.image_uris?.normal || "",
      power: face.power || "",
      toughness: face.toughness || ""
    }))
  };
}

export async function fetchCardMetadata(names) {
  const requested = [...new Set((names || [])
    .map((name) => String(name || "").replace(/\s+/g, " ").trim())
    .filter(Boolean))].slice(0, 150);
  const results = new Map();
  const missing = [];

  for (const name of requested) {
    const cached = cacheGet(cardMetadataCache, normalizeCardName(name));
    if (cached !== undefined) results.set(normalizeCardName(name), cached);
    else missing.push(name);
  }

  for (let offset = 0; offset < missing.length; offset += 75) {
    const batch = missing.slice(offset, offset + 75);
    const data = await fetchScryfallJson("https://api.scryfall.com/cards/collection", "goldfish card metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) })
    });
    for (const card of data.data || []) {
      const metadata = publicCardMetadata(card);
      cacheSet(cardMetadataCache, normalizeCardName(card.name), metadata);
      results.set(normalizeCardName(card.name), metadata);
    }
    for (const identifier of data.not_found || []) {
      const name = String(identifier.name || "");
      if (!name) continue;
      cacheSet(cardMetadataCache, normalizeCardName(name), null);
      results.set(normalizeCardName(name), null);
    }
  }

  return requested.map((name) => results.get(normalizeCardName(name)) || { name, unavailable: true });
}

// 全セットカードから現物を抽出する。未発売カードをlegal検索で落とさない。
export async function fetchPreparationSet(setCode) {
  if (!/^[a-z0-9]{2,8}$/.test(setCode)) throw new Error("セットコードが不正です。");
  const metadata = await fetchScryfallJson(`https://api.scryfall.com/sets/${setCode}`, "preparation set");
  if (metadata.digital || !["expansion", "core", "commander", "draft_innovation", "masters"].includes(metadata.set_type)) throw new Error("紙のカードセットを指定してください。");
  let url = `https://api.scryfall.com/cards/search?unique=cards&q=${encodeURIComponent(`set:${setCode} game:paper`)}`;
  const cards = [];
  while (url) {
    const data = await fetchScryfallJson(url, "preparation cards");
    cards.push(...data.data);
    url = data.has_more ? data.next_page : null;
  }
  return { metadata, cards, fetchedAt: new Date().toISOString() };
}

async function fetchFinderCandidatesUncached(format, { strict = false, persist = true } = {}) {
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
    "or o:Morph",
    "or o:Megamorph",
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
    "or o:/airbend/",
    "or o:Paradigm",
    "or o:Recruit",
    ")"
  ].join(" ");
  // 2026-07-17 監査: TLA/ECL/TMT/SOS/MSH の新メカニズムを確認し、盤面の現物が要る
  // Airbend（除外して後で唱える）と Paradigm（解決後に追放、毎ターンコピー）を追加。
  // Blight / Vivid / Plan / Power-Up / Teamwork / Sneak / Disappear / 火・水・土ベンディングは
  // カウンター・マナ・コスト処理のみで現物不要のため対象外。Mutagen は o:token で捕捉済み。
  // 2026-07-27 監査: HOB の新メカニズムを確認し、トークンを出す Recruit を追加
  // （現状は注釈文の "token" で拾えるが、注釈文なしの刷りでも漏らさないため語彙として持つ）。
  // Storied / enduring story は恒久的な「状態」でカード状の現物が無く、Ascend の都市の承認と
  // 同じ扱いで対象外。Hone カウンターはサイコロ管理で足りるため対象外。
  // Amass（ゴブリン軍団）と Adventure は既存の o:Amass / keyword:adventure で捕捉済み。

  let url = `https://api.scryfall.com/cards/search?unique=cards&order=name&q=${encodeURIComponent(q)}`;
  const cards = [];
  try {
    while (url) {
      const data = await fetchScryfallJson(url, "candidate search");
      cards.push(...data.data);
      url = data.has_more ? data.next_page : null;
    }
  } catch (error) {
    if (strict) throw error;
    const stale = await readCandidateDiskCache(format, { allowStale: true });
    if (stale) {
      console.log(`[scryfall] using stale candidate cache for ${format}: ${error.message}`);
      cacheSet(candidateCache, format, stale);
      return stale;
    }
    throw error;
  }

  if (persist) {
    cacheSet(candidateCache, format, cards);
    await writeCandidateDiskCache(format, cards);
  }
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
  const printedName = printedNameFor(print);
  cacheSet(japaneseCache, cardName, printedName);
  return printedName;
}

export async function fetchOfficialJapaneseCard(cardName, options = {}) {
  const setCode = String(options.set || "").toLowerCase();
  const override = officialJapaneseCardOverrides.get(`${setCode}|${cardName}`);
  if (override) return override;

  const productId = mtgJpProductIds.get(setCode);
  if (!productId || options.allowGalleryScan !== true) return null;

  const cards = await fetchMtgJpCardsForSet(productId);
  const normalizedName = normalizeCardName(cardName);
  return cards.find((card) => card.normalizedEnglishNames.has(normalizedName)) || null;
}

export async function fetchRelatedCard(part) {
  if (!part?.uri) return null;
  const cached = cacheGet(relatedCache, part.uri);
  if (cached !== undefined) return cached;
  const card = await fetchScryfallJson(part.uri, `related ${part.name || "card"}`);
  cacheSet(relatedCache, part.uri, card);
  return card;
}

export async function fetchPreferredTokenPrint(reference, { lang = "en" } = {}) {
  if (!reference?.oracle_id) return { card: lang === "en" ? reference : null, note: "" };
  const key = `${reference.id}:${lang}`;
  const cached = cacheGet(tokenPrintCache, key);
  if (cached !== undefined) return cached;
  try {
    let sets = cacheGet(tokenPrintCache, "sets");
    if (!sets) {
      const data = await fetchScryfallJson("https://api.scryfall.com/sets", "token print sets");
      sets = new Map(data.data.map((set) => [set.code, set]));
      cacheSet(tokenPrintCache, "sets", sets);
    }
    // An already-regular English print needs no extra search. Japanese images
    // must be the same token AND product; never substitute by name alone.
    let selected = reference.lang === lang && tokenPrintRank(reference, sets) === 0 ? reference : null;
    if (!selected) {
      const q = `oracleid:${reference.oracle_id} game:paper lang:${lang}${lang === "ja" ? ` set:${reference.set}` : ""}`;
      let url = `https://api.scryfall.com/cards/search?unique=prints&include_multilingual=true&q=${encodeURIComponent(q)}`;
      const prints = [];
      while (url) {
        const data = await fetchScryfallJson(url, `regular token print ${reference.name}`);
        prints.push(...(data.data || []));
        url = data.has_more ? data.next_page : null;
      }
      selected = chooseTokenPrint(reference, prints, sets, { lang, sameSet: lang === "ja" });
    }
    const card = selected || (lang === "en" && !reference.digital && reference.games?.includes("paper") ? reference : null);
    const result = { card, note: card && tokenPrintRank(card, sets) !== 0 ? "通常パック版を確認できないため、同じ仕様の別製品版を表示しています。" : "" };
    cacheSet(tokenPrintCache, key, result);
    return result;
  } catch (error) {
    // Keep the related object visible on network failure, with an honest label.
    // Do not cache transient failures as a successful print selection.
    return { card: lang === "en" ? reference : null, note: `通常パック版の確認ができませんでした。関連版を表示しています。 (${error.message})` };
  }
}

export async function fetchJapaneseTokenPrintById(id) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(id || ""))) return null;
  try {
    const reference = await fetchRelatedCard({ uri: `https://api.scryfall.com/cards/${id}` });
    return (await fetchPreferredTokenPrint(reference, { lang: "ja" })).card;
  } catch {
    return null;
  }
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

export async function fetchJapaneseRelatedObjectName(sourceName, relatedObject, options = {}) {
  const sourceJa = await fetchJapanesePrint(sourceName);
  const sourceText = printedTextFor(sourceJa);
  const textMatch = japaneseObjectNameFromText(sourceText, relatedObject);
  if (textMatch) return textMatch;

  const officialSource = await fetchOfficialJapaneseCard(sourceName, { set: options.set });
  const officialTextMatch = japaneseObjectNameFromText(officialSource?.printedText || "", relatedObject);
  if (officialTextMatch) return officialTextMatch;

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
    return printedNameFor(jaRelated);
  } catch {
    return "";
  }
}

export function japaneseEmblemNameFromSource(sourceName, sourceJapaneseName, emblemName = "") {
  const sourceFaces = String(sourceName || "").split(/\s+\/\/\s+/).map((face) => face.trim()).filter(Boolean);
  const japaneseFaces = String(sourceJapaneseName || "").split(/\s+\/\/\s+/).map((face) => face.trim()).filter(Boolean);
  const emblemBase = String(emblemName || "").replace(/\s+Emblem$/i, "").trim();

  if (sourceFaces.length && japaneseFaces.length === sourceFaces.length && emblemBase) {
    const index = sourceFaces.findIndex((face) => normalizeCardName(face) === normalizeCardName(emblemBase));
    if (index >= 0 && japaneseFaces[index]) return `${japaneseFaces[index]}の紋章`;
  }

  const japaneseName = japaneseFaces[japaneseFaces.length - 1] || String(sourceJapaneseName || "").trim();
  if (japaneseName) return `${japaneseName}の紋章`;

  const englishName = emblemBase || sourceFaces[sourceFaces.length - 1] || String(sourceName || "").trim();
  return englishName ? `${englishName}の紋章` : "このプレインズウォーカーの紋章";
}

function japaneseObjectNameFromText(text, relatedObject) {
  if (!text) return "";
  const tokenName = japaneseObjectNameCandidate(relatedObject);
  if (tokenName && text.includes(`${tokenName}・`) && text.includes("トークン")) return tokenName;
  const textTokenName = japaneseTokenNameFromPrintedText(text, relatedObject);
  if (textTokenName) return textTokenName;
  if (/emblem/i.test(relatedObject?.type_line || "")) {
    const match = text.match(/「[^」]+」の紋章/);
    if (match) return match[0];
  }
  return "";
}

function japaneseObjectNameCandidate(relatedObject) {
  const direct = tokenJapaneseNameMap.get(relatedObject?.name || "");
  if (direct) return direct;

  const [, subtype = ""] = String(relatedObject?.type_line || "").split(/\s+—\s+/);
  const subtypeName = subtype.trim() || String(relatedObject?.name || "").trim();
  if (!subtypeName) return "";

  const exact = tokenJapaneseNameMap.get(subtypeName);
  if (exact) return exact;

  const parts = subtypeName.split(/\s+/).filter(Boolean);
  const translated = parts.map((part) => tokenJapaneseNameMap.get(part) || "");
  return translated.length && translated.every(Boolean) ? translated.join("・") : "";
}

function japaneseTokenNameFromPrintedText(text, relatedObject) {
  const candidates = japaneseTokenNameCandidatesFromText(text);
  if (!candidates.length) return "";
  const expected = japaneseObjectNameCandidate(relatedObject);
  if (expected) {
    const exact = candidates.find((candidate) => candidate === expected);
    if (exact) return exact;
    const compatible = candidates.find((candidate) => expected.split("・").every((part) => candidate.includes(part)));
    if (compatible) return compatible;
  }
  return candidates.length === 1 ? candidates[0] : "";
}

function japaneseTokenNameCandidatesFromText(text) {
  const candidates = new Set();
  const patterns = [
    /([^。\n、]+?)・(?:クリーチャー|アーティファクト|エンチャント)(?:・[^。\n、]*?)?・トークン/g,
    /([^。\n、]+?)・トークン/g
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = cleanJapaneseTokenName(match[1]);
      if (candidate) candidates.add(candidate);
    }
  }

  return [...candidates];
}

function cleanJapaneseTokenName(rawName) {
  let name = String(rawName || "")
    .replace(/[「」]/g, "")
    .replace(/^(?:タップ状態の|攻撃している|伝説の)+/, "")
    .trim();

  const noParts = name.split("の").map((part) => part.trim()).filter(Boolean);
  if (noParts.length > 1) name = noParts[noParts.length - 1];

  name = name
    .replace(/^(?:白|青|黒|赤|緑|無色|多色)(?:と(?:白|青|黒|赤|緑))*の?/, "")
    .replace(/^\d+\/\d+の?/, "")
    .replace(/^(?:白|青|黒|赤|緑|無色|多色)(?:で|の)?/, "")
    .trim();

  if (!name || /(?:クリーチャー|アーティファクト|エンチャント)$/.test(name)) return "";
  return name;
}

async function fetchMtgJpCardsForSet(productId) {
  const cached = cacheGet(mtgJpCardCache, productId);
  if (cached !== undefined) return cached;

  const galleryUrl = `https://mtg-jp.com/products/card-gallery/${productId}/`;
  const galleryResponse = await fetch(galleryUrl, { headers: { "user-agent": "mtg-token-finder/0.2 (+local broadcast prep tool)" } });
  if (!galleryResponse.ok) {
    cacheSet(mtgJpCardCache, productId, []);
    return [];
  }
  const galleryHtml = await galleryResponse.text();
  const detailUrls = [...new Set([...galleryHtml.matchAll(new RegExp(`/products/card-gallery/${productId}/[0-9]+/`, "g"))].map((match) => `https://mtg-jp.com${match[0]}`))];
  const cards = [];

  for (const url of detailUrls) {
    try {
      await sleep(scryfallDelayMs);
      const response = await fetch(url, { headers: { "user-agent": "mtg-token-finder/0.2 (+local broadcast prep tool)" } });
      if (!response.ok) continue;
      const html = await response.text();
      const text = stripHtml(html);
      const japaneseNames = [...text.matchAll(/《([^》]+)》/g)].map((match) => match[1]).filter(Boolean);
      const englishNames = [...text.matchAll(/^([A-Z][A-Za-z0-9 ,:'’!?.-]+)$/gm)]
        .map((match) => match[1].trim())
        .filter((name) => name.length > 2 && !/^(HOME|PRODUCTS|CARD GALLERY|WHITE|BLUE|BLACK|RED|GREEN|LAND|SEARCH)$/.test(name));
      const normalizedEnglishNames = new Set(englishNames.map(normalizeCardName));
      if (!japaneseNames.length || !normalizedEnglishNames.size) continue;
      cards.push({
        japaneseName: japaneseNames.join(" // "),
        printedText: text,
        normalizedEnglishNames,
        sourceUrl: url
      });
    } catch {
      // Keep the official-gallery fallback best-effort.
    }
  }

  cacheSet(mtgJpCardCache, productId, cards);
  return cards;
}
