// 鮮度チェック（CI から日次実行、手元でも `node scripts/freshness-check.mjs` で実行可能）。
//
// 1. 禁止改定の予定日超過を検知する（環境イベント表の nextAnnouncementDate と比較）
// 2. Scryfall のリーガリティを前回スナップショットと比較し、禁止/解禁を検知したら
//    環境イベント表へ自動でイベントを追記する（発表日と最大1日ずれる。本文に明記）
// 3. 新しい通常セットと新キーワードを検知し、メカニズム監査用の情報を報告する
//
// 出力: freshness-report.json（コミットしない。workflow が Issue 化する）
// 変更: data/environment-events.json / data/freshness-snapshot.json（workflow がコミットする）
//
// スナップショットが無い初回はベースラインを作るだけで、差分は報告しない。

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const eventsPath = join(root, "data", "environment-events.json");
const snapshotPath = join(root, "data", "freshness-snapshot.json");
const reportPath = join(root, "freshness-report.json");

const FORMATS = ["standard", "pioneer", "modern", "legacy"];
const FORMAT_LABELS = { standard: "Standard", pioneer: "Pioneer", modern: "Modern", legacy: "Legacy" };
const USER_AGENT = "mtg-token-finder-freshness/0.1 (+https://github.com/nobinko/mtg-token)";
const REQUEST_DELAY_MS = 150;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scryfall(url) {
  await sleep(REQUEST_DELAY_MS);
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  // Scryfall は「検索結果0件」も404で返す。呼び出し側が空として扱えるよう null を返す
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function scryfallList(url) {
  const items = [];
  let next = url;
  while (next) {
    const page = await scryfall(next);
    if (!page) break;
    items.push(...(page.data || []));
    next = page.has_more ? page.next_page : null;
  }
  return items;
}

async function fetchBannedNames(format) {
  const query = encodeURIComponent(`banned:${format} game:paper`);
  const cards = await scryfallList(`https://api.scryfall.com/cards/search?unique=cards&order=name&q=${query}`);
  return cards.map((card) => card.name).sort();
}

async function isCardLegalNow(name, format) {
  try {
    const card = await scryfall(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
    return card?.legalities?.[format] === "legal";
  } catch {
    return false;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

// --- 1. 禁止改定の予定日超過 ---
// 「予告されている次回改定日」を過ぎたのに、それ以降の banned-restricted イベントが
// 無い場合に警告する。変更なしの発表だった場合はイベントが増えないため、
// 手動で nextAnnouncementDate を更新するまで警告が出続ける（仕様）。
function checkStaleAnnouncement(events, today) {
  const banEvents = events.filter((event) => event.type === "banned-restricted");
  const expected = banEvents.map((event) => event.nextAnnouncementDate || "").filter(Boolean).sort().at(-1);
  if (!expected || today <= expected) return null;
  const covered = banEvents.some((event) => event.date >= expected);
  if (covered) return null;
  return {
    expectedDate: expected,
    message: `予告されていた禁止改定日 ${expected} を過ぎていますが、環境イベント表にそれ以降の改定エントリがありません。` +
      `公式発表を確認し、変更があれば data/environment-events.json に追記、変更なしなら nextAnnouncementDate を次回日程へ更新してください。`
  };
}

// --- 2. リーガリティ差分 ---
async function detectBanChanges(snapshot, today) {
  const current = {};
  for (const format of FORMATS) {
    current[format] = await fetchBannedNames(format);
  }
  if (!snapshot) return { current, changes: null };

  const changes = {};
  for (const format of FORMATS) {
    const before = new Set(snapshot[format] || []);
    const after = new Set(current[format]);
    const banned = [...after].filter((name) => !before.has(name));
    const unbannedCandidates = [...before].filter((name) => !after.has(name));
    const unbanned = [];
    for (const name of unbannedCandidates) {
      // ローテーション等で banned → not_legal になったカードを「解禁」と誤検知しないよう、
      // 現在 legal になっていることを確認する
      if (await isCardLegalNow(name, format)) unbanned.push(name);
    }
    if (banned.length || unbanned.length) changes[format] = { banned, unbanned };
  }
  return { current, changes: Object.keys(changes).length ? changes : null };
}

function banChangeEvent(changes, today) {
  const affected = Object.keys(changes);
  const unchanged = FORMATS.filter((format) => !affected.includes(format));
  const changeText = {};
  for (const format of FORMATS) {
    if (!changes[format]) {
      changeText[format] = "No changes.";
      continue;
    }
    const parts = [];
    if (changes[format].banned.length) parts.push(`${changes[format].banned.join(", ")} was banned in ${FORMAT_LABELS[format]}.`);
    if (changes[format].unbanned.length) parts.push(`${changes[format].unbanned.join(", ")} was unbanned in ${FORMAT_LABELS[format]}.`);
    changeText[format] = parts.join(" ");
  }
  return {
    date: today,
    type: "banned-restricted",
    title: `Banned and Restricted update (auto-detected ${today})`,
    sourceUrl: "https://magic.wizards.com/en/news/banned-restricted",
    formatsAffected: affected,
    formatsUnchanged: unchanged,
    changes: changeText,
    autoDetected: true,
    note: "Scryfallリーガリティ差分による自動検知。日付は検知日で、公式発表日と最大1日ずれることがある。"
  };
}

// --- 3. 新セット・新キーワード ---
// スナップショットには「処理済み（＝過去に検知した or 運用開始前から存在した）」セットだけを載せる。
// Scryfall には未発売セットが数ヶ月前から載るため、全コードを保存すると
// 発売が近づいた時には既知扱いになり、監査 Issue が一度も発火しなくなる。
async function detectNewSets(snapshot, today) {
  const sets = (await scryfall("https://api.scryfall.com/sets"))?.data || [];
  const paperSets = sets.filter((set) => !set.digital && ["expansion", "core"].includes(set.set_type));
  // 発売済み〜発売21日前のセットだけを処理対象にする（プレビュー時期に合わせて事前に監査できる）
  const horizon = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const due = paperSets.filter((set) => set.released_at && set.released_at <= horizon);
  const dueCodes = due.map((set) => set.code);
  if (!snapshot) return { processedCodes: dueCodes, fresh: [] };

  const known = new Set(snapshot);
  const fresh = due
    .filter((set) => !known.has(set.code))
    .map((set) => ({ code: set.code.toUpperCase(), name: set.name, releasedAt: set.released_at }));
  return { processedCodes: [...new Set([...snapshot, ...dueCodes])], fresh };
}

async function detectNewKeywords(snapshot) {
  const catalogs = ["keyword-abilities", "keyword-actions", "ability-words"];
  const all = [];
  for (const catalog of catalogs) {
    const data = await scryfall(`https://api.scryfall.com/catalog/${catalog}`);
    all.push(...(data.data || []));
  }
  const current = [...new Set(all)].sort();
  if (!snapshot) return { current, fresh: [] };
  const known = new Set(snapshot);
  return { current, fresh: current.filter((keyword) => !known.has(keyword)) };
}

// --- main ---
const today = todayIso();
const eventsFile = await readJson(eventsPath);
if (!eventsFile || !Array.isArray(eventsFile.events)) {
  console.error(`environment-events.json を読めません: ${eventsPath}`);
  process.exit(1);
}
const snapshot = await readJson(snapshotPath);
const bootstrap = !snapshot;

const staleAnnouncement = checkStaleAnnouncement(eventsFile.events, today);
const banResult = await detectBanChanges(snapshot?.bannedByFormat || null, today);
const setResult = await detectNewSets(snapshot?.setCodes || null, today);
const keywordResult = await detectNewKeywords(snapshot?.keywords || null);

let eventsUpdated = false;
if (banResult.changes) {
  eventsFile.events.push(banChangeEvent(banResult.changes, today));
  eventsFile.events.sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(eventsPath, `${JSON.stringify(eventsFile, null, 2)}\n`, "utf8");
  eventsUpdated = true;
}

// generatedAt だけの差分で毎日コミットが積まれないよう、内容が変わった時だけ書き換える
const nextSnapshotBody = {
  bannedByFormat: banResult.current,
  setCodes: setResult.processedCodes,
  keywords: keywordResult.current
};
const prevSnapshotBody = snapshot
  ? { bannedByFormat: snapshot.bannedByFormat, setCodes: snapshot.setCodes, keywords: snapshot.keywords }
  : null;
if (JSON.stringify(prevSnapshotBody) !== JSON.stringify(nextSnapshotBody)) {
  await writeFile(snapshotPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    ...nextSnapshotBody
  }, null, 2)}\n`, "utf8");
}

const report = {
  generatedAt: new Date().toISOString(),
  bootstrap,
  staleAnnouncement,
  banChanges: banResult.changes,
  eventsUpdated,
  newSets: setResult.fresh,
  newKeywords: keywordResult.fresh
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(bootstrap
  ? "ベースラインのスナップショットを作成しました（差分報告なし）。"
  : `チェック完了: 改定超過=${staleAnnouncement ? "あり" : "なし"} / 禁止差分=${banResult.changes ? Object.keys(banResult.changes).join(",") : "なし"} / 新セット=${setResult.fresh.length}件 / 新キーワード=${keywordResult.fresh.length}件`);
