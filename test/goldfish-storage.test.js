import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serializeGoldfishSave, parseGoldfishSave, writeGoldfishSave, GOLDFISH_SAVE_PREFIX } from "../public/goldfish-storage.js";
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
