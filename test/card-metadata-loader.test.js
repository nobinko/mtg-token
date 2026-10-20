import test from "node:test";
import assert from "node:assert/strict";
import { createCardMetadataLoader } from "../public/card-metadata-loader.js";

test("gallery and solo share an in-flight request, including DFC aliases", async () => {
  let release, requests = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const load = createCardMetadataLoader({ request: async () => {
    requests++;
    await gate;
    return Response.json({ cards: [{ name: "Front // Back", requestedName: "Front", typeLine: "Creature", faces: [{ name: "Front" }, { name: "Back" }] }] });
  }});
  const gallery = load(["Front"]), solo = load(["Front"]);
  assert.equal(requests, 1);
  release();
  assert.equal((await gallery)[0].name, "Front // Back");
  assert.equal((await solo)[0].typeLine, "Creature");
  assert.equal((await load(["Back"]))[0].requestedName, "Back");
  assert.equal(requests, 1);
});

test("a transient server response retries, a login error does not, failures can be retried", async () => {
  let requests = 0;
  const load = createCardMetadataLoader({ request: async () => ++requests === 1
    ? new Response("Gateway timeout", { status: 504 })
    : Response.json({ cards: [{ name: "Island", typeLine: "Land" }] }) });
  assert.equal((await load(["Island"]))[0].typeLine, "Land");
  assert.equal(requests, 2);
  let authorized = false, calls = 0;
  const authenticated = createCardMetadataLoader({ request: async () => {
    calls++;
    return authorized ? Response.json({ cards: [{ name: "Forest", typeLine: "Land" }] }) : Response.json({ error: "ログインしてください" }, { status: 401 });
  }});
  await assert.rejects(authenticated(["Forest"]), /ログイン/);
  assert.equal(calls, 1);
  authorized = true;
  assert.equal((await authenticated(["Forest"]))[0].typeLine, "Land");
});

test("a hung request is bounded and unavailable names are not cached", async () => {
  let calls = 0;
  const load = createCardMetadataLoader({ timeoutMs: 5, request: (_, options) => new Promise((resolve, reject) => {
    calls++;
    options.signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
  })});
  await assert.rejects(load(["Island"]), /Timed out/);
  assert.equal(calls, 2);
  let found = false;
  const retry = createCardMetadataLoader({ request: async () => Response.json({ cards: [found ? { name: "New Card", typeLine: "Creature" } : { name: "New Card", unavailable: true }] }) });
  assert.equal((await retry(["New Card"]))[0].unavailable, true);
  found = true;
  assert.equal((await retry(["New Card"]))[0].typeLine, "Creature");
});
