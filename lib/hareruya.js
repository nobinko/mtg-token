import { normalizeText } from "./html.js";
import { toIsoDate } from "./util.js";

function plain(value) {
  return normalizeText(String(value || "")).replace(/&nbsp;/g, " ").replace(/&#(?:x([a-f\d]+)|(\d+));/gi,
    (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex || decimal, hex ? 16 : 10))).trim();
}

export function isHareruyaDeckUrl(url) {
  try {
    const parsed = new URL(url);
    return ["www.hareruyamtg.com", "hareruyamtg.com", "deck.hareruyamtg.com"].includes(parsed.hostname)
      && (/^\/(?:ja|en)\/deck\/\d+\/show\/?$/.test(parsed.pathname)
        || /^\/decks\/\d+\/?$/.test(parsed.pathname)
        || (parsed.hostname === "deck.hareruyamtg.com" && /^\/\d+\/?$/.test(parsed.pathname)));
  } catch { return false; }
}

export function canonicalHareruyaUrl(url) {
  if (!isHareruyaDeckUrl(url)) return url;
  const parsed = new URL(url);
  parsed.hash = "";
  if (/\/(?:ja|en)\/deck\//.test(parsed.pathname)) {
    return `https://www.hareruyamtg.com${parsed.pathname.replace(/^\/ja\//, "/en/").replace(/\/?$/, "/")}`;
  }
  const id = parsed.pathname.match(/\d+/)?.[0];
  const canonical = new URL(`https://www.hareruyamtg.com/decks/${id}`);
  if (parsed.searchParams.has("display_token")) canonical.searchParams.set("display_token", parsed.searchParams.get("display_token"));
  return canonical.toString();
}

export function hareruyaApiUrl(url) {
  const parsed = new URL(canonicalHareruyaUrl(url));
  if (!/^\/decks\/\d+$/.test(parsed.pathname)) return "";
  const api = new URL(`https://api.deck.hareruyamtg.com/api/deck/${parsed.pathname.split("/").pop()}`);
  if (parsed.searchParams.has("display_token")) api.searchParams.set("display_token", parsed.searchParams.get("display_token"));
  return api.toString();
}

export function isHareruyaArticleUrl(url) {
  try { const parsed = new URL(url); return parsed.hostname === "article.hareruyamtg.com" && /^\/article\/(?:\d+\/|tag\/[^/]+\/(?:page\/\d+\/)?)$/.test(parsed.pathname); }
  catch { return false; }
}

export function hareruyaArticleDate(html) {
  const value = html.match(/property=["']article:published_time["']\s+content=["']([^"']+)["']/i)?.[1];
  if (!value) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  // WordPress publishes UTC metadata; the article's calendar date is Japanese.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export function hareruyaArticleLinks(html, baseUrl, { environmentStartDate = "", targetDate = "9999-12-31" } = {}) {
  const links = [];
  const dates = [];
  if (new URL(baseUrl).pathname.includes("/tag/")) {
    for (const match of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
      const block = match[1];
      const date = toIsoDate(block.match(/info__date["'][^>]*>([^<]+)/)?.[1]);
      if (date) dates.push(date);
      const title = plain(block.match(/info__title["'][^>]*>([^<]+)/)?.[1]);
      if (!date || date < environmentStartDate || date > targetDate) continue;
      if (!/トップ\s*(?:4|8|16|32)|デッキリスト|全デッキ|上位入賞|参加レポート|大会レポート/i.test(title)) continue;
      const href = block.match(/href=["']([^"']*\/article\/\d+\/)["']/)?.[1];
      if (href) links.push(new URL(href, baseUrl).toString());
    }
    if (dates.some((date) => date >= environmentStartDate)) {
      const current = Number(new URL(baseUrl).pathname.match(/\/page\/(\d+)\//)?.[1] || 1);
      const nextPath = new URL(baseUrl).pathname.replace(/(?:page\/\d+\/)?$/, `page/${current + 1}/`);
      for (const match of html.matchAll(/href=["']([^"']+)["']/g)) {
        const next = new URL(match[1].replace(/&amp;/g, "&"), baseUrl);
        if (next.origin === new URL(baseUrl).origin && next.pathname === nextPath) { links.push(next.toString()); break; }
      }
    }
  } else {
    // Follow only the deck embeds/links in the requested article, never its
    // related-article sidebar or the unrestricted deck search.
    for (const match of html.matchAll(/<deck-embedder\b([^>]*)>/gi)) {
      const id = match[1].match(/\bdeckid=["'](\d+)["']/)?.[1];
      const token = match[1].match(/\btoken=["']([^"']*)["']/)?.[1];
      if (id) {
        const url = new URL(`https://www.hareruyamtg.com/decks/${id}`);
        if (token) url.searchParams.set("display_token", token);
        links.push(url.toString());
      }
    }
    const content = html.match(/<div\b[^>]*class=["'][^"']*articleDetail[^"']*["'][^>]*>([\s\S]*)/i)?.[1] || html;
    for (const match of content.matchAll(/href=["']([^"']+)["']/g)) {
      const url = new URL(match[1].replace(/&amp;/g, "&"), baseUrl).toString();
      if (isHareruyaDeckUrl(url)) links.push(canonicalHareruyaUrl(url));
    }
  }
  return [...new Set(links)];
}

export function hareruyaArticleContext(page) {
  return { articleUrl: page.url, title: page.title, publishedDate: page.publishedDate,
    allowPublicationDate: /トップ\s*(?:4|8|16|32).*デッキリスト|全デッキリスト|上位.*デッキリスト/i.test(page.title)
      && /決定戦|選手権|大会|スポットライト|Spotlight|Championship|カップ/i.test(plain(page.html)) };
}

function fields(mainboard, sideboard) {
  return { mainboard, sideboard, cards: [...new Set([...mainboard, ...sideboard].map((row) => row.name))],
    mainboardCount: mainboard.reduce((sum, row) => sum + row.count, 0), sideboardCount: sideboard.reduce((sum, row) => sum + row.count, 0) };
}

function formatKey(value) {
  return ({ "モダン": "modern", "スタンダード": "standard", "パイオニア": "pioneer", "レガシー": "legacy" })[plain(value)] || plain(value).toLowerCase();
}

export function hareruyaJsonEntry(data, pageUrl, format = "", context = {}) {
  if (Number(data?.code) !== 200 || data.deck_private_flag === true || !Array.isArray(data.cards)) return null;
  const deckFormat = formatKey(data.format_name_en || data.format_name_jp);
  if (!deckFormat || (format && deckFormat !== format)) return null;
  const rows = data.cards.map((row) => ({ name: plain(row.name_en), count: Number(row.count), board: Number(row.board_id) }))
    .filter((row) => row.name && Number.isInteger(row.count) && row.count > 0 && row.count <= 250);
  // Board 3 is a maybeboard. It must not contribute source-card hits.
  const list = fields(rows.filter((row) => row.board === 1).map(({ board, ...row }) => row), rows.filter((row) => row.board === 2).map(({ board, ...row }) => row));
  if (!list.cards.length) return null;
  const eventDate = toIsoDate(data.event_date) || (context.allowPublicationDate ? context.publishedDate : "");
  const eventName = plain(data.event_name_en || data.event_name_jp || context.title);
  const player = plain(data.player_name);
  return { ...list, title: plain(data.deck_name) || `${eventName} - ${player}`, player, eventName, format: deckFormat,
    archetype: plain(data.archetype_name_en || data.archetype_name_jp) || "Unknown", eventDate,
    dateBasis: data.event_date ? "event" : eventDate ? "coverage-publication" : "unknown",
    url: canonicalHareruyaUrl(pageUrl), pageUrl: context.articleUrl || canonicalHareruyaUrl(pageUrl), pageTitle: context.title || plain(data.deck_name),
    sourceUrls: [canonicalHareruyaUrl(pageUrl), context.articleUrl, data.source_url].filter(Boolean), text: list.cards.join("\n") };
}

export function hareruyaHtmlEntries(html, pageUrl, pageTitle, format = "") {
  const info = new Map();
  for (const match of html.matchAll(/<ul\b[^>]*class=["'][^"']*deckSearch-deckList__information__flex__list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi)) {
    const key = plain(match[1].match(/__list__header["'][^>]*>([\s\S]*?)<\/li>/)?.[1]);
    const value = plain(match[1].match(/__list__body["'][^>]*>([\s\S]*?)<\/li>/)?.[1]);
    info.set(key, value);
  }
  const deckFormat = formatKey(info.get("Format") || info.get("フォーマット"));
  if (!deckFormat || (format && deckFormat !== format)) return [];
  // The English page has card names that match Scryfall's canonical names.
  if (!new URL(pageUrl).pathname.startsWith("/en/")) return [];
  const mainboard = [], sideboard = [];
  const start = html.indexOf("deckSearch-deckList__deckList__container");
  const end = html.indexOf("deckSearch-deckList__buyAllButtonWrapper", start);
  const body = start >= 0 && end > start ? html.slice(start, end) : "";
  const sideStart = body.indexOf("__text--sideboard");
  for (const match of body.matchAll(/<span\b[^>]*>\s*(\d+)\s*<\/span>\s*<a\b[^>]*\bdata-card_id=["']\d+["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const count = Number(match[1]), name = plain(match[2]).replace(/^《|》$/g, "");
    if (name && count > 0 && count <= 250) (sideStart >= 0 && match.index > sideStart ? sideboard : mainboard).push({ name, count });
  }
  const list = fields(mainboard, sideboard);
  if (!list.cards.length) return [];
  const player = info.get("Player") || info.get("プレイヤー") || "";
  const eventName = info.get("Tournament") || info.get("大会名") || "";
  return [{ ...list, title: `${eventName || pageTitle}${player ? ` - ${player}` : ""}`, player, eventName, format: deckFormat,
    archetype: info.get("Archetype") || "Unknown", eventDate: toIsoDate(info.get("Date") || info.get("開催日")), dateBasis: "event",
    url: canonicalHareruyaUrl(pageUrl), pageUrl: canonicalHareruyaUrl(pageUrl), pageTitle, text: list.cards.join("\n") }];
}
