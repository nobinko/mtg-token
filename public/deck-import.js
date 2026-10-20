const clean = value => String(value || "").normalize("NFKC").trim();

export function parseSoloDeck(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("デッキリストを貼り付けてください。");
  if (source.length > 50000) throw new Error("一度に1リスト、50,000文字まで貼り付けられます。");
  let decks;
  if (/^\s*\{/.test(source) || /^\s*\[\s*(?:\{|\])/.test(source)) {
    try { const data = JSON.parse(source); decks = Array.isArray(data) ? data : data.decks || [data]; }
    catch { throw new Error("JSONを読めません。デッキのテキスト、またはmainboard・sideboardを持つJSONを使ってください。"); }
  } else decks = parseDeckText(source, "手元のデッキ");
  if (!Array.isArray(decks) || decks.length !== 1) throw new Error("ひとり回しでは1リストずつ貼り付けてください。");
  const raw = decks[0];
  const rows = input => {
    if (!Array.isArray(input) || input.length > 300) throw new Error("カード行を確認してください。");
    const result = new Map();
    for (const row of input) {
      const name = clean(row?.name), count = Number(row?.count ?? row?.quantity);
      if (!name || name.length > 180 || /[<>\r\n\x00-\x1f]/.test(name) || !Number.isInteger(count) || count < 1 || count > 250) throw new Error("カード名と枚数を確認してください。");
      if (/[\u3040-\u30ff\u3400-\u9fff]/.test(name)) throw new Error("英語カード名のリストを貼り付けてください。");
      const key = name.toLowerCase(), old = result.get(key);
      result.set(key, { name: old?.name || name, count: count + (old?.count || 0) });
    }
    return [...result.values()];
  };
  const mainboard = rows(raw?.mainboard), sideboard = rows(raw?.sideboard || []);
  const total = list => list.reduce((sum, card) => sum + card.count, 0);
  if (total(mainboard) < 60 || total(mainboard) > 250 || total(sideboard) > 15) throw new Error(`メイン60〜250枚・サイド15枚以下で入力してください（現在 ${total(mainboard)}＋${total(sideboard)}枚）。`);
  let url = "";
  if (raw.url) {
    try { const u = new URL(raw.url); if (u.protocol !== "https:" || u.username || u.password) throw new Error(); url = u.href; }
    catch { throw new Error("出典URLは認証情報を含まないhttpsのURLにしてください。"); }
  }
  return { title: clean(raw.title || "手元のデッキ").slice(0, 180), url, mainboard, sideboard };
}

export function parseDeckText(source, fileName) {
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

