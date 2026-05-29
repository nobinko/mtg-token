import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheDir, userAgent } from "./config.js";
import { normalizeText, extractTitle, extractPublishedDate } from "./html.js";

const pageCache = new Map();

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
      pageCache.set(url, cached);
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
  pageCache.set(entry.url, entry);
}

export async function fetchPage(url, options = {}) {
  const useCache = options.useCache !== false;
  const refreshCache = options.refreshCache === true;
  const cached = useCache && !refreshCache ? await readCachedPage(url) : null;
  if (cached) return { ...cached, fromCache: true, staleCache: false };

  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "text/html,text/plain,*/*" }
  }).catch(async (error) => {
    const fallback = useCache ? await readCachedPage(url) : null;
    if (fallback) return { fallback, error };
    throw error;
  });

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

export async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "application/json" }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export async function clearPageCache() {
  await rm(cacheDir, { recursive: true, force: true });
  pageCache.clear();
}
