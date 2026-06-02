import { relative } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { port, publicDir, maxMatchedCards } from "./lib/config.js";
import { defaultSources } from "./lib/data.js";
import { toIsoDate, imageRefFor } from "./lib/util.js";
import { clearPageCache } from "./lib/cache.js";
import { formatEnvironmentInfo } from "./lib/environment.js";
import { buildArchetypeProfiles, classifyByProfile, matchKnownArchetype, overallArchetypeStats, inferFallbackArchetype, resolveArchetypeIdentity, resolveArchetypeIdentityFromCards, fallbackArchetypeIdentity } from "./lib/archetype.js";
import { fetchFinderCandidates, fetchJapaneseName, fetchJapanesePrint, fetchJapaneseRelatedObjectName, fetchOfficialJapaneseCard, japaneseEmblemNameFromSource, printedNameFor } from "./lib/scryfall.js";
import { buildBulkObjects, groupObjectsBySet, japaneseNameFromTypeLine, japaneseOperationalName } from "./lib/tokens.js";
import { findCardMentions, deckResultsFromPages } from "./lib/search.js";
import { crawlSources } from "./lib/crawl.js";

// ---- ログブロードキャスト ----
const sseClients = new Set();
const logBuffer = [];
const LOG_BUFFER_MAX = 600;

const _origLog = console.log;
const _origError = console.error;

function broadcast(line) {
  logBuffer.push(line);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  for (const writer of sseClients) {
    try { writer(line); } catch { sseClients.delete(writer); }
  }
}

console.log = (...args) => {
  _origLog(...args);
  broadcast(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
};

console.error = (...args) => {
  _origError(...args);
  broadcast("[ERROR] " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
};

const app = new Hono();

app.get("/api/default-sources", (c) => c.json(defaultSources));

app.get("/api/logs", (c) => {
  return streamSSE(c, async (stream) => {
    // 既存バッファを一括送信
    for (const line of logBuffer) {
      await stream.writeSSE({ data: line });
    }
    const writer = async (line) => {
      try { await stream.writeSSE({ data: line }); } catch { /* disconnected */ }
    };
    sseClients.add(writer);
    try {
      // ping で接続を維持（15秒ごと）
      while (true) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: "ping", data: "" });
      }
    } finally {
      sseClients.delete(writer);
    }
  });
});

app.post("/api/cache/clear", async (c) => {
  await clearPageCache();
  return c.json({ ok: true });
});

app.post("/api/token-cards", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const format = String(body.format || "standard").toLowerCase();
  const sourceUrls = Array.isArray(body.sources) && body.sources.length
    ? body.sources
    : defaultSources[format] ?? defaultSources.standard;
  const maxChildPages = Math.min(Number(body.maxChildPages || 300), 600);
  const useCache = body.useCache !== false;
  const refreshCache = body.refreshCache === true;
  const targetDate = toIsoDate(body.targetDate) || new Date().toISOString().slice(0, 10);
  const environment = formatEnvironmentInfo(format, targetDate);
  const environmentStartDate = toIsoDate(body.environmentStartDate) || environment.startDate || "0000-00-00";
  environment.startDate = environmentStartDate;

  const [candidates, crawl] = await Promise.all([
    fetchFinderCandidates(format),
    crawlSources(sourceUrls, maxChildPages, { useCache, refreshCache, targetDate, environmentStartDate, format })
  ]);

  const allDeckEntries = crawl.pages.flatMap((page) => page.deckEntries ?? []);
  const { knownArchetypes } = crawl;

  // アーキタイプ分類パイプライン:
  //  deck.js 抽出時点 ── archetypeRules（カード一致）＋タイトル推定で初期ラベル付与
  //  パス1（ここ）────── knownArchetypes: 巡回で集めたメタゲームページの正確な名前で照合
  //  パス2（ここ）────── buildArchetypeProfiles: 正しくラベルが付いたデッキ群からコアカードを学習し Unknown を再分類
  //  パス3（ここ）────── inferFallbackArchetype: 土地色＋戦略シグナルで大枠ラベルを付与。真のローグのみ残る

  // パス1: 巡回で取得したメタゲームページの正確なアーキタイプ名でタイトル照合
  // "Unknown" だけでなく、正規の名前でないデッキ（プレイヤー名混じりなど）も対象にする
  if (knownArchetypes.size > 0) {
    for (const deck of allDeckEntries) {
      if (!deck.archetype || deck.archetype === "Unknown" || !knownArchetypes.has(deck.archetype)) {
        const matched = matchKnownArchetype(deck.title, knownArchetypes)
          ?? matchKnownArchetype(deck.pageTitle, knownArchetypes);
        if (matched) deck.archetype = matched;
      }
    }
  }

  // パス2: カード構成プロファイルによる再分類
  // パス1後の正確なラベルをもとにコアカードを学習し、まだ Unknown のデッキを分類する
  const profiles = buildArchetypeProfiles(allDeckEntries);
  for (const deck of allDeckEntries) {
    if (!deck.archetype || deck.archetype === "Unknown") {
      deck.archetype = classifyByProfile(deck.cards ?? [], profiles);
    }
  }

  // パス3: 土地色＋戦略シグナルによる最終フォールバック
  // 上記すべてで Unknown のままのデッキに "Izzet Midrange" 等の大枠ラベルを付ける。
  for (const deck of allDeckEntries) {
    if (!deck.archetype || deck.archetype === "Unknown") {
      deck.archetype = inferFallbackArchetype(deck.cards ?? []);
    }
  }

  // パス4: 日本語圏のデッキ名称を保持する ArchetypeIdentity に昇格。
  // 例: "Izzet Prowess" は "イゼット果敢" として表示しつつ、macroPlan / engineTags を保持する。
  for (const deck of allDeckEntries) {
    const identity = resolveArchetypeIdentity(deck.archetype, { confidence: 0.95, matchedBy: "normalized-name" })
      || resolveArchetypeIdentityFromCards(deck.cards ?? [])
      || fallbackArchetypeIdentity(deck.archetype, deck.cards ?? []);
    if (identity) {
      deck.archetypeIdentity = identity;
      deck.archetype = identity.displayName;
    }
  }

  const matched = findCardMentions(candidates, crawl.pages).slice(0, maxMatchedCards);
  const objects = await buildBulkObjects(matched, { enrichJapaneseAssets: false });
  const deckResults = deckResultsFromPages(crawl.pages).slice(0, maxChildPages);
  const archetypes = overallArchetypeStats(deckResults);

  return c.json({
    format,
    targetDate,
    environmentStartDate,
    environment,
    sourceUrls,
    scannedPages: crawl.pages.map((page) => page.url),
    errors: crawl.errors,
    cacheStats: crawl.cacheStats,
    siteStats: crawl.siteStats,
    unparsedDeckCount: crawl.unparsedDeckCount || 0,
    searchedDecks: deckResults,
    searchedDeckCount: deckResults.length,
    archetypes,
    candidateCount: candidates.length,
    cards: matched.map(({ raw: _raw, ...card }) => card),
    objects,
    groups: groupObjectsBySet(objects),
    assetsDeferred: true
  });
});

app.post("/api/enrich-card-assets", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sourceCards = Array.isArray(body.sourceCards) ? body.sourceCards.slice(0, 120) : [];
  const objects = Array.isArray(body.objects) ? body.objects.slice(0, 160) : [];
  const sourceInputByName = new Map(sourceCards.map((source) => [String(source.name || ""), source]));

  const sourceResults = [];
  for (const source of sourceCards) {
    const name = String(source.name || "");
    if (!name) continue;
    const set = String(source.set || "");
    const jaPrint = await fetchJapanesePrint(name);
    const officialJa = await fetchOfficialJapaneseCard(name, { set });
    const imageJaRef = jaPrint ? imageRefFor(jaPrint) : null;
    sourceResults.push({
      name,
      japaneseName: printedNameFor(jaPrint) || officialJa?.japaneseName || await fetchJapaneseName(name),
      imageJa: imageJaRef?.url || "",
      imageJaSource: imageJaRef?.source || "none",
      imageJaSourceLabel: imageJaRef?.sourceLabel || "日本語画像なし",
      imageJaSourceUrl: imageJaRef?.sourceUrl || ""
    });
  }
  const sourceJapaneseByName = new Map(sourceResults.map((source) => [source.name, source.japaneseName || ""]));

  const objectResults = [];
  for (const object of objects) {
    const name = String(object.name || "");
    const kind = String(object.kind || "");
    const typeLine = String(object.typeLine || "");
    if (!name) continue;
    const sourceNames = Array.isArray(object.sourceNames) ? object.sourceNames.filter(Boolean) : [];
    let japaneseName = "";
    for (const sourceName of sourceNames.slice(0, 4)) {
      const sourceSet = String(sourceInputByName.get(sourceName)?.set || "");
      japaneseName = await fetchJapaneseRelatedObjectName(sourceName, { name, type_line: typeLine }, { set: sourceSet });
      if (japaneseName) break;
    }
    if (/emblem/i.test(kind) || /emblem/i.test(typeLine) || /emblem/i.test(name)) {
      const sourceName = sourceNames[0] || "";
      japaneseName = japaneseEmblemNameFromSource(sourceName, sourceJapaneseByName.get(sourceName) || "", name);
    }
    japaneseName = japaneseName
      || japaneseNameFromTypeLine({ name, typeLine })
      || await fetchJapaneseName(name)
      || japaneseOperationalName({ name, typeLine, kind });

    const jaCard = await fetchJapanesePrint(name, { objectKind: kind });
    const imageJaRef = jaCard ? imageRefFor(jaCard) : null;
    objectResults.push({
      key: String(object.key || ""),
      name,
      typeLine,
      japaneseName,
      imageJa: imageJaRef?.url || "",
      imageJaSource: imageJaRef?.source || "none",
      imageJaSourceLabel: imageJaRef?.sourceLabel || "日本語画像なし",
      imageJaSourceUrl: imageJaRef?.sourceUrl || ""
    });
  }

  return c.json({ sourceCards: sourceResults, objects: objectResults });
});

app.use("/*", serveStatic({ root: relative(process.cwd(), publicDir) }));

app.onError((err, c) => {
  console.error(err?.stack || err?.message || err);
  return c.json({ error: err.message }, 500);
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`MTG Token Finder running at http://localhost:${port}`);
});
