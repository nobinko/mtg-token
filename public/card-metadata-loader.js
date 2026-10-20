const normalize = name => String(name || "").replace(/\s+/g, " ").trim().toLowerCase();

// The gallery and solo table need the same Oracle records. Share completed and
// pending requests so opening the table while images load does not fetch twice.
export function createCardMetadataLoader({ request = fetch, now = Date.now, timeoutMs = 20_000, bundledCards = [] } = {}) {
  const cache = new Map(), pending = new Map();
  const bundled = new Map();
  for (const card of bundledCards) if (!card.unavailable) {
    for (const name of [card.name, card.requestedName, ...(card.aliases || []), ...(card.faces || []).map(f => f.name)].filter(Boolean)) bundled.set(normalize(name), card);
  }
  async function fetchBatch(names, language) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request("/api/card-metadata", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ names, language }), signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.cards)) {
          const error = new Error(data.error || "カード情報を取得できませんでした。もう一度開いて再試行できます。");
          error.retryable = response.status >= 500 || response.status === 429 || response.ok;
          throw error;
        }
        for (const card of data.cards) {
          if (card.unavailable) continue;
          for (const name of [card.requestedName, card.name, ...(card.faces || []).map(face => face.name)].filter(Boolean)) {
            cache.set(`${language}:${normalize(name)}`, { card, expires: now() + 60 * 60_000 });
          }
        }
        while (cache.size > 2000) cache.delete(cache.keys().next().value);
        return data.cards;
      } catch (error) {
        lastError = error;
        if (error.retryable === false) break;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }
  return async function load(names, { language = "en", refresh = false } = {}) {
    const unique = [...new Set((names || []).map(name => String(name).trim()).filter(Boolean))];
    const missing = unique.filter(name => refresh || (cache.get(`${language}:${normalize(name)}`)?.expires || 0) <= now() && !(language === "en" && bundled.has(normalize(name))));
    let fetched = [];
    if (missing.length) {
      const key = `${language}:${missing.map(normalize).sort().join("\n")}`;
      if (!pending.has(key)) pending.set(key, fetchBatch(missing, language).finally(() => pending.delete(key)));
      fetched = await pending.get(key);
    }
    return unique.map(name => {
      const live = cache.get(`${language}:${normalize(name)}`)?.card
        || fetched.find(card => normalize(card.requestedName || card.name) === normalize(name));
      const snapshot = language === "en" ? bundled.get(normalize(name)) : null;
      const hit = live || snapshot;
      return hit ? { ...hit, requestedName: name, ...(live ? {} : { metadataSource: "bundled" }) } : { name, unavailable: true };
    });
  };
}

export const loadCardMetadata = createCardMetadataLoader({ bundledCards: GOLDFISH_METADATA });
import { GOLDFISH_METADATA } from "./goldfish-metadata.js?v=20261021-public30e";
