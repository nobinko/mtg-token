import assert from "node:assert/strict";
import test from "node:test";

import { buildBulkObjects, objectsForSource, tokenHints } from "../lib/tokens.js";
import { fetchAlternateTokenPrintsById, fetchJapaneseRelatedObjectName } from "../lib/scryfall.js";

test("Ocelot Pride retains the physical City's Blessing beside Cat and copy helpers", async (t) => {
  const blessing = {
    id: "11111111-1111-4111-8111-111111111111", oracle_id: "city-blessing-fixture",
    name: "City's Blessing", type_line: "Card", layout: "token", oracle_text: "",
    set: "tmh3", set_name: "Modern Horizons 3 Tokens", lang: "en", games: ["paper"],
    released_at: "2024-06-14", image_uris: { normal: "https://example.test/citys-blessing.jpg" }
  };
  const alternate = { ...blessing, id: "22222222-2222-4222-8222-222222222222", set: "trix", set_name: "Rivals of Ixalan Tokens", released_at: "2018-01-19" };
  const cat = {
    ...blessing, id: "cat-ascend-fixture", oracle_id: "cat-ascend-fixture", name: "Cat",
    type_line: "Token Creature — Cat", power: "1", toughness: "1", colors: ["W"]
  };
  const sets = [
    { code: "tmh3", set_type: "token", parent_set_code: "mh3" },
    { code: "mh3", set_type: "draft_innovation", name: "Modern Horizons 3" },
    { code: "trix", set_type: "token", parent_set_code: "rix" },
    { code: "rix", set_type: "expansion", name: "Rivals of Ixalan" }
  ];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.pathname === "/sets") return Response.json({ data: sets });
    for (const card of [blessing, cat]) {
      if (url.pathname === `/cards/${card.id}`) return Response.json(card);
    }
    if (url.pathname === "/cards/search" && url.searchParams.get("q")?.includes(`oracleid:${blessing.oracle_id}`)) {
      return Response.json({ data: [blessing, alternate] });
    }
    assert.fail(`Unexpected request, including ordinary combo pieces: ${url}`);
  });
  const raw = {
    name: "Ocelot Pride", keywords: ["First strike", "Lifelink", "Ascend"],
    oracle_text: "First strike, lifelink\nAscend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAt the beginning of your end step, if you gained life this turn, create a 1/1 white Cat creature token. Then if you have the city's blessing, for each token you control that entered this turn, create a token that's a copy of it.",
    all_parts: [
      { ...cat, component: "token", uri: `https://api.scryfall.com/cards/${cat.id}` },
      { ...blessing, component: "combo_piece", uri: `https://api.scryfall.com/cards/${blessing.id}` },
      { name: "Ocelot Pride", type_line: "Creature — Cat", component: "combo_piece", uri: "https://api.scryfall.com/cards/ordinary-combo-piece" }
    ]
  };
  const source = { id: "ocelot-ascend-fixture", name: raw.name, raw, set: "MH3", setName: "Modern Horizons 3", sources: [], deckUrls: ["https://example.test/deck"], deckCount: 1 };
  const warnings = [];
  const options = { format: "modern", stockOnly: true, preferSourceSet: true, targetDate: "2026-10-17", enrichJapaneseAssets: false, warnings };
  assert.ok(tokenHints(raw).some(hint => hint.includes("昇殿")));
  const objects = await objectsForSource(source, options);
  assert.deepEqual(objects.map(object => object.name).sort(), ["Cat", "City's Blessing", "Copy token / copy marker"]);
  const reminder = objects.find(object => object.name === "City's Blessing");
  assert.equal(reminder.kind, "Marker");
  assert.equal(reminder.japaneseName, "都市の承認");
  assert.equal(reminder.category, "都市の承認");
  assert.equal(reminder.virtual, undefined, "a physical reminder must not also create a virtual duplicate");
  assert.equal(reminder.set, "MH3");
  assert.equal(reminder.stockStatus, "available");
  assert.equal(reminder.image, blessing.image_uris.normal);
  assert.match(reminder.note, /10個未満になっても/);
  assert.deepEqual(warnings, []);
  assert.equal(await fetchJapaneseRelatedObjectName("Ocelot Pride", blessing), "都市の承認");

  const aggregated = await buildBulkObjects([source, { ...source, id: "second-source" }], options);
  const reminders = aggregated.filter(object => object.name === "City's Blessing");
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].deckCount, 1, "multiple ascend sources in one deck count once");
  const alternatives = await fetchAlternateTokenPrintsById(blessing.id, { format: "modern", today: "2026-10-17" });
  assert.deepEqual(alternatives.map(print => print.set), ["RIX"]);

  const missingTokenWarnings = [];
  await objectsForSource({ ...source, raw: {
    ...raw, oracle_text: "Ascend\nCreate a 1/1 white Cat creature token.",
    all_parts: raw.all_parts.filter(part => part.name === "City's Blessing")
  } }, { ...options, warnings: missingTokenWarnings });
  assert.equal(missingTokenWarnings.length, 1, "finding a reminder must not hide a missing creature token");
  assert.match(missingTokenWarnings[0], /生成するトークン/);
});

test("incomplete related data still leaves City's Blessing on the preparation list", async () => {
  const objects = await objectsForSource({
    id: "ascend-incomplete", name: "Ascend source", raw: {
      keywords: ["Ascend"], oracle_text: "Ascend",
      all_parts: [{ name: "City's Blessing", type_line: "Card", component: "combo_piece" }]
    }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });
  assert.equal(objects.length, 1);
  assert.equal(objects[0].name, "City's Blessing");
  assert.equal(objects[0].japaneseName, "都市の承認");
  assert.equal(objects[0].virtual, true);
  assert.equal(objects[0].set, "HELPERS");
});
