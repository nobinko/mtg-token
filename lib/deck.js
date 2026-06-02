import { normalizeText } from "./html.js";
import { toIsoDate } from "./util.js";
import { inferArchetype, inferArchetypeFromCards } from "./archetype.js";
import { formatAliasesFor, mtgTop8CodeFor, supportedFormats } from "./data.js";

const supportedFormatKeys = supportedFormats.map((format) => format.key);

export function isDeckResultPage(url, sourceUrls) {
  const lower = url.toLowerCase();
  const sourceSet = new Set(sourceUrls.map((source) => source.toLowerCase()));
  if (lower.includes("mtggoldfish.com/deck/")) return true;
  if (lower.includes("magic.gg/decklists/") && !lower.endsWith("/decklists")) return true;
  if (lower.includes("mtgo.com/decklist/")) return true;
  if (isMtgTop8DeckPage(url)) return true;
  if (lower.includes("mtgtop8.com/event")) return false;
  if (supportedFormatKeys.some((format) => lower.includes(`mtgdecks.net/${format}/`)) && !lower.includes("/decklists")) return true;
  if (lower.includes("mtgtop8.com/format")) return false;
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

export function extractDeckCardNames(deckText) {
  const names = [];
  const normalized = String(deckText || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/<\s*\/?\s*(main-deck|side-board)\s*>/gi, "\n");
  const lines = normalized.split(/\r?\n/);
  for (const line of lines) {
    const clean = line
      .replace(/<[^>]+>/g, " ")
      .replace(/\\u002F/g, "/")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    const match = clean.match(/^\d+\s+(.+)$/);
    if (!match) continue;
    const name = match[1].replace(/\s+\([^)]+\)(?:\s+\S+)?$/g, "").trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

function decodeHtmlText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isMtgTop8DeckPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") === "mtgtop8.com"
      && parsed.pathname.includes("event")
      && parsed.searchParams.has("d");
  } catch {
    return false;
  }
}

function extractMtgTop8CardNames(html) {
  const names = [];
  const pattern = /<div\b[^>]*class=["']?deck_line\b[^>]*>[\s\S]*?<span\b[^>]*class=["']?L14["']?[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const name = decodeHtmlText(match[1]);
    if (name) names.push(name);
  }
  return [...new Set(names)];
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

function mtgoFormatMatches(mtgoFormat, requestedFormat, pageUrl = "") {
  if (!requestedFormat) return true;
  const normalized = String(mtgoFormat || "").toLowerCase().replace(/^c/, "");
  if (!normalized && pageUrl) return mtgoDecklistLinkMatches(pageUrl, formatAliasesFor(requestedFormat));
  return formatAliasesFor(requestedFormat).some((alias) => normalized === alias);
}

function extractMtgoDecklistData(html) {
  const match = html.match(/window\.MTGO\.decklists\.data\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function mtgoCardNames(deck) {
  const rows = [
    ...(Array.isArray(deck?.main_deck) ? deck.main_deck : []),
    ...(Array.isArray(deck?.sideboard_deck) ? deck.sideboard_deck : [])
  ];
  const names = rows
    .map((row) => row?.card_attributes?.card_name || "")
    .map((name) => String(name).trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function extractMtgoDeckEntries(html, pageUrl, pageTitle, format = "") {
  const data = extractMtgoDecklistData(html);
  if (!data || !mtgoFormatMatches(data.format, format, pageUrl)) return [];
  const eventDate = toIsoDate(data.starttime || data.publish_date || "");
  const eventName = data.description || data.name || pageTitle;
  const decks = Array.isArray(data.decklists) ? data.decklists : [];

  return decks.map((deck, index) => {
    const cards = mtgoCardNames(deck);
    const player = String(deck.player || "").trim();
    const title = player ? `${eventName} - ${player}` : `${eventName} - Deck ${index + 1}`;
    return {
      title,
      archetype: inferArchetypeFromCards(cards, inferArchetype(title, pageTitle)),
      url: `${pageUrl}#mtgo-${deck.decktournamentid || index + 1}`,
      pageTitle,
      pageUrl,
      eventDate,
      cards,
      text: normalizeText(cards.join("\n"))
    };
  }).filter((entry) => entry.cards.length > 0);
}

function deckListFormatMatches(attrs, requestedFormat) {
  if (!requestedFormat) return true;
  const formatValue = attrs.match(/\bformat="([^"]+)"/i)?.[1]?.trim();
  if (!formatValue) return true;
  const normalized = formatValue.toLowerCase();
  const aliases = formatAliasesFor(requestedFormat);
  return aliases.some((alias) => normalized === alias || normalized.includes(alias));
}

export function extractDeckEntries(html, pageUrl, pageTitle, sourceUrls, pageDate = "", format = "") {
  const decoded = decodeEmbeddedDeckMarkup(html);
  const entries = [];
  const pattern = /<deck-list\b([^>]*)>([\s\S]*?)<\/deck-list>/gi;
  let match;
  let index = 0;
  let deckListTagSeen = false;

  while ((match = pattern.exec(decoded))) {
    deckListTagSeen = true;
    const attrs = match[1];
    const body = match[2] || "";
    if (!deckListFormatMatches(attrs, format)) continue;
    const cards = extractDeckCardNames(body);
    const title = attrs.match(/\bdeck-title="([^"]+)"/i)?.[1]?.trim() || `Deck ${index + 1}`;
    const subtitle = attrs.match(/\bsubtitle="([^"]+)"/i)?.[1]?.trim() || "";
    // subtitle を単独でサニタイズ（pageTitle と混ぜない）。
    // "- Player |" のようなゴミ値は "Unknown" になり、title にフォールバックする。
    const subtitleName = subtitle ? inferArchetype(subtitle, "") : "";
    const fallbackName = (subtitleName && subtitleName !== "Unknown")
      ? subtitleName
      : inferArchetype(title, pageTitle);
    const archetype = inferArchetypeFromCards(cards, fallbackName);
    const eventDate = toIsoDate(attrs.match(/\bevent-date="([^"]+)"/i)?.[1]) || pageDate;
    entries.push({
      title: subtitle ? `${title} - ${subtitle}` : title,
      archetype,
      url: `${pageUrl}#deck-${index + 1}`,
      pageTitle,
      pageUrl,
      eventDate,
      cards,
      text: normalizeText(body)
    });
    index += 1;
  }

  if (deckListTagSeen) return entries;

  if (!entries.length && pageUrl.toLowerCase().includes("mtgo.com/decklist/")) {
    entries.push(...extractMtgoDeckEntries(html, pageUrl, pageTitle, format));
  }

  if (!entries.length && isMtgTop8DeckPage(pageUrl)) {
    const cards = extractMtgTop8CardNames(html);
    entries.push({
      title: pageTitle,
      archetype: inferArchetypeFromCards(cards, inferArchetype(pageTitle, pageTitle)),
      url: pageUrl,
      pageTitle,
      pageUrl,
      eventDate: extractMtgTop8EventDate(html) || pageDate,
      cards,
      text: normalizeText(html)
    });
  }

  if (!entries.length && isDeckResultPage(pageUrl, sourceUrls)) {
    const cards = extractDeckCardNames(html);
    entries.push({
      title: pageTitle,
      archetype: inferArchetypeFromCards(cards, inferArchetype(pageTitle, pageTitle)),
      url: pageUrl,
      pageTitle,
      pageUrl,
      eventDate: pageDate,
      cards,
      text: normalizeText(html)
    });
  }

  return entries;
}

function mtgTop8FormatMatches(url, format) {
  if (!format) return true;
  const expected = mtgTop8CodeFor(format);
  if (!expected) return true;
  try {
    const parsed = new URL(url);
    const actual = parsed.searchParams.get("f");
    return actual ? actual.toUpperCase() === expected : false;
  } catch {
    return false;
  }
}

function linkPriority(url) {
  const lower = url.toLowerCase();
  if (lower.includes("mtgtop8.com/event") && lower.includes("&d=")) return 0;
  if (lower.includes("mtgtop8.com/event")) return 1;
  if (lower.includes("mtgtop8.com/format") && lower.includes("meta=")) return 4;
  return 2;
}

function mtgoDecklistLinkMatches(url, formatAliases) {
  if (!url.toLowerCase().includes("mtgo.com/decklist/")) return false;
  if (formatAliases.length === 0) return true;
  try {
    const slug = new URL(url).pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
    return formatAliases.some((alias) => slug.startsWith(`${alias}-`));
  } catch {
    return false;
  }
}

export function extractLinks(html, baseUrl, format = "", sourceUrls = []) {
  const links = [];
  const base = new URL(baseUrl);
  // クォートあり ("url" / 'url') と、mtgtop8 のようなクォートなし (href=path?q=v) の両方に対応
  const pattern = /href=(?:["']([^"'#]+)["']|([^"'\s#>][^\s#>]*))/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const raw = match[1] ?? match[2];
      const url = new URL(raw, base).toString();
      if (url.startsWith(base.origin)) links.push(url);
    } catch {
      // Ignore malformed links from source sites.
    }
  }
  // フォーマット指定がある場合、magic.gg / mtgo.com のリンクは
  // URLにフォーマット名を含むものだけを通す（レガシーのデッキをスタンダード検索で拾わない）
  const fmtKeys = format ? formatAliasesFor(format) : [];

  // hareruyamtg のメタゲームページはサイドバーに全フォーマットへのリンクを持つ。
  // sourceUrls からフォーマット固有のデッキ番号（/deck/1/ など）を導出し、
  // 対象フォーマット以外のメタゲームページ（/deck/7/, /deck/others/ 等）を除外する。
  // /deck/result? は個別デッキ結果でフォーマット番号を持たないため常に通す。
  const hareruyaAllowedSegments = new Set(
    sourceUrls
      .map((u) => { const m = u.match(/hareruyamtg\.com\/(?:ja|en)\/deck\/(\d+)\//); return m ? `/deck/${m[1]}/` : null; })
      .filter(Boolean)
  );

  const filteredLinks = [...new Set(links)].filter((url) => {
    const lower = url.toLowerCase();
    if (lower.includes("switch=")) return false;
    if (lower.includes("mtggoldfish.com/deck/")) return true;
    if (lower.includes("mtggoldfish.com/archetype/")) return true;
    if (lower.includes("mtgdecks.net/")) {
      return fmtKeys.length === 0 || fmtKeys.some((k) => lower.includes(`mtgdecks.net/${k}/`));
    }
    if (lower.includes("magic.gg/decklists/")) {
      return fmtKeys.length === 0 || fmtKeys.some((k) => lower.includes(`/${k}`));
    }
    if (lower.includes("mtgtop8.com/event")) return mtgTop8FormatMatches(url, format);
    if (lower.includes("mtgtop8.com/format")) return false;
    if (lower.includes("mtgo.com/decklist/")) return mtgoDecklistLinkMatches(url, fmtKeys);
    if (lower.includes("mtgo.com/decklists")) return true;
    if (lower.includes("hareruyamtg.com/ja/deck/") || lower.includes("hareruyamtg.com/en/deck/")) {
      // result ページは通常HTTP取得ではWAF/JSチャレンジになるため、自動巡回では追わない。
      // メタゲームページ自体はアーキタイプ名の補助情報として読む。
      if (lower.includes("/deck/result")) return false;
      // メタゲーム・ランキングページはsourceUrlsで指定されたフォーマットのみ許可
      if (hareruyaAllowedSegments.size === 0) return true;
      return [...hareruyaAllowedSegments].some((seg) => lower.includes(seg));
    }
    // article.hareruyamtg.com は記事サイトのため日付関係なく古い記事も拾う → 除外
    if (lower.includes("mtg-jp.com/coverage/")) return true;
    if (lower.includes("melee.gg/decklist/")) return true;
    if (lower.includes("melee.gg/tournament/view/")) return true;
    if (lower.includes("melee.gg/tournament/")) return true;
    if (lower.includes("spellbinder.gg/events/")) return true;
    if (lower.includes("spellbinder.gg/decks/")) return true;
    return false;
  });

  return filteredLinks.sort((a, b) => linkPriority(a) - linkPriority(b));
}
