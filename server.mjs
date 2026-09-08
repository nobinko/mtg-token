import { AsyncLocalStorage } from "node:async_hooks";
import { relative } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { port, publicDir, maxMatchedCards } from "./lib/config.js";
import { defaultSources, formatOptions, normalizeFormat } from "./lib/data.js";
import { toIsoDate, imageRefFor } from "./lib/util.js";
import { clearPageCache } from "./lib/cache.js";
import { formatEnvironmentInfo } from "./lib/environment.js";
import { environmentUpdates, confirmedEvents } from "./lib/updates.js";
import { fetchSetReleaseEvents, fetchSetCatalog } from "./lib/set-events.js";
import { preparationSetChoices } from "./lib/preparation-sets.js";
import { preparationWindow, preparationSources, dateOnly } from "./lib/preparation.js";
import { fetchPreparationSet, fetchJapaneseTokenPrintById } from "./lib/scryfall.js";
import { buildArchetypeProfiles, classifyByProfile, matchKnownArchetype, overallArchetypeStats, inferFallbackArchetype, resolveArchetypeIdentity, resolveArchetypeIdentityFromCards, fallbackArchetypeIdentity } from "./lib/archetype.js";
import { fetchFinderCandidates, fetchJapaneseName, fetchJapanesePrint, fetchJapaneseRelatedObjectName, fetchOfficialJapaneseCard, japaneseEmblemNameFromSource, printedNameFor } from "./lib/scryfall.js";
import { buildBulkObjects, groupObjectsBySet, japaneseNameFromTypeLine, japaneseOperationalName } from "./lib/tokens.js";
import { findCardMentions, deckResultsFromPages } from "./lib/search.js";
import { crawlSources } from "./lib/crawl.js";

// ---- ログブロードキャスト ----
const sseClients = new Set();
const logBuffer = [];
const LOG_BUFFER_MAX = 600;
const logContext = new AsyncLocalStorage();

const _origLog = console.log;
const _origError = console.error;

function serializeLogArg(arg) {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function normalizeLogRunId(value) {
  const runId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{1,96}$/.test(runId) ? runId : "";
}

function broadcast(line) {
  const entry = {
    line,
    runId: logContext.getStore()?.runId || "",
    at: new Date().toISOString()
  };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  for (const writer of sseClients) {
    try { writer(entry); } catch { sseClients.delete(writer); }
  }
}

console.log = (...args) => {
  _origLog(...args);
  broadcast(args.map(serializeLogArg).join(" "));
};

console.error = (...args) => {
  _origError(...args);
  broadcast("[ERROR] " + args.map(serializeLogArg).join(" "));
};

const app = new Hono();
app.use("/api/*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if ((origin && origin !== new URL(c.req.url).origin) || c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "同じ画面から操作してください。" }, 403);
  }
  await next();
});
let activeSearches = 0;
app.use("/api/token-cards", async (c, next) => {
  if (environmentUpdates.busy) return c.json({ error: "環境データ更新中です。完了後に検索してください。" }, 409);
  activeSearches += 1;
  try { await next(); } finally { activeSearches -= 1; }
});
app.get("/api/environment/status", async (c) => c.json(await environmentUpdates.status()));
app.post("/api/environment/update", async (c) => {
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "同じ画面から更新してください。" }, 403);
  if (activeSearches || environmentUpdates.busy) return c.json({ error: "検索または更新中です。完了後に実行してください。" }, 409);
  const body = await c.req.json().catch(() => ({}));
  if (!["standard", "pioneer", "modern", "legacy"].includes(body.format)) return c.json({ error: "フォーマットが不正です。" }, 400);
  if (activeSearches || environmentUpdates.busy) return c.json({ error: "検索または更新中です。完了後に実行してください。" }, 409);
  try {
    await environmentUpdates.update(body.format, {
      fetchSets: () => fetchSetReleaseEvents({ refresh: true, persist: false }),
      fetchCandidates: (format) => fetchFinderCandidates(format, { refresh: true, persist: false })
    });
    return c.json(await environmentUpdates.status());
  } catch (error) { return c.json({ error: error.message, status: await environmentUpdates.status() }, 502); }
});

function normalizeRequestedDeckCount(value, fallback = 300) {
  const parsed = Number(value);
  const count = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(20, Math.min(Math.trunc(count), 600));
}

app.get("/api/default-sources", (c) => c.json(defaultSources));

app.get("/api/formats", (c) => c.json(formatOptions));

app.get("/api/preparation-sets", async (c) => {
  const format = c.req.query("format");
  const targetDate = c.req.query("targetDate");
  if (!["standard", "pioneer", "modern", "legacy"].includes(format) || !dateOnly(targetDate)) return c.json({ error: "フォーマットと大会日を確認してください。" }, 400);
  const [catalog, active] = await Promise.all([fetchSetCatalog({ refresh: c.req.query("refresh") === "1" }), environmentUpdates.read()]);
  return c.json({ ...preparationSetChoices(catalog.sets, confirmedEvents(active.pack), format, targetDate), source: catalog.source, warning: catalog.warning });
});

app.get("/api/logs", (c) => {
  return streamSSE(c, async (stream) => {
    // 既存バッファを一括送信
    for (const entry of logBuffer) {
      await stream.writeSSE({ data: JSON.stringify(entry) });
    }
    const writer = async (entry) => {
      try { await stream.writeSSE({ data: JSON.stringify(entry) }); } catch { /* disconnected */ }
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
  const logRunId = normalizeLogRunId(body.logRunId);
  return logContext.run({ runId: logRunId }, async () => {
  const format = normalizeFormat(body.format);
  const sourceUrls = Array.isArray(body.sources) && body.sources.length
    ? body.sources
    : defaultSources[format] ?? defaultSources.standard;
  const maxChildPages = normalizeRequestedDeckCount(body.maxChildPages);
  const useCache = body.useCache !== false;
  const refreshCache = body.refreshCache === true;
  const targetDate = toIsoDate(body.targetDate) || new Date().toISOString().slice(0, 10);
  if (body.targetDate && !dateOnly(body.targetDate)) return c.json({ error: "大会日が不正です。" }, 400);
  const environment = await formatEnvironmentInfo(format, targetDate);
  if (!environment.resolved || !environment.startDate) {
    return c.json({ error: environment.reason, environment }, 422);
  }
  let preparation;
  try { preparation = preparationWindow(environment.events, format, targetDate, body.preparation); }
  catch (error) { return c.json({ error: error.message }, 400); }
  const environmentStartDate = preparation?.startDate || environment.startDate;
  const crawlTargetDate = preparation?.endDate || targetDate;
  const active = await environmentUpdates.read();
  const freshCandidates = active.format === format && Date.now() - Date.parse(active.checkedAt) < 24 * 60 * 60 * 1000;
  console.log(`[search] start format=${format} target=${targetDate} decks=${maxChildPages}`);

  const [candidates, crawl] = await Promise.all([
    freshCandidates ? Promise.resolve(active.candidates) : fetchFinderCandidates(format, { refresh: Boolean(active.checkedAt) || Boolean(preparation) }),
    crawlSources(sourceUrls, maxChildPages, { useCache, refreshCache, targetDate: crawlTargetDate, environmentStartDate, format })
  ]);

  const allowedDeckUrls = new Set(deckResultsFromPages(crawl.pages).slice(0, maxChildPages).map((deck) => deck.url));
  crawl.pages = crawl.pages.map((page) => ({ ...page, deckEntries: (page.deckEntries || []).filter((deck) => allowedDeckUrls.has(deck.url)) }));
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
  const objectWarnings = [];
  const objects = await buildBulkObjects(matched, { enrichJapaneseAssets: false, warnings: objectWarnings });
  let preparationResult = null;
  if (preparation) {
    const warnings = [];
    preparationResult = { ...preparation, objects: [], warnings, status: "未取得" };
    try {
      const set = await fetchPreparationSet(preparation.setCode);
      const sources = preparationSources(set.cards, format, preparation.startsAt);
      if (!sources.length) warnings.push("対象フォーマットの候補を確定できません。未収録または使用不可の可能性があります。");
      if (sources.some((source) => source.legalityUnconfirmed)) warnings.push("未発売カードを含みます。当日のフォーマット使用可否は未確認です。");
      const extraObjects = await buildBulkObjects(sources, { enrichJapaneseAssets: false, warnings });
      preparationResult = { ...preparationResult, setName: set.metadata.name, sourceCount: sources.length, fetchedAt: set.fetchedAt,
        status: "取得済み（公開・収録済み情報の範囲。新メカニズムの網羅性は未確認）",
        objects: extraObjects.map((object) => ({ ...object, preparationOnly: true, note: [object.note, "新セットの追加準備候補。採用実績による推薦ではありません。"].filter(Boolean).join(" ") })) };
    } catch (error) { warnings.push(`新セット情報を取得できません: ${error.message}。候補なしではなく未取得です。`); }
  }
  const deckResults = deckResultsFromPages(crawl.pages).slice(0, maxChildPages);
  const archetypes = overallArchetypeStats(deckResults);
  console.log(`[search] done decks=${deckResults.length} sourceCards=${matched.length} objects=${objects.length}`);

  return c.json({
    logRunId,
    format,
    targetDate,
    environmentStartDate,
    environment: { ...environment, events: undefined },
    preparation: preparationResult,
    objectWarnings,
    sourceUrls,
    scannedPages: crawl.pages.map((page) => page.url),
    errors: crawl.errors,
    cacheStats: crawl.cacheStats,
    siteStats: crawl.siteStats,
    requestedDeckCount: maxChildPages,
    searchedDeckLimitReached: crawl.deckEntryCount >= maxChildPages,
    sourceExhausted: crawl.sourceExhausted,
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
});

app.post("/api/enrich-card-assets", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const logRunId = normalizeLogRunId(body.logRunId);
  return logContext.run({ runId: logRunId }, async () => {
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

    const jaCard = await fetchJapaneseTokenPrintById(object.printId);
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

  return c.json({ logRunId, sourceCards: sourceResults, objects: objectResults });
  });
});

app.use("/*", serveStatic({ root: relative(process.cwd(), publicDir) }));

app.onError((err, c) => {
  console.error(err?.stack || err?.message || err);
  return c.json({ error: err.message }, 500);
});

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`MTG Token Finder running at http://localhost:${port}`);
});
