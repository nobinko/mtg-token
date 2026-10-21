// Only published MTG sources may enter the shared page/card cache. Validate
// every redirect as well as the initial URL, before cache lookup or logging.
const pageHosts = new Set([
  "mtgtop8.com", "www.mtgtop8.com", "mtgo.com", "www.mtgo.com", "magic.gg", "www.magic.gg",
  "magic.wizards.com", "mtg-jp.com", "www.mtg-jp.com", "article.hareruyamtg.com",
  "hareruyamtg.com", "www.hareruyamtg.com", "deck.hareruyamtg.com", "api.deck.hareruyamtg.com"
]);
const sensitiveKey = /token|secret|password|credential|authorization|signature|session|api.?key|client.?id|email|redirect|return.?url|callback|^url$|^uri$/i;
export class SourceUrlError extends Error {
  constructor() { super("取得先は対応するMTG公開サイトのHTTPS URLに限ります。認証情報・限定公開トークン付きのURLは使えません。"); this.name = "SourceUrlError"; }
}
export function publicSourceUrl(value, { json = false } = {}) {
  if (typeof value !== "string" || value.length > 2048) throw new SourceUrlError();
  let url;
  try { url = new URL(value); } catch { throw new SourceUrlError(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
      !(json ? url.hostname === "api.scryfall.com" : pageHosts.has(url.hostname))) throw new SourceUrlError();
  for (const key of url.searchParams.keys()) if (sensitiveKey.test(key)) throw new SourceUrlError();
  return url.href;
}

export async function fetchPublicResponse(value, options = {}, { json = false } = {}) {
  let url = publicSourceUrl(value, { json });
  for (let hop = 0; hop <= 4; hop++) {
    const response = await fetch(url, { ...options, redirect: "manual", credentials: "omit" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    // Never replay a collection POST, its body or caller headers on redirects.
    if (!location || (options.method && options.method !== "GET") || hop === 4) throw new SourceUrlError();
    try { url = publicSourceUrl(new URL(location, url).href, { json }); }
    catch { throw new SourceUrlError(); }
  }
}

export async function responseBytes(response, maxBytes = 12 * 1024 * 1024) {
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new Error("取得データがサイズ上限を超えています。"); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); throw new Error("取得データがサイズ上限を超えています。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
