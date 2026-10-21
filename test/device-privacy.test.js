import test from "node:test";
import assert from "node:assert/strict";
import { clearDeviceData } from "../public/device-privacy.js";

test("explicit device cleanup deletes both save databases and only app-owned storage keys", async () => {
  const deleted = [];
  const data = new Map([["mtg-token-finder.goldfish.v2.fixture", "game"], ["mtg-token-finder.prepared.v1", "checks"], ["unrelated", "keep"]]);
  const storage = { get length() { return data.size; }, key: i => [...data.keys()][i], removeItem: key => data.delete(key) };
  const indexedDB = { deleteDatabase(name) { deleted.push(name); const request = {}; queueMicrotask(() => request.onsuccess()); return request; } };
  await clearDeviceData({ indexedDB, localStorage: storage, sessionStorage: null });
  assert.deepEqual(deleted, ["mtg-token-personal-tournaments", "mtg-token-finder.goldfish"]);
  assert.deepEqual([...data.entries()], [["unrelated", "keep"]]);
});

test("blocked deletion is reported rather than claiming that private saves were erased", async () => {
  const indexedDB = { deleteDatabase() { const request = {}; queueMicrotask(() => request.onblocked()); return request; } };
  await assert.rejects(clearDeviceData({ indexedDB, localStorage: null, sessionStorage: null }), /別のタブ/);
});
