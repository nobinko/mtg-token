import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { withHostedRuntime } from "../lib/runtime.js";
import { readFile, writeFile, mkdir, rename, rm } from "../lib/storage.js";
import { createUpdateStore } from "../lib/updates.js";

function bucket() {
  const values = new Map();
  return {
    values,
    async put(key, value) { values.set(key, typeof value === "string" ? value : await new Response(value).text()); },
    async get(key) { const value = values.get(key); return value === undefined ? null : { text: async () => value, body: new Response(value).body }; },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key); },
    async list({ prefix }) { return { objects: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
  };
}

test("hosted caches survive request boundaries; cache deletion preserves environment data", async () => {
  const BUCKET = bucket();
  const run = callback => withHostedRuntime({ BUCKET }, {}, callback);
  const path = resolve(".cache/pages/test.json");
  await run(async () => { await mkdir(resolve(".cache/pages"), { recursive: true }); await writeFile(path, "persisted", "utf8"); });
  assert.equal(await run(() => readFile(path, "utf8")), "persisted");
  const environment = resolve(".cache/environment/active.json");
  await run(async () => { await writeFile(`${environment}.tmp`, "environment", "utf8"); await rename(`${environment}.tmp`, environment); });
  await run(() => rm(resolve(".cache/pages"), { recursive: true, force: true }));
  await assert.rejects(run(() => readFile(path, "utf8")), /Cache miss/);
  assert.equal(await run(() => readFile(environment, "utf8")), "environment");
  assert.equal(BUCKET.values.has("cache/environment/active.json.tmp"), false);
});

test("hosted environment starts from bundled data and restores a durable update in a fresh store", async () => {
  const BUCKET = bucket();
  await withHostedRuntime({ BUCKET }, {}, async () => {
    const store = createUpdateStore();
    const initial = await store.read();
    assert.ok(initial.pack.events.length);
    const next = { ...initial, format: "modern", setEvents: [], candidates: [], checkedAt: new Date().toISOString(), revision: "updated" };
    await writeFile(resolve(".cache/environment/active.json"), JSON.stringify(next), "utf8");
    assert.equal((await createUpdateStore().status()).revision, "updated");
  });
});
