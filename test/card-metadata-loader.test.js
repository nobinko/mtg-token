import test from "node:test";
import assert from "node:assert/strict";
import { createCardMetadataLoader } from "../public/card-metadata-loader.js";
import { GOLDFISH_METADATA } from "../public/goldfish-metadata.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { verifiedGoldfishCard } from "../public/goldfish-card-programs.js";

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

test("known English cards start without external requests, retaining complete faces and Oracle verification", async () => {
  const load = createCardMetadataLoader({ bundledCards: GOLDFISH_METADATA, request: async () => { throw new Error("must not request"); } });
  const names = ["Great Hall of the Biblioplex", "Ral Zarek, Guest Lecturer", "Esper Origins", "Unholy Annex / Ritual Chamber", "Null Summoner"];
  const cards = await load(names);
  assert.ok(cards.every(c => c.metadataSource === "bundled" && !c.unavailable));
  assert.equal(cards[2].faces.length, 2); assert.ok(cards[2].faces[1].imageUrl);
  for (const c of mergeCardMetadata(names.map(name => ({ name, count: 1 })), cards)) assert.ok(verifiedGoldfishCard(c), c.name);
});

test("mixed lists fetch only unknown names; Japanese images and explicit refresh still use the live API", async () => {
  const calls = [];
  const load = createCardMetadataLoader({ bundledCards: [{ name: "Known", oracleText: "old", faces: [] }], request: async (_, options) => {
    const input = JSON.parse(options.body); calls.push(input);
    return Response.json({ cards: input.names.map(name => ({ name, oracleText: "new", language: input.language })) });
  }});
  const cards = await load(["Known", "New"]);
  assert.deepEqual(calls[0].names, ["New"]); assert.equal(cards[0].oracleText, "old");
  assert.equal((await load(["Known"], { refresh: true }))[0].oracleText, "new");
  assert.deepEqual(calls[1].names, ["Known"]);
  await load(["Known"], { language: "ja" }); assert.equal(calls[2].language, "ja");
  assert.equal((await load(["Known"]))[0].metadataSource, undefined);
});

test("a failed explicit refresh remains an error, while the reviewed snapshot is still usable afterward", async () => {
  const load = createCardMetadataLoader({ bundledCards: [{ name: "Known", oracleText: "reviewed" }], request: async () => new Response("timeout", { status: 504 }) });
  await assert.rejects(load(["Known"], { refresh: true }));
  assert.equal((await load(["Known"]))[0].oracleText, "reviewed");
});
