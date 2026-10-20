// Lossless storage of repeated card metadata and timeline snapshots. Runtime
// state remains ordinary JSON; packing never discards a game or an undo entry.
const FORMAT = "mtg-token-finder.goldfish.packed.v1";
export const GOLDFISH_SAVE_PREFIX = "mtg-token-finder.goldfish.v2.";
const LAST_SESSION_KEY = "mtg-token-finder.goldfish.last-session";

export function rememberGoldfishSession(storage, key, title) {
  // This small navigation hint is optional. A quota error must not turn a
  // successfully saved game into a reported failure or remove older games.
  try {
    if (key.startsWith(GOLDFISH_SAVE_PREFIX)) storage.setItem(LAST_SESSION_KEY, JSON.stringify({ key, title: String(title || "デッキ").slice(0, 240) }));
  } catch { /* The game itself has already been saved. */ }
}

export function lastGoldfishSession(storage) {
  try {
    const link = JSON.parse(storage.getItem(LAST_SESSION_KEY));
    if (typeof link?.key !== "string" || !link.key.startsWith(GOLDFISH_SAVE_PREFIX) || !storage.getItem(link.key)) return null;
    return { key: link.key, title: String(link.title || "デッキ").slice(0, 240) };
  } catch { return null; }
}

export function deckFromGoldfishSave(saved) {
  if (saved?.version !== 2 || !saved.state) throw new Error("保存したゲームを読み込めませんでした。");
  // The save key belongs to the originally registered list, even after sideboarding.
  const mainboard = saved.state.registeredDeck?.main || saved.state.deckRows;
  const sideboard = saved.state.registeredDeck?.side || saved.state.sideboardRows || [];
  const valid = rows => Array.isArray(rows) && rows.every(row => typeof row?.name === "string" && row.name.trim() && Number.isInteger(row.count) && row.count > 0);
  if (!valid(mainboard) || !mainboard.length || !valid(sideboard)) throw new Error("保存したデッキの情報が不正です。");
  return { mainboard, sideboard };
}

export function serializeGoldfishSave(payload) {
  const plain = JSON.stringify(payload), nodes = [], index = new Map();
  const intern = node => {
    const key = JSON.stringify(node);
    if (!index.has(key)) { index.set(key, nodes.length); nodes.push(node); }
    return { r: index.get(key) };
  };
  const encode = value => {
    if (typeof value === "string" && value.length > 40) return intern([2, value]);
    if (!value || typeof value !== "object") return value;
    return intern(Array.isArray(value) ? [0, ...value.map(encode)] : [1, ...Object.entries(value).map(([key, item]) => [key, encode(item)])]);
  };
  const root = encode(JSON.parse(plain));
  const packed = JSON.stringify({ format: FORMAT, root, nodes });
  return packed.length < plain.length ? packed : plain;
}

export function parseGoldfishSave(text) {
  const saved = JSON.parse(text || "null");
  if (saved?.format !== FORMAT) return saved; // Existing v2 saves remain valid.
  if (!Array.isArray(saved.nodes) || saved.nodes.length > 300000) throw new Error("保存データの構造が不正です。");
  const decoded = new Map(), visiting = new Set();
  const decode = (value, depth = 0) => {
    if (!value || typeof value !== "object") return value;
    const id = value.r;
    if (!Number.isInteger(id) || id < 0 || id >= saved.nodes.length || visiting.has(id) || depth > 150) throw new Error("保存データの参照が不正です。");
    // Packing shares serialized values only. Runtime arrays and objects must
    // remain independent, just like JSON.parse; otherwise equal empty event,
    // permission and trigger queues become the same mutable array.
    if (decoded.has(id)) return structuredClone(decoded.get(id));
    const node = saved.nodes[id];
    if (!Array.isArray(node) || ![0, 1, 2].includes(node[0])) throw new Error("保存データを復元できません。");
    visiting.add(id);
    let result;
    if (node[0] === 2) { if (typeof node[1] !== "string") throw new Error("保存文字列が不正です。"); result = node[1]; }
    else if (node[0] === 0) result = node.slice(1).map(v => decode(v, depth + 1));
    else result = Object.fromEntries(node.slice(1).map(entry => {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") throw new Error("保存項目が不正です。");
      return [entry[0], decode(entry[1], depth + 1)];
    }));
    visiting.delete(id); decoded.set(id, result); return result;
  };
  return decode(saved.root);
}

export function writeGoldfishSave(storage, key, payload) {
  const text = serializeGoldfishSave(payload);
  try { storage.setItem(key, text); return; }
  catch (error) {
    if (error.name !== "QuotaExceededError" && error.code !== 22) throw error;
    // Repack only this app's old game saves. Preserve their complete payload,
    // including all history, and leave unrelated or unreadable data untouched.
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    for (const otherKey of keys) {
      if (otherKey === key || !otherKey?.startsWith(GOLDFISH_SAVE_PREFIX)) continue;
      try {
        const raw = storage.getItem(otherKey), previous = JSON.parse(raw);
        if (previous?.version !== 2 || !previous.state) continue;
        const packed = serializeGoldfishSave(previous);
        if (packed.length < raw.length) storage.setItem(otherKey, packed);
      } catch { /* Never remove a save we cannot read or replace. */ }
    }
    storage.setItem(key, text);
  }
}

// IndexedDB has room for many decks and their complete undo histories. Existing
// localStorage games stay intact and are still read; no automatic pruning.
export function goldfishArchive(indexedDB) {
  let database;
  const open = () => database ||= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new Error("このブラウザーでは保存領域を開けません。")); return; }
    const request = indexedDB.open("mtg-token-finder.goldfish", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("games");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("別のタブを閉じて保存を再試行してください。"));
  });
  return {
    async read(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction("games").objectStore("games").get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    },
    async write(entries) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("games", "readwrite");
        for (const [key, value] of entries) transaction.objectStore("games").put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error("保存を完了できませんでした。"));
        transaction.onerror = () => reject(transaction.error);
      });
    }
  };
}

export function createGoldfishSaveRepository(storage, archive) {
  let pending = Promise.resolve();
  const load = async key => {
    await pending;
    const candidates = await Promise.allSettled([
      Promise.resolve().then(() => parseGoldfishSave(storage.getItem(key))),
      Promise.resolve().then(async () => parseGoldfishSave(await archive.read(key)))
    ]);
    const games = candidates.filter(r => r.status === "fulfilled" && r.value?.version === 2).map(r => r.value);
    return games.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))[0] || null;
  };
  return {
    load,
    save(key, payload, title) {
      // Capture now: queued writes must not observe subsequent game mutations.
      const text = serializeGoldfishSave(payload);
      const link = JSON.stringify({ key, title: String(title || "デッキ").slice(0, 240), savedAt: payload.savedAt });
      const write = async () => {
        try { await archive.write([[key, text], [LAST_SESSION_KEY, link]]); }
        catch {
          writeGoldfishSave(storage, key, parseGoldfishSave(text));
          // The game remains valid if only the optional shortcut cannot fit.
          try { storage.setItem(LAST_SESSION_KEY, link); } catch { /* optional */ }
        }
      };
      const result = pending.then(write);
      pending = result.catch(() => {});
      return result;
    },
    async last() {
      await pending;
      const candidates = await Promise.allSettled([
        Promise.resolve().then(() => JSON.parse(storage.getItem(LAST_SESSION_KEY))),
        Promise.resolve().then(async () => JSON.parse(await archive.read(LAST_SESSION_KEY)))
      ]);
      const links = candidates.filter(r => r.status === "fulfilled" && r.value?.key?.startsWith(GOLDFISH_SAVE_PREFIX)).map(r => r.value)
        .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
      for (const link of links) if (await load(link.key)) return { key: link.key, title: String(link.title || "デッキ").slice(0, 240) };
      return null;
    }
  };
}
