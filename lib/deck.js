import { normalizeText } from "./html.js";
import { toIsoDate } from "./util.js";
import { inferArchetype, inferArchetypeFromCards } from "./archetype.js";

export function isDeckResultPage(url, sourceUrls) {
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

export function extractDeckCardNames(deckText) {
  const names = [];
  const lines = String(deckText || "").split(/\r?\n/);
  for (const line of lines) {
    const clean = line
      .replace(/<[^>]+>/g, " ")
      .replace(/\\u002F/g, "/")
      .replace(/\s+/g, " ")
      .trim();
    const match = clean.match(/^\d+\s+(.+)$/);
    if (!match) continue;
    const name = match[1].replace(/\s+\(.+\)$/g, "").trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function extractDeckEntries(html, pageUrl, pageTitle, sourceUrls, pageDate = "") {
  const decoded = decodeEmbeddedDeckMarkup(html);
  const entries = [];
  const pattern = /<deck-list\b([^>]*)>([\s\S]*?)<\/deck-list>/gi;
  let match;
  let index = 0;

  while ((match = pattern.exec(decoded))) {
    const attrs = match[1];
    const body = match[2] || "";
    const cards = extractDeckCardNames(body);
    const title = attrs.match(/\bdeck-title="([^"]+)"/i)?.[1]?.trim() || `Deck ${index + 1}`;
    const subtitle = attrs.match(/\bsubtitle="([^"]+)"/i)?.[1]?.trim() || "";
    const archetype = inferArchetypeFromCards(cards, subtitle || inferArchetype(title, pageTitle));
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

export function extractLinks(html, baseUrl) {
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
