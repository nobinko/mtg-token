import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serializeGoldfishSave, parseGoldfishSave, writeGoldfishSave, GOLDFISH_SAVE_PREFIX, rememberGoldfishSession, lastGoldfishSession, deckFromGoldfishSave, createGoldfishSaveRepository } from "../public/goldfish-storage.js";
import { createGoldfishGame, keepGoldfishHand, drawGoldfishCard, restoreGoldfishGame } from "../public/goldfish.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/goldfish-top10.json", import.meta.url), "utf8"));
function payload() {
  const deck = fixture.decks[3];
  let state = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(deck.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(deck.sideboard, fixture.metadata), random: () => .5 }));
  const timeline = [];
  for (let i = 0; i < 12; i++) { timeline.push({ state, message: `操作${i}`, selectedIds: [state.hand[0].id] }); state = drawGoldfishCard(state); }
  return { version: 2, signature: "fixture", state, timeline, timelineIndex: 11, selectedIds: [], savedAt: "2026-10-18T12:00:00Z" };
}

test("packing a real 60-card deck and its registered sideboard retains every snapshot and reduces storage below 30 percent", () => {
  const original = payload(), raw = JSON.stringify(original), packed = serializeGoldfishSave(original), restored = parseGoldfishSave(packed);
  assert.deepEqual(restored, JSON.parse(raw)); assert.ok(packed.length < raw.length * .3);
  assert.equal(restored.timeline.length, 12); assert.equal(restoreGoldfishGame(restored.state).library.length, original.state.library.length);
});

test("storage quota recovery losslessly repacks old games and leaves unrelated data unchanged", () => {
  const data = payload(), raw = JSON.stringify(data), entries = new Map([[GOLDFISH_SAVE_PREFIX + "old", raw], ["unrelated", "keep"]]);
  const limit = raw.length + 200;
  const storage = { get length() { return entries.size; }, key: n => [...entries.keys()][n], getItem: key => entries.get(key), setItem(key, value) {
    const size = [...entries].reduce((n, [k, v]) => n + (k === key ? 0 : v.length), 0) + value.length;
    if (size > limit) { const error = new Error("quota"); error.name = "QuotaExceededError"; throw error; }
    entries.set(key, value);
  } };
  writeGoldfishSave(storage, GOLDFISH_SAVE_PREFIX + "new", data);
  assert.deepEqual(parseGoldfishSave(entries.get(GOLDFISH_SAVE_PREFIX + "old")), JSON.parse(raw));
  assert.deepEqual(parseGoldfishSave(entries.get(GOLDFISH_SAVE_PREFIX + "new")), JSON.parse(raw));
  assert.equal(entries.get("unrelated"), "keep"); assert.equal(entries.size, 3);
});

test("plain v2 saves remain readable and corrupt packed references fail safely", () => {
  assert.deepEqual(parseGoldfishSave('{"version":2,"state":{"turn":3}}'), { version: 2, state: { turn: 3 } });
  assert.throws(() => parseGoldfishSave(JSON.stringify({ format: "mtg-token-finder.goldfish.packed.v1", root: { r: 0 }, nodes: [[0, { r: 0 }]] })), /参照/);
});

test("unpacking does not alias independent mutable queues or history snapshots", () => {
  const input = { events: [], entered: [], encampments: [], snapshots: Array.from({ length: 30 }, () => ({ hand: [], note: "Repeated card metadata ".repeat(20) })) };
  const packed = serializeGoldfishSave(input), saved = parseGoldfishSave(packed);
  assert.match(packed, /packed.v1/);
  saved.events.push({ id: 1 }); saved.snapshots[0].hand.push("card");
  assert.deepEqual(saved.entered, []); assert.deepEqual(saved.encampments, []);
  assert.deepEqual(saved.snapshots[1].hand, []);
  assert.equal(saved.snapshots[1].note, input.snapshots[1].note);
});

test("resuming a postboard game uses its original list while retaining the exchanged game and pending choice", () => {
  const game = payload(), registered = structuredClone(game.state.registeredDeck);
  game.state.deckRows = [{ name: "Island", count: 60 }];
  game.state.sideboardRows = [];
  game.state.pendingChoice = { kind: "legend", options: ["original", "copy"] };
  const entries = new Map(), storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const key = GOLDFISH_SAVE_PREFIX + game.signature;
  writeGoldfishSave(storage, key, game);
  rememberGoldfishSession(storage, key, "大会のデッキ");
  assert.deepEqual(lastGoldfishSession(storage), { key, title: "大会のデッキ" });
  const saved = parseGoldfishSave(storage.getItem(lastGoldfishSession(storage).key));
  assert.deepEqual(deckFromGoldfishSave(saved), { mainboard: registered.main, sideboard: registered.side });
  assert.deepEqual(saved.state.pendingChoice, game.state.pendingChoice);
  assert.deepEqual(saved.state.deckRows, game.state.deckRows);
  entries.delete(key);
  assert.equal(lastGoldfishSession(storage), null);
});

test("an unavailable or corrupt shortcut never replaces a saved game", () => {
  const entries = new Map(), storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const key = GOLDFISH_SAVE_PREFIX + "game", original = serializeGoldfishSave(payload());
  storage.setItem(key, original);
  rememberGoldfishSession(storage, "unrelated", "wrong");
  assert.equal(lastGoldfishSession(storage), null);
  rememberGoldfishSession({ setItem() { throw new Error("quota"); } }, key, "title");
  assert.equal(storage.getItem(key), original);
  assert.equal(lastGoldfishSession({ getItem: () => "{broken" }), null);
  assert.throws(() => deckFromGoldfishSave({ version: 2, state: { deckRows: [{ name: "Island", count: -1 }] } }), /不正/);
});

test("many archived games retain full history even when localStorage is full, including reload and latest shortcut", async () => {
  const entries = new Map(), archive = { read: async k => entries.get(k) ?? null, write: async rows => { for (const [k, v] of rows) entries.set(k, v); } };
  const storage = { getItem: () => null, setItem() { throw Object.assign(new Error("quota"), { name: "QuotaExceededError" }); }, length: 0 };
  const repository = createGoldfishSaveRepository(storage, archive), original = payload();
  for (let i = 0; i < 30; i++) await repository.save(GOLDFISH_SAVE_PREFIX + i, { ...original, signature: String(i) }, `deck ${i}`);
  const reload = createGoldfishSaveRepository(storage, archive);
  assert.equal((await reload.load(GOLDFISH_SAVE_PREFIX + 0)).timeline.length, 12);
  assert.equal((await reload.load(GOLDFISH_SAVE_PREFIX + 29)).timeline.length, 12);
  assert.equal((await reload.last()).title, "deck 29");
});

test("queued saves snapshot their input and legacy/archive reads choose the newer game", async () => {
  const entries = new Map(), local = new Map(), key = GOLDFISH_SAVE_PREFIX + "test";
  const storage = { getItem: k => local.get(k) ?? null, setItem: (k, v) => local.set(k, v) };
  const archive = { read: async k => entries.get(k) ?? null, write: async rows => { await Promise.resolve(); for (const [k, v] of rows) entries.set(k, v); } };
  const repository = createGoldfishSaveRepository(storage, archive);
  const game = payload(), first = repository.save(key, game, "original");
  game.state.turn = 15; game.savedAt = "2026-10-21T00:00:00Z";
  await first;
  assert.notEqual((await repository.load(key)).state.turn, 15);
  local.set(key, serializeGoldfishSave(game));
  assert.equal((await repository.load(key)).state.turn, 15);
  const second = repository.save(key, { ...game, savedAt: "2026-10-22T00:00:00Z" }, "latest");
  await second;
  assert.equal((await repository.last()).title, "latest");
  assert.ok(local.has(key), "legacy save is preserved");
});

test("archive failure falls back to localStorage but total write failure remains visible", async () => {
  const entries = new Map(), archive = { read: async () => { throw new Error("unavailable"); }, write: async () => { throw new Error("unavailable"); } };
  const storage = { get length() { return entries.size; }, key: i => [...entries.keys()][i], getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v) };
  const repository = createGoldfishSaveRepository(storage, archive), key = GOLDFISH_SAVE_PREFIX + "fallback";
  await repository.save(key, payload(), "fallback");
  assert.equal((await repository.load(key)).timeline.length, 12);
  assert.equal((await repository.last()).title, "fallback");
  storage.setItem = () => { throw Object.assign(new Error("quota"), { name: "QuotaExceededError" }); };
  await assert.rejects(repository.save(key, payload(), "failed"), /quota/);
  assert.equal((await repository.load(key)).timeline.length, 12);
});
