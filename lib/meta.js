import { mtgTop8CodeFor } from "./data.js";

const MTG_TOP8_HOST = "mtgtop8.com";
const META_WINDOW_LABELS = new Map([
  ["54", "直近2週間"]
]);

export function representativeAsOfDate(targetDate, today = new Date().toISOString().slice(0, 10)) {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(String(targetDate || "")) || !isoDate.test(String(today || ""))) return "";
  return targetDate < today ? targetDate : today;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hrefFromMatch(match) {
  return decodeHtml(match[1] ?? match[2] ?? match[3] ?? "");
}

function normalizedMtgTop8Url(value, pathname, requiredParams, expectedFormat = "") {
  try {
    const parsed = new URL(String(value || "").replace(/&amp;/gi, "&"), "https://mtgtop8.com/");
    if (parsed.protocol !== "https:") return "";
    if (parsed.hostname.replace(/^www\./i, "").toLowerCase() !== MTG_TOP8_HOST) return "";
    if (parsed.port || parsed.username || parsed.password || parsed.pathname !== pathname) return "";

    const values = {};
    for (const [name, pattern] of Object.entries(requiredParams)) {
      const value = parsed.searchParams.get(name) || "";
      if (!pattern.test(value)) return "";
      values[name] = value;
    }
    if (expectedFormat && values.f !== mtgTop8CodeFor(expectedFormat)) return "";

    const query = Object.keys(requiredParams)
      .map((name) => `${name}=${encodeURIComponent(values[name])}`)
      .join("&");
    return `https://${MTG_TOP8_HOST}${pathname}?${query}`;
  } catch {
    return "";
  }
}

export function normalizeMtgTop8ArchetypeUrl(value, expectedFormat = "") {
  return normalizedMtgTop8Url(value, "/archetype", {
    a: /^\d+$/,
    meta: /^\d+$/,
    f: /^[A-Z]{2}$/
  }, expectedFormat);
}

export function normalizeMtgTop8DeckUrl(value, expectedFormat = "") {
  return normalizedMtgTop8Url(value, "/event", {
    e: /^\d+$/,
    d: /^\d+$/,
    f: /^[A-Z]{2}$/
  }, expectedFormat);
}

const ANCHOR_PATTERN = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

export function extractMtgTop8MetaSnapshot(html, pageUrl, fetchedAt = "") {
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    return null;
  }
  if (page.hostname.replace(/^www\./i, "").toLowerCase() !== MTG_TOP8_HOST || page.pathname !== "/format") return null;
  const formatCode = page.searchParams.get("f") || "";
  if (!/^[A-Z]{2}$/.test(formatCode)) return null;

  const entries = [];
  const seen = new Set();
  const source = String(html || "");
  const anchors = source.matchAll(ANCHOR_PATTERN);
  for (const match of anchors) {
    const rawHref = hrefFromMatch(match);
    if (!/(?:^|\/)archetype\?/i.test(rawHref)) continue;
    const archetypeUrl = normalizeMtgTop8ArchetypeUrl(new URL(rawHref, page).toString());
    if (!archetypeUrl) continue;
    const parsed = new URL(archetypeUrl);
    if (parsed.searchParams.get("f") !== formatCode) continue;

    const name = decodeHtml(match[4]);
    if (!name) continue;
    const tail = source.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 700);
    const percentMatch = tail.match(/class\s*=\s*(?:"[^"]*\bS14\b[^"]*"|'[^']*\bS14\b[^']*'|S14)[^>]*>\s*(\d+(?:\.\d+)?)\s*%/i);
    if (!percentMatch) continue;

    const dedupeKey = `${name.toLowerCase()}|${archetypeUrl}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push({
      name,
      sharePercent: Number(percentMatch[1]),
      archetypeUrl,
      sourceOrder: entries.length
    });
  }
  if (!entries.length) return null;

  entries.sort((a, b) => b.sharePercent - a.sharePercent || a.sourceOrder - b.sourceOrder);
  const metaId = new URL(entries[0].archetypeUrl).searchParams.get("meta") || "";
  const totalMatch = source.match(/<div\b[^>]*>\s*([\d,]+)\s+decks\s*<\/div>/i);
  return {
    source: "MTGTop8",
    sourceUrl: `https://${MTG_TOP8_HOST}/format?f=${formatCode}`,
    formatCode,
    windowLabel: META_WINDOW_LABELS.get(metaId) || "掲載中のメタ期間",
    totalDecks: totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : null,
    fetchedAt,
    tieRule: "同率は出典の掲載順",
    entries: entries.map(({ sourceOrder: _sourceOrder, ...entry }, index) => ({ ...entry, rank: index + 1 }))
  };
}

function dmyToIso(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function extractMtgTop8ArchetypeDeckLinks(html, archetypeUrl, expectedFormat = "") {
  const source = String(html || "");
  const links = [];
  const seen = new Set();
  for (const match of source.matchAll(ANCHOR_PATTERN)) {
    const rawHref = hrefFromMatch(match);
    if (!/(?:^|\/)event\?/i.test(rawHref) || !/[?&]d=\d+/i.test(rawHref)) continue;
    const deckUrl = normalizeMtgTop8DeckUrl(new URL(rawHref, archetypeUrl).toString(), expectedFormat);
    if (!deckUrl || seen.has(deckUrl)) continue;

    const anchorIndex = match.index || 0;
    const rowStart = source.lastIndexOf("<tr", anchorIndex);
    const rowEnd = source.indexOf("</tr>", anchorIndex);
    const row = rowStart >= 0 && rowEnd >= 0 ? source.slice(rowStart, rowEnd + 5) : "";
    const dates = [...row.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)].map((item) => item[0]);
    const player = decodeHtml(row.match(/<a\b(?=[^>]*\bclass\s*=\s*(?:["'][^"']*\bplayer\b[^"']*["']|[^\s>]*\bplayer\b))[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    let event = "";
    for (const rowAnchor of row.matchAll(ANCHOR_PATTERN)) {
      const rowHref = hrefFromMatch(rowAnchor);
      let parsed;
      try {
        parsed = new URL(rowHref, archetypeUrl);
      } catch {
        continue;
      }
      if (parsed.pathname === "/event" && parsed.searchParams.has("e") && !parsed.searchParams.has("d")) {
        event = decodeHtml(rowAnchor[4]);
        break;
      }
    }
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decodeHtml(cell[1]));
    const placement = cells.length >= 2 ? cells.at(-2) : "";

    seen.add(deckUrl);
    links.push({
      url: deckUrl,
      name: decodeHtml(match[4]),
      eventDate: dmyToIso(dates.at(-1) || ""),
      player,
      event,
      placement
    });
  }
  return links;
}

function rowCount(rows) {
  return (rows || []).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
}

export function isCompleteDecklist(deck) {
  return rowCount(deck?.mainboard) >= 60 && rowCount(deck?.sideboard) <= 15;
}

function deckVector(deck) {
  const vector = new Map();
  for (const [zone, rows] of [["main", deck.mainboard], ["side", deck.sideboard]]) {
    for (const row of rows || []) {
      const count = Number(row.count) || 0;
      if (count > 0 && row.name) vector.set(`${zone}|${row.name}`, count);
    }
  }
  return vector;
}

export function deckDistance(left, right) {
  const a = deckVector(left);
  const b = deckVector(right);
  const keys = new Set([...a.keys(), ...b.keys()]);
  let difference = 0;
  let union = 0;
  for (const key of keys) {
    const av = a.get(key) || 0;
    const bv = b.get(key) || 0;
    difference += Math.abs(av - bv);
    union += Math.max(av, bv);
  }
  return union ? difference / union : 1;
}

export function chooseRepresentativeDeck(decks) {
  const candidates = (decks || []).filter(isCompleteDecklist);
  if (!candidates.length) return null;

  let best = null;
  for (const candidate of candidates) {
    const others = candidates.filter((deck) => deck !== candidate);
    const averageDistance = others.length
      ? others.reduce((sum, deck) => sum + deckDistance(candidate, deck), 0) / others.length
      : 0;
    const tieKey = `${candidate.eventDate || ""}|${candidate.url || ""}`;
    if (!best || averageDistance < best.averageDistance - 1e-9
      || (Math.abs(averageDistance - best.averageDistance) < 1e-9 && tieKey > best.tieKey)) {
      best = { deck: candidate, averageDistance, tieKey };
    }
  }

  return {
    deck: best.deck,
    sampleSize: candidates.length,
    similarityPercent: Math.round(Math.max(0, 1 - best.averageDistance) * 1000) / 10,
    method: "取得できた完全リスト同士の枚数差が最小の実在リスト"
  };
}
