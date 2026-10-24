import assert from "node:assert/strict";
import test from "node:test";
import { candidateQueryVersion, finderCandidateQueries, fetchJapaneseName, japaneseObjectNameFromText } from "../lib/scryfall.js";
import { buildBulkObjects, expectsTokenCreation, objectsForSource, tokenHints, japaneseNameFromTypeLine } from "../lib/tokens.js";

// Minimal mechanic fixtures; live set dumps stay in the ignored .cache directory.
// Rules/names: https://magic.wizards.com/en/news/feature/reality-fracture-mechanics
// https://mtg-jp.com/reading/translated/0039723/
const noNetwork = { enrichJapaneseAssets: false, resolveMissingHelpers: false };
const stockOptions = { ...noNetwork, stockOnly: true, preferSourceSet: true, format: "modern", targetDate: "2026-10-24" };
const source = raw => ({ id: raw.id || raw.name, name: raw.name, set: "FRA", releasedAt: "2026-10-02", raw });
const empowerSources = [
  { name: "Fatehold Charm", oracle_text: "Draw a card. Empower Jace 2." },
  { name: "Jace, Reality Sculptor", oracle_text: "+1: Empower Jace X, where X is the number of Islands you control." },
  { name: "Sanctum Lurker", oracle_text: "When this creature enters, empower Jace 1." }
];
const makeToken = (id, name, type_line, extra) => ({
  id, oracle_id: `${id}-oracle`, name, type_line, lang: "en", games: ["paper"], digital: false,
  set: "tfra", set_name: "Reality Fracture Tokens", released_at: "2026-10-02", ...extra
});
const jace = makeToken("fra-test-jace", "Jace", "Token Planeswalker — Jace", {
  loyalty: "0", colors: ["U"], oracle_text: "−1: Surveil 1.\n−3: Draw a card."
});
const heartwood = makeToken("fra-test-heartwood", "Heartwood", "Token Artifact — Heartwood", {
  colors: ["R", "G"], oracle_text: "{T}: Add {R} or {G}."
});
const jaceEmblem = makeToken("fra-test-jace-emblem", "Jace, Unraveler of Secrets Emblem", "Emblem — Jace", {
  set: "tsoi", released_at: "2016-04-08"
});
const part = token => ({ id: token.id, name: token.name, type_line: token.type_line, component: "token", uri: `https://api.scryfall.com/cards/${token.id}` });
function mockPhysicalCards(t) {
  const cards = new Map([jace, heartwood, jaceEmblem].map(card => [card.id, card]));
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.scryfall.com");
    if (url.pathname === "/sets") return Response.json({ data: [
      { code: "fra", name: "Reality Fracture", set_type: "expansion", released_at: "2026-10-02", digital: false },
      { code: "tfra", set_type: "token", parent_set_code: "fra" },
      { code: "soi", name: "Shadows over Innistrad", set_type: "expansion", released_at: "2016-04-08", digital: false },
      { code: "tsoi", set_type: "token", parent_set_code: "soi" }
    ] });
    const card = cards.get(url.pathname.replace(/^\/cards\//, ""));
    assert.ok(card, `unexpected request: ${input}`);
    return Response.json(card);
  });
}

test("Empower Jace without reminder text reaches discovery, hints and missing-token warnings", async () => {
  assert.ok(candidateQueryVersion > 7, "old candidate caches must be invalidated");
  const queries = finderCandidateQueries("modern");
  assert.ok(queries.some(query => query.includes('o:"Empower Jace"')));
  assert.ok(queries.every(query => query.length <= 850));
  for (const raw of [...empowerSources, { name: "Keyword-only fixture", keywords: ["Empower Jace"] }]) {
    assert.equal(expectsTokenCreation(raw), true, raw.name);
    assert.ok(tokenHints(raw).includes("トークン生成"), raw.name);
    const warnings = [];
    assert.deepEqual(await objectsForSource(source(raw), { ...noNetwork, warnings }), []);
    assert.equal(warnings.length, 1, raw.name);
    assert.match(warnings[0], /生成するトークンの現物情報が未収録/);
  }
});

test("Empower Jace produces the physical planeswalker token and merges source decks", async t => {
  mockPhysicalCards(t);
  const warnings = [];
  const sources = empowerSources.map((raw, index) => ({
    ...source({ ...raw, all_parts: [part(jace)] }),
    deckUrls: index === 0 ? ["deck-a", "deck-b"] : ["deck-b"],
    tokenHints: tokenHints(raw)
  }));
  const objects = await buildBulkObjects(sources, { ...stockOptions, warnings });
  assert.equal(objects.length, 1);
  const item = objects[0];
  assert.equal(item.japaneseName, "ジェイス");
  assert.equal(item.kind, "Token");
  assert.equal(item.typeLine, "Token Planeswalker — Jace");
  assert.equal(item.loyalty, "0");
  assert.deepEqual(item.colors, ["U"]);
  assert.equal(item.power, "");
  assert.equal(item.virtual, undefined);
  assert.equal(item.auxiliaryId, undefined);
  assert.equal(item.set, "FRA");
  assert.equal(item.stockStatus, "available");
  assert.equal(item.printUnconfirmed, false);
  assert.equal(item.deckCount, 2);
  assert.equal(item.sourceCards.length, 3);
  assert.deepEqual(warnings, []);
});

test("Soul Tether needs both Heartwood and a prepared-state marker, without a generic spell-copy token", async t => {
  mockPhysicalCards(t);
  const raw = {
    name: "Woodwork Prodigy // Soul Tether", layout: "prepare",
    card_faces: [
      { name: "Woodwork Prodigy", oracle_text: "It becomes prepared. (While it's prepared, you may cast a copy of its spell.)" },
      { name: "Soul Tether", oracle_text: "Create a Heartwood token." }
    ], all_parts: [part(heartwood)]
  };
  const warnings = [];
  const objects = await objectsForSource(source(raw), { ...stockOptions, warnings });
  assert.equal(objects.length, 2);
  const physical = objects.find(item => item.kind === "Token");
  assert.equal(physical.japaneseName, "魂木");
  assert.equal(physical.typeLine, "Token Artifact — Heartwood");
  assert.deepEqual(physical.colors, ["R", "G"], "a colorless-looking frame does not change the token's colors");
  assert.equal(physical.set, "FRA");
  assert.equal(physical.stockStatus, "available");
  assert.ok(objects.some(item => item.auxiliaryId === "prepared"));
  assert.ok(tokenHints(raw).includes("準備呪文: Soul Tether"));
  assert.deepEqual(warnings, []);
});

test("Prepare with an instant or sorcery copy requires only the prepared-state marker", async () => {
  const raw = { name: "Pompous Battlemage // Improvised Act", layout: "prepare", card_faces: [
    { name: "Pompous Battlemage", oracle_text: "This creature enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)" },
    { name: "Improvised Act", oracle_text: "You may discard a card. If you do, draw a card." }
  ] };
  const objects = await objectsForSource(source(raw), noNetwork);
  assert.deepEqual(objects.map(item => item.auxiliaryId), ["prepared"]);
  assert.equal(expectsTokenCreation(raw), false);
});

test("Behold alone does not promise Treasure, while an actual Treasure creation still does", async () => {
  const behold = "As this land enters, you may behold a Jace. If you don't, this land enters tapped.";
  const raw = { name: "Behold-only fixture", oracle_text: behold, keywords: ["Behold"] };
  assert.deepEqual(tokenHints(raw), []);
  assert.deepEqual(await objectsForSource(source(raw), noNetwork), []);
  const sanctum = { ...raw, name: "Theorist's Sanctum", oracle_text: `${behold}\n{2}{U}, {T}: Empower Jace 2.` };
  assert.ok(tokenHints(sanctum).includes("トークン生成"));
  assert.ok(tokenHints(sanctum).every(hint => !/Treasure|宝物/.test(hint)));
  assert.ok(tokenHints({ ...raw, oracle_text: `${behold}\nCreate a Treasure token.` }).includes("Treasure"));
});

test("the initial bulk result distinguishes an existing Jace emblem from the FRA token without Japanese enrichment", async t => {
  mockPhysicalCards(t);
  const oldJace = { name: "Jace, Unraveler of Secrets", oracle_text: "You get an emblem.", all_parts: [{ ...part(jaceEmblem), component: "emblem" }] };
  const warnings = [];
  const objects = await buildBulkObjects([
    { ...source(oldJace), set: "SOI", releasedAt: "2016-04-08" },
    source({ ...empowerSources[0], all_parts: [part(jace)] })
  ], { ...stockOptions, warnings });
  assert.equal(objects.length, 2);
  const emblem = objects.find(item => item.kind === "Emblem");
  assert.equal(emblem.japaneseName, "紋章");
  assert.equal(emblem.category, "紋章");
  assert.equal(emblem.set, "SOI");
  assert.equal(emblem.stockStatus, "available");
  assert.equal(objects.find(item => item.kind === "Token").japaneseName, "ジェイス");
  assert.deepEqual(warnings, []);
});

test("FRA exact token names do not translate emblems or full planeswalker names through subtype lookup", () => {
  for (const name of ["Jace", "Jace, Unraveler of Secrets Emblem"]) {
    assert.equal(japaneseNameFromTypeLine({ name, typeLine: "Emblem — Jace", kind: "Emblem" }), "");
  }
  assert.equal(japaneseNameFromTypeLine({ name: "Jace, Reality Sculptor", typeLine: "Legendary Planeswalker — Jace" }), "");
  assert.equal(japaneseNameFromTypeLine({ name: "Jace, Reality Sculptor", typeLine: "Token Legendary Planeswalker — Jace", kind: "Token" }), "");
  assert.equal(japaneseObjectNameFromText("青のジェイス・プレインズウォーカー・トークンを生成する。", jace), "ジェイス");
  assert.equal(japaneseObjectNameFromText("魂木・トークンを生成する。", heartwood), "魂木");
});

test("Japanese name lookup keeps exact token names but resolves full card and emblem names independently", async t => {
  const printedNames = new Map([
    ["Jace, Unraveler of Secrets", "ジェイスのフルカード名（検証用）"],
    ["Heartwood Storyteller", "魂木とは異なるカード名（検証用）"]
  ]);
  const queries = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    assert.equal(url.pathname, "/cards/search");
    const query = url.searchParams.get("q");
    queries.push(query);
    const name = query.match(/^!"([^"]+)" lang:ja$/)?.[1];
    assert.ok(printedNames.has(name) || ["Jace, the Mind Sculptor", "Jace, Architect of Thought"].includes(name), query);
    if (name === "Jace, Architect of Thought") return new Response("Japanese lookup unavailable", { status: 404 });
    return Response.json({ data: printedNames.has(name) ? [{ name, lang: "ja", printed_name: printedNames.get(name) }] : [] });
  });
  assert.equal(await fetchJapaneseName("Jace"), "ジェイス");
  assert.equal(await fetchJapaneseName("Heartwood"), "魂木");
  assert.deepEqual(queries, []);
  for (const [name, printedName] of printedNames) assert.equal(await fetchJapaneseName(name), printedName);
  assert.equal(await fetchJapaneseName("Jace, Unraveler of Secrets Emblem"), `${printedNames.get("Jace, Unraveler of Secrets")}の紋章`);
  assert.equal(await fetchJapaneseName("Jace, the Mind Sculptor"), "", "unavailable Japanese metadata must not become the short token name");
  assert.equal(await fetchJapaneseName("Jace, Architect of Thought"), "", "a failed Japanese lookup must not become the short token name");
  const requestCount = queries.length;
  assert.equal(requestCount, 4);
  assert.equal(await fetchJapaneseName("Jace, Unraveler of Secrets"), printedNames.get("Jace, Unraveler of Secrets"));
  assert.equal(await fetchJapaneseName("Jace"), "ジェイス");
  assert.equal(queries.length, requestCount, "full names and exact token names retain separate cache entries");
});
