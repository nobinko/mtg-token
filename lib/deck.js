import { normalizeText } from "./html.js";
import { toIsoDate } from "./util.js";
import { inferArchetype, inferArchetypeFromCards } from "./archetype.js";

export function isDeckResultPage(url, sourceUrls) {
  const lower = url.toLowerCase();
  const sourceSet = new Set(sourceUrls.map((source) => source.toLowerCase()));
  if (lower.includes("mtggoldfish.com/deck/")) return true;
  if (lower.includes("magic.gg/decklists/") && !lower.endsWith("/decklists")) return true;
  if (/mtgdecks\.net\/(standard|pioneer|modern|legacy)\/(?!decklists)/i.test(url)) return true;
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
    const name = match[1].replace(/\s+\(.+\)$/g, "").trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

const DECKLIST_FORMAT_ALIASES = {
  standard: ["standard"],
  pioneer: ["pioneer"],
  modern: ["modern"],
  legacy: ["legacy"]
};

function deckListFormatMatches(attrs, requestedFormat) {
  if (!requestedFormat) return true;
  const formatValue = attrs.match(/\bformat="([^"]+)"/i)?.[1]?.trim();
  if (!formatValue) return true;
  const normalized = formatValue.toLowerCase();
  const aliases = DECKLIST_FORMAT_ALIASES[requestedFormat.toLowerCase()] || [requestedFormat.toLowerCase()];
  return aliases.some((alias) => normalized === alias || normalized.includes(alias));
}

export function extractDeckEntries(html, pageUrl, pageTitle, sourceUrls, pageDate = "", format = "") {
  const decoded = decodeEmbeddedDeckMarkup(html);
  const entries = [];
  const pattern = /<deck-list\b([^>]*)>([\s\S]*?)<\/deck-list>/gi;
  let match;
  let index = 0;

  while ((match = pattern.exec(decoded))) {
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

// magic.gg / mtgo.com のURLに含まれるフォーマット名キーワード
const FORMAT_KEYWORDS = {
  standard: ["standard"],
  pioneer:  ["pioneer"],
  modern:   ["modern"],
  legacy:   ["legacy"],
  vintage:  ["vintage"],
  pauper:   ["pauper"],
};

const MTGTOP8_FORMAT_CODES = {
  standard: "ST",
  pioneer: "PI",
  modern: "MO",
  legacy: "LE"
};

function mtgTop8FormatMatches(url, format) {
  if (!format) return true;
  const expected = MTGTOP8_FORMAT_CODES[format.toLowerCase()];
  if (!expected) return true;
  try {
    const parsed = new URL(url);
    const actual = parsed.searchParams.get("f");
    return actual ? actual.toUpperCase() === expected : false;
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
  const fmtKeys = format ? (FORMAT_KEYWORDS[format.toLowerCase()] ?? []) : [];

  // hareruyamtg のメタゲームページはサイドバーに全フォーマットへのリンクを持つ。
  // sourceUrls からフォーマット固有のデッキ番号（/deck/1/ など）を導出し、
  // 対象フォーマット以外のメタゲームページ（/deck/7/, /deck/others/ 等）を除外する。
  // /deck/result? は個別デッキ結果でフォーマット番号を持たないため常に通す。
  const hareruyaAllowedSegments = new Set(
    sourceUrls
      .map((u) => { const m = u.match(/hareruyamtg\.com\/(?:ja|en)\/deck\/(\d+)\//); return m ? `/deck/${m[1]}/` : null; })
      .filter(Boolean)
  );

  return [...new Set(links)].filter((url) => {
    const lower = url.toLowerCase();
    if (lower.includes("mtggoldfish.com/deck/")) return true;
    if (lower.includes("mtggoldfish.com/archetype/")) return true;
    if (lower.includes("mtgdecks.net/standard/")) return true;
    if (lower.includes("mtgdecks.net/pioneer/")) return true;
    if (lower.includes("mtgdecks.net/modern/")) return true;
    if (lower.includes("mtgdecks.net/legacy/")) return true;
    if (lower.includes("magic.gg/decklists/")) {
      return fmtKeys.length === 0 || fmtKeys.some((k) => lower.includes(`/${k}`));
    }
    if (lower.includes("mtgtop8.com/event")) return mtgTop8FormatMatches(url, format);
    if (lower.includes("mtgtop8.com/format")) return mtgTop8FormatMatches(url, format);
    if (lower.includes("mtgo.com/decklist/")) {
      return fmtKeys.length === 0 || fmtKeys.some((k) => lower.includes(k));
    }
    if (lower.includes("mtgo.com/decklists")) return true;
    if (lower.includes("hareruyamtg.com/ja/deck/") || lower.includes("hareruyamtg.com/en/deck/")) {
      // 個別デッキ結果ページはフォーマット番号を持たないため常に通す
      if (lower.includes("/deck/result")) return true;
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
}
