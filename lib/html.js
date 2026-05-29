import { toIsoDate } from "./util.js";

export function normalizeText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export function extractTitle(html, url) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return new URL(url).pathname.replace(/^\/+/, "") || url;
  return normalizeText(match[1]).trim() || url;
}

export function extractPublishedDate(html) {
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
