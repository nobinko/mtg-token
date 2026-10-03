import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "./storage.js";
import { join } from "node:path";
import { cacheDir, userAgent, fetchTimeoutMs } from "./config.js";
import { normalizeText, extractTitle, extractPublishedDate } from "./html.js";

const pageCache = new Map();
const PAGE_CACHE_MAX = 24;
const PAGE_CACHE_BYTES_MAX = 8 * 1024 * 1024;
let pageCacheBytes = 0;

const pageBytes = entry => 2 * ((entry.html?.length || 0) + (entry.text?.length || 0));

function pageCacheSet(key, value) {
  const bytes = pageBytes(value);
  if (pageCache.has(key)) {
    pageCacheBytes -= pageBytes(pageCache.get(key));
    pageCache.delete(key);
  }
  if (bytes > PAGE_CACHE_BYTES_MAX) return;
  while (pageCache.size >= PAGE_CACHE_MAX || pageCacheBytes + bytes > PAGE_CACHE_BYTES_MAX) {
    const oldest = pageCache.keys().next().value;
    pageCacheBytes -= pageBytes(pageCache.get(oldest));
    pageCache.delete(oldest);
  }
  pageCache.set(key, value);
  pageCacheBytes += bytes;
}

function cacheFileForUrl(url) {
  const hash = createHash("sha256").update(url).digest("hex");
  return join(cacheDir, `${hash}.json`);
}

async function readCachedPage(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  try {
    const raw = await readFile(cacheFileForUrl(url), "utf8");
    const cached = JSON.parse(raw);
    if (cached?.url === url && cached.html) {
      pageCacheSet(url, cached);
      return cached;
    }
  } catch {
    // Cache miss.
  }
  return null;
}

async function writeCachedPage(entry) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFileForUrl(entry.url), JSON.stringify(entry), "utf8");
  pageCacheSet(entry.url, entry);
}

// maxAgeMs を超えたキャッシュは「新規取得の代わり」には使わない。
// ただし取得失敗時のフォールバックでは期限切れでも使う（staleCache として明示される）。
export function isFreshCacheEntry(entry, maxAgeMs) {
  if (!maxAgeMs) return true;
  const fetchedAt = Date.parse(entry?.fetchedAt || "");
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= maxAgeMs;
}

export async function fetchPage(url, options = {}) {
  const useCache = options.useCache !== false;
  const refreshCache = options.refreshCache === true;
  const cached = useCache && !refreshCache ? await readCachedPage(url) : null;
  if (cached && isFreshCacheEntry(cached, options.maxAgeMs)) {
    return { ...cached, fromCache: true, staleCache: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": userAgent, accept: "text/html,text/plain,*/*" }
    }).catch(async (error) => {
      const fallback = useCache ? await readCachedPage(url) : null;
      if (fallback) return { fallback, error };
      throw error;
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.fallback) {
    return { ...response.fallback, fromCache: true, staleCache: true };
  }

  if (!response.ok) {
    const fallback = useCache ? await readCachedPage(url) : null;
    if (fallback) return { ...fallback, fromCache: true, staleCache: true };
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const entry = {
    url,
    title: extractTitle(html, url),
    publishedDate: extractPublishedDate(html),
    html,
    text: normalizeText(html),
    fetchedAt: new Date().toISOString()
  };
  await writeCachedPage(entry);
  return { ...entry, fromCache: false, staleCache: false };
}

export async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || fetchTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: options.method || "GET",
      headers: { "user-agent": userAgent, accept: "application/json", ...(options.headers || {}) },
      body: options.body
    });
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`);
      error.status = response.status;
      error.retryAfter = response.headers.get("retry-after") || "";
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function clearPageCache() {
  await rm(cacheDir, { recursive: true, force: true });
  pageCache.clear();
  pageCacheBytes = 0;
}
