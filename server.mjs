import { AsyncLocalStorage } from "node:async_hooks";
import { relative } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { port, publicDir, maxMatchedCards, seedPageMaxAgeMs } from "./lib/config.js";
import { defaultSources, formatOptions, normalizeFormat } from "./lib/data.js";
import { toIsoDate, imageRefFor } from "./lib/util.js";
import { clearPageCache, fetchPage } from "./lib/cache.js";
import { formatEnvironmentInfo, isDateInEnvironment } from "./lib/environment.js";
import { environmentUpdates, confirmedEvents } from "./lib/updates.js";
import { fetchSetReleaseEvents, fetchSetCatalog } from "./lib/set-events.js";
import { preparationSetChoices } from "./lib/preparation-sets.js";
import { preparationWindow, preparationSources, dateOnly } from "./lib/preparation.js";
import { fetchPreparationSet, fetchJapaneseTokenPrintById } from "./lib/scryfall.js";
import { buildArchetypeProfiles, classifyByProfile, matchKnownArchetype, overallArchetypeStats, inferFallbackArchetype, resolveArchetypeIdentity, resolveArchetypeIdentityFromCards, fallbackArchetypeIdentity } from "./lib/archetype.js";
import { fetchCardMetadata, fetchFinderCandidates, fetchJapaneseName, fetchJapanesePrint, fetchJapaneseRelatedObjectName, fetchOfficialJapaneseCard, japaneseEmblemNameFromSource, printedNameFor } from "./lib/scryfall.js";
import { buildBulkObjects, groupObjectsBySet, japaneseNameFromTypeLine, japaneseOperationalName } from "./lib/tokens.js";
import { findCardMentions, deckResultsFromPages } from "./lib/search.js";
import { crawlSources } from "./lib/crawl.js";
import { extractDeckEntries } from "./lib/deck.js";
import { chooseRepresentativeDeck, extractMtgTop8ArchetypeDeckLinks, normalizeMtgTop8ArchetypeUrl, representativeAsOfDate } from "./lib/meta.js";

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

function publicRepresentativeDeck(deck) {
  return {
    title: deck.title,
    url: deck.url,
    pageUrl: deck.pageUrl,
    eventDate: deck.eventDate,
    player: deck.player || "",
    event: deck.event || "",
    placement: deck.placement || "",
    mainboard: deck.mainboard || [],
    sideboard: deck.sideboard || [],
    mainboardCount: deck.mainboardCount || 0,
    sideboardCount: deck.sideboardCount || 0
  };
}

async function fetchRepresentativeCandidate(link, format, options) {
  const page = await fetchPage(link.url, options);
  const deck = extractDeckEntries(page.html, link.url, page.title, [link.url], link.eventDate || page.publishedDate || "", format)[0];
  if (!deck) throw new Error("デッキリストを抽出できませんでした。");
  if (link.eventDate) deck.eventDate = link.eventDate;
  deck.player = link.player || "";
  deck.event = link.event || "";
  deck.placement = link.placement || "";
  return deck;
}

app.get("/api/default-sources", (c) => c.json(defaultSources));

app.get("/api/formats", (c) => c.json(formatOptions));

app.post("/api/meta-deck", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const logRunId = normalizeLogRunId(body.logRunId);
  return logContext.run({ runId: logRunId }, async () => {
    const format = String(body.format || "").toLowerCase();
    if (!["standard", "pioneer", "modern", "legacy"].includes(format)) return c.json({ error: "フォーマットが不正です。" }, 400);
    const targetDate = toIsoDate(body.targetDate) || new Date().toISOString().slice(0, 10);
    if (body.targetDate && !dateOnly(body.targetDate)) return c.json({ error: "大会日が不正です。" }, 400);
    const archetypeUrl = normalizeMtgTop8ArchetypeUrl(body.archetypeUrl, format);
    if (!archetypeUrl) return c.json({ error: "トップメタの取得元URLが不正です。" }, 400);

    const today = new Date().toISOString().slice(0, 10);
    const targetEnvironment = await formatEnvironmentInfo(format, targetDate);
    if (!targetEnvironment.resolved || !targetEnvironment.startDate) return c.json({ error: targetEnvironment.reason, environment: targetEnvironment }, 422);

    let representativeEnvironment = targetEnvironment;
    let representativeEndDate = representativeAsOfDate(targetDate, today);
    let representativeScope = {
      type: "target-environment",
      label: "指定日の環境",
      note: ""
    };

    if (body.preparation) {
      let preparation;
      try {
        preparation = preparationWindow(targetEnvironment.events, format, targetDate, body.preparation, today);
      } catch (error) {
        return c.json({ error: error.message }, 400);
      }
      representativeEnvironment = preparation.previous;
      representativeEndDate = preparation.endDate;
      representativeScope = {
        type: "preparation-baseline",
        label: "新セット導入前の準備用ベースライン",
        note: `大会日 ${targetDate} の新環境実績ではありません。新セット導入前の ${preparation.startDate}〜${preparation.endDate} に公開された実在リストから選んでいます。`
      };
    } else if (targetDate > today) {
      representativeEnvironment = await formatEnvironmentInfo(format, representativeEndDate);
      if (!representativeEnvironment.resolved || !representativeEnvironment.startDate) {
        return c.json({ error: representativeEnvironment.reason, environment: representativeEnvironment }, 422);
      }
      representativeScope = {
        type: "current-baseline",
        label: "現時点の準備用ベースライン",
        note: `大会日 ${targetDate} は未来のため、${representativeEndDate} 時点の環境に公開された実在リストから選んでいます。大会当日のメタ予測ではありません。`
      };
    }

    const fetchOptions = {
      useCache: body.useCache !== false,
      refreshCache: body.refreshCache === true
    };

    let archetypePage;
    try {
      console.log(`[meta] fetching archetype ${archetypeUrl}`);
      archetypePage = await fetchPage(archetypeUrl, { ...fetchOptions, maxAgeMs: seedPageMaxAgeMs });
    } catch (error) {
      return c.json({ error: `アーキタイプ一覧を取得できません: ${error.message}` }, 502);
    }

    const allLinks = extractMtgTop8ArchetypeDeckLinks(archetypePage.html, archetypeUrl, format);
    const candidateLinks = allLinks
      .filter((link) => !link.eventDate || isDateInEnvironment(link.eventDate, representativeEnvironment.startDate, representativeEndDate))
      .slice(0, 8);
    if (!candidateLinks.length) {
      return c.json({ error: `${representativeEnvironment.startDate}〜${representativeEndDate}に該当する完全デッキ候補がありません。` }, 404);
    }

    const decks = [];
    const warnings = [];
    for (let index = 0; index < candidateLinks.length; index += 3) {
      const batch = candidateLinks.slice(index, index + 3);
      const settled = await Promise.allSettled(batch.map((link) => fetchRepresentativeCandidate(link, format, fetchOptions)));
      settled.forEach((result, resultIndex) => {
        if (result.status === "fulfilled") decks.push(result.value);
        else warnings.push(`${batch[resultIndex].name || "デッキ"}: ${result.reason?.message || result.reason}`);
      });
    }

    const representative = chooseRepresentativeDeck(decks);
    if (!representative) {
      return c.json({ error: "60枚のメインデッキを持つ完全リストを取得できませんでした。", warnings }, 502);
    }

    console.log(`[meta] representative candidates=${representative.sampleSize} selected=${representative.deck.url}`);
    return c.json({
      archetypeName: String(body.archetypeName || "").slice(0, 120),
      source: "MTGTop8",
      sourceUrl: archetypeUrl,
      sourceFetchedAt: archetypePage.fetchedAt,
      environmentStartDate: representativeEnvironment.startDate,
      representativeEndDate,
      representativeScope: {
        ...representativeScope,
        startDate: representativeEnvironment.startDate,
        endDate: representativeEndDate
      },
      targetDate,
      candidateLinkCount: candidateLinks.length,
      sampleSize: representative.sampleSize,
      similarityPercent: representative.similarityPercent,
      selectionMethod: representative.method,
      deck: publicRepresentativeDeck(representative.deck),
      warnings: warnings.slice(0, 8)
    });
  });
});

app.get("/api/preparation-sets", async (c) => {
  const format = c.req.query("format");
  const targetDate = c.req.query("targetDate");
  if (!["standard", "pioneer", "modern", "legacy"].includes(format) || !dateOnly(targetDate)) return c.json({ error: "フォーマットと大会日を確認してください。" }, 400);
  const [catalog, active] = await Promise.all([fetchSetCatalog({ refresh: c.req.query("refresh") === "1" }), environmentUpdates.read()]);
  return c.json({ ...preparationSetChoices(catalog.sets, confirmedEvents(active.pack), format, targetDate), source: catalog.source, warning: catalog.warning });
});

app.post("/api/card-metadata", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const names = Array.isArray(body.names) ? body.names.slice(0, 150) : [];
  if (!names.length) return c.json({ cards: [] });
  return c.json({ cards: await fetchCardMetadata(names) });
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
  const metaSnapshot = (crawl.metaSnapshots || []).find((snapshot) => snapshot.entries?.length) || null;
  const topMeta = metaSnapshot ? {
    ...metaSnapshot,
    entries: metaSnapshot.entries.slice(0, 10),
    note: "トップメタは検索デッキの自動分類ではなく、取得時点のMTGTop8掲載値です。大会日の過去スナップショットではありません。"
  } : null;
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
    topMeta,
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
