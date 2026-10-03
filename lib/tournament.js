import { createHash, randomUUID } from "node:crypto";
import { fetchPage } from "./cache.js";
import { inferArchetypeFromCards } from "./archetype.js";
import { readFile, writeFile, mkdir, rename } from "./storage.js";

export const tournamentMaxBytes = 3 * 1024 * 1024;
const maxDecks = 2000;
const clean = value => String(value || "").normalize("NFKC").trim();
const text = value => clean(value).slice(0, 180);
const count = rows => rows.reduce((sum, row) => sum + row.count, 0);

export function meleeTournamentUrl(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== "https:" || url.hostname !== "melee.gg" || url.port || url.username || url.password) return "";
    const match = url.pathname.match(/^\/Tournament\/View\/([1-9]\d{0,8})\/?$/i);
    return match ? `https://melee.gg/Tournament/View/${match[1]}` : "";
  } catch { return ""; }
}

function deckUrl(value) {
  try {
    const url = new URL(clean(value), "https://melee.gg");
    if (url.protocol !== "https:" || url.hostname !== "melee.gg" || url.port || url.username || url.password) return "";
    const match = url.pathname.match(/^\/Decklist\/View\/([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})\/?$/i);
    return match ? `https://melee.gg/Decklist/View/${match[1].toLowerCase()}` : "";
  } catch { return ""; }
}

function mergeRows(rows) {
  if (!Array.isArray(rows) || rows.length > 300) throw new Error("カード行が不正です。1デッキ300行までです。");
  const merged = new Map();
  for (const row of rows) {
    const name = clean(row.name);
    const quantity = Number(row.count ?? row.quantity);
    if (!name || name.length > 180 || /[<>\r\n\x00-\x1f]/.test(name) || !Number.isInteger(quantity) || quantity < 1 || quantity > 250) throw new Error("カード名または枚数が不正です。");
    if (/[\u3040-\u30ff\u3400-\u9fff]/.test(name)) throw new Error("英語カード名のリストを使ってください。日本語名のまま集計するとトークンを照合できません。");
    const key = name.toLowerCase();
    const previous = merged.get(key);
    merged.set(key, { name: previous?.name || name, count: quantity + (previous?.count || 0) });
  }
  return [...merged.values()];
}

function parseDelimited(source) {
  const separator = source.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === separator || c === "\n")) {
      row.push(field.replace(/\r$/, "")); field = "";
      if (c === "\n") { if (row.some(value => value.trim())) rows.push(row); row = []; }
    } else field += c;
  }
  if (quoted) throw new Error("CSVの引用符が閉じていません。");
  row.push(field.replace(/\r$/, "")); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function parseCsv(source) {
  const rows = parseDelimited(source);
  const headers = rows.shift()?.map(value => clean(value).toLowerCase().replace(/[ _-]/g, "")) || [];
  const index = (...names) => headers.findIndex(header => names.includes(header));
  const card = index("card", "cardname", "カード名"), qty = index("quantity", "count", "qty", "枚数");
  if (card < 0 || qty < 0) throw new Error("CSVにはCardNameとQuantityの列が必要です。");
  const player = index("player", "playername", "プレイヤー"), title = index("deck", "deckname", "decklistname", "デッキ名");
  const id = index("decklistid", "deckid"), url = index("url", "decklisturl");
  const board = index("board", "zone", "sideboard", "区分");
  const groups = new Map();
  for (const [i, row] of rows.entries()) {
    if (row.length !== headers.length) throw new Error(`CSV ${i + 2}行目の列数が一致しません。`);
    const key = id >= 0 && row[id] || url >= 0 && row[url] || player >= 0 && row[player];
    if (!key) throw new Error("CSVにはPlayer、DecklistId、URLのいずれかの識別列が必要です。");
    if (!groups.has(key)) groups.set(key, { player: player >= 0 ? row[player] : "", title: title >= 0 ? row[title] : "", url: url >= 0 ? row[url] : id >= 0 ? `/Decklist/View/${row[id]}` : "", mainboard: [], sideboard: [] });
    const zone = clean(board >= 0 ? row[board] : "main").toLowerCase();
    const side = /^(sideboard|side|sb|true|1|サイド(?:ボード)?)$/.test(zone);
    if (!side && !/^(main(?:board|deck)?|deck|false|0|メイン(?:デッキ)?|)$/.test(zone)) throw new Error(`CSV ${i + 2}行目のメイン/サイド区分を確認してください。`);
    groups.get(key)[side ? "sideboard" : "mainboard"].push({ name: row[card], count: row[qty] });
  }
  return [...groups.values()];
}

function parseDeckText(source, fileName) {
  const decks = []; let current; let board = "mainboard"; let pendingBlank = false;
  const start = () => { current = { title: fileName.replace(/\.[^.]+$/, ""), mainboard: [], sideboard: [] }; board = "mainboard"; };
  const finish = () => { if (current?.mainboard.length || current?.sideboard.length) decks.push(current); current = null; pendingBlank = false; };
  for (const [i, raw] of source.split(/\r?\n/).entries()) {
    const line = clean(raw);
    if (!line) { if (current?.mainboard.length) pendingBlank = true; continue; }
    if (/^={3,}$|^-{3,}$/.test(line)) { finish(); continue; }
    const metadata = line.match(/^(Player|プレイヤー|Deck(?:list)? Name|デッキ名|URL)\s*[:：]\s*(.+)$/i);
    if (metadata) {
      const key = /player|プレイヤー/i.test(metadata[1]) ? "player" : /^url$/i.test(metadata[1]) ? "url" : "title";
      if (current?.mainboard.length && key === "player") finish();
      if (!current) start(); current[key] = metadata[2]; pendingBlank = false; continue;
    }
    const header = line.replace(/^[\[]|[\]]$/g, "").replace(/\s*\(\d+\)$/, "").replace(/[:：]$/, "");
    if (/^(deck|main(?:\s*deck|board)?|メイン(?:デッキ)?)$/i.test(header)) {
      if (current?.mainboard.length) finish(); if (!current) start(); board = "mainboard"; pendingBlank = false; continue;
    }
    if (/^(side(?:\s*board)?|サイド(?:ボード)?)$/i.test(header)) { if (!current) start(); board = "sideboard"; pendingBlank = false; continue; }
    if (/^(companion|相棒)$/i.test(header)) { if (!current) start(); board = "companion"; pendingBlank = false; continue; }
    const card = line.match(/^(?:(SB):\s*)?(\d+)\s*[xX]?\s+(.+)$/);
    if (!card) throw new Error(`${fileName || "貼り付け"} ${i + 1}行目を読めません: ${line.slice(0, 70)}。枚数と英語カード名の形式を確認してください。`);
    if (!current) start();
    if (board === "companion") continue; // Arena's companion declaration is also present in the sideboard.
    if (card[1] || pendingBlank) board = "sideboard";
    current[board].push({ name: card[3].replace(/\s+\([A-Z0-9]{2,8}\)\s+[\w★-]+$/i, ""), count: Number(card[2]) });
    pendingBlank = false;
  }
  finish(); return decks;
}

export function importTournament({ url, name, format, targetDate, participants, files }) {
  url = meleeTournamentUrl(url);
  if (!url) throw new Error("Meleeの大会URL（https://melee.gg/Tournament/View/数字）を入力してください。");
  if (!Array.isArray(files) || !files.length || files.length > maxDecks) throw new Error("リストを貼り付けるか、ファイルを選んでください。");
  let bytes = 0; const entries = [];
  for (const file of files) {
    if (typeof file.content !== "string") throw new Error("読み込むリストが不正です。");
    bytes += Buffer.byteLength(file.content, "utf8");
    if (bytes > tournamentMaxBytes) throw new Error("リストは合計3MBまでです。");
    const source = file.content.replace(/^\uFEFF/, "").trim(); if (!source) continue;
    let parsed;
    if (/^[\[{]/.test(source) && !/^\[(?:Main|Side|Deck)/i.test(source)) {
      const data = JSON.parse(source); parsed = Array.isArray(data) ? data : data.decks || [data];
    } else if (parseDelimited(source.split(/\r?\n/)[0])[0]?.some(value => /^(card|cardname|カード名)$/i.test(clean(value).replace(/[ _-]/g, "")))) parsed = parseCsv(source);
    else parsed = parseDeckText(source, text(file.name) || "貼り付け");
    if (!Array.isArray(parsed)) throw new Error("JSONはデッキの配列、またはdecks配列を指定してください。");
    entries.push(...parsed);
    if (entries.length > maxDecks) throw new Error("1大会2000リストまでです。分割せず、対象大会を確認してください。");
  }
  return normalizeTournament(entries, { url, name: text(name) || `Melee 大会 ${url.split("/").at(-1)}`, format, targetDate, participants, method: "import" });
}

function normalizeTournament(entries, info) {
  const decks = [], failures = [], seen = new Set(); let duplicates = 0;
  for (const [index, raw] of entries.entries()) {
    const label = text(raw?.player || raw?.title || raw?.name) || `リスト ${index + 1}`;
    try {
      const mainboard = mergeRows(raw.mainboard), sideboard = mergeRows(raw.sideboard || []);
      if (count(mainboard) < 60 || count(mainboard) > 250 || count(sideboard) > 15) throw new Error(`メイン${count(mainboard)}枚・サイド${count(sideboard)}枚。完全な構築リストを確認してください。`);
      const originalUrl = deckUrl(raw.url);
      // Anonymous identical lists still represent separate entrants. Only real deck URLs are deduplicated here.
      const digest = createHash("sha256").update(JSON.stringify([index, label, mainboard, sideboard])).digest("hex").slice(0, 20);
      const url = originalUrl || `${info.url}#import-${digest}`;
      if (seen.has(url)) { duplicates++; continue; } seen.add(url);
      const cards = [...new Set([...mainboard, ...sideboard].map(row => row.name))];
      decks.push({ title: text(raw.title || raw.name) || label, player: text(raw.player), url, pageUrl: originalUrl || info.url, sourceUrls: [info.url],
        imported: true, originalUrl,
        event: info.name, eventName: info.name, eventDate: info.targetDate, format: info.format, mainboard, sideboard,
        mainboardCount: count(mainboard), sideboardCount: count(sideboard), cards, archetype: inferArchetypeFromCards(cards) || "Unknown" });
    } catch (error) { failures.push({ name: label, message: error.message }); }
  }
  if (!decks.length) throw new Error(`読み込める完全リストがありません。${failures[0]?.message || "枚数と英語カード名を確認してください。"}`);
  const registeredCount = info.participants === "" || info.participants == null ? null : Number(info.participants);
  if (registeredCount !== null && (!Number.isInteger(registeredCount) || registeredCount < entries.length - duplicates || registeredCount > maxDecks)) throw new Error("大会の参加人数は読み込んだリスト数以上、2000人以下で入力してください。");
  return { ...info, participants: undefined, registeredCount, listedCount: entries.length - duplicates, deckCount: decks.length, failures, duplicateDeckCount: duplicates,
    missingCount: registeredCount === null ? null : registeredCount - decks.length, coverageComplete: registeredCount !== null && registeredCount === decks.length && !failures.length,
    fetchedAt: new Date().toISOString(), decks };
}

export async function fetchMeleeTournament(url) {
  url = meleeTournamentUrl(url);
  if (!url) throw new Error("Meleeの大会URLが不正です。");
  // Public pages only: never use account cookies, hidden staff endpoints, or bypass access restrictions.
  let page;
  try { page = await fetchPage(url, { useCache: false, refreshCache: true }); }
  catch (error) { throw new Error(`Meleeの大会一覧を自動取得できません（${error.status || error.message}）。大会から受け取ったファイルか、デッキ画面のコピーを下で取り込んでください。`); }
  const links = [...new Set([...page.html.matchAll(/href=["']([^"']*\/Decklist\/View\/[^"']+)["']/gi)].map(match => deckUrl(match[1])).filter(Boolean))];
  if (!links.length) throw new Error("Meleeの公開ページからデッキ一覧を取得できません。非公開または動的な一覧のため、受け取ったファイルを取り込んでください。");
  // A rendered standings page is paginated. Never call its first page the full field.
  throw new Error(`${links.length}件のリンクは見つかりましたが、大会全体の一覧を確認できません。先頭ページだけで集計せず、一括ファイルを取り込んでください。`);
}

const snapshotPath = url => `.cache/tournaments/${createHash("sha256").update(url).digest("hex")}.json`;
export async function saveTournament(tournament) {
  await mkdir(".cache/tournaments", { recursive: true });
  const path = snapshotPath(tournament.url), temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(tournament), "utf8");
  await rename(temporary, path);
}
export async function readTournament(url) {
  url = meleeTournamentUrl(url); if (!url) return null;
  try { return JSON.parse(await readFile(snapshotPath(url), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function tournamentSummary(tournament) {
  const { decks, ...info } = tournament;
  return { ...info, preview: decks.slice(0, 8).map(deck => ({ title: deck.title, player: deck.player, mainboardCount: deck.mainboardCount, sideboardCount: deck.sideboardCount })) };
}
