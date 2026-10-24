import assert from "node:assert/strict";
import test from "node:test";
import { candidateQueryVersion, finderCandidateQueries } from "../lib/scryfall.js";
import { buildBulkObjects, expectsTokenCreation, objectsForSource, tokenHints } from "../lib/tokens.js";

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
const part = token => ({ id: token.id, name: token.name, type_line: token.type_line, component: "token", uri: `https://api.scryfall.com/cards/${token.id}` });
function mockPhysicalCards(t) {
  const cards = new Map([jace, heartwood].map(card => [card.id, card]));
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.scryfall.com");
    if (url.pathname === "/sets") return Response.json({ data: [
      { code: "fra", name: "Reality Fracture", set_type: "expansion", released_at: "2026-10-02", digital: false },
      { code: "tfra", set_type: "token", parent_set_code: "fra" }
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
