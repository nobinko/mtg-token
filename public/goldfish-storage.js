// Lossless storage of repeated card metadata and timeline snapshots. Runtime
// state remains ordinary JSON; packing never discards a game or an undo entry.
const FORMAT = "mtg-token-finder.goldfish.packed.v1";
export const GOLDFISH_SAVE_PREFIX = "mtg-token-finder.goldfish.v2.";

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
