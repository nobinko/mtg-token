import assert from "node:assert/strict";
import test from "node:test";
import { buildBulkObjects } from "../lib/tokens.js";
import { objectKey, migrateCheckedObjects } from "../public/object-identity.js";

test("bulk aggregation and checklist keep same-name tokens with different size, colors and abilities separate", async (t) => {
  const tokens = [
    { id: "spirit-2", oracle_id: "spirit-colorless", colors: [], power: "2", toughness: "2", oracle_text: "" },
    { id: "spirit-white", oracle_id: "spirit-white", colors: ["W"], power: "1", toughness: "1", oracle_text: "Flying" },
    { id: "spirit-wb", oracle_id: "spirit-wb", colors: ["W", "B"], power: "1", toughness: "1", oracle_text: "Flying" }
  ].map((card) => ({ ...card, name: "Spirit", type_line: "Token Creature — Spirit", set: "tcmm", set_name: "Commander Masters Tokens", lang: "en", games: ["paper"], released_at: "2023-08-04" }));
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/sets") return Response.json({ data: [{ code: "tcmm", set_type: "token", parent_set_code: "cmm" }, { code: "cmm", set_type: "masters" }] });
    if (parsed.pathname === "/cards/search") return Response.json({ data: tokens.filter((card) => parsed.searchParams.get("q").includes(`oracleid:${card.oracle_id} `)) });
    return Response.json(tokens.find((card) => parsed.pathname.endsWith(`/${card.id}`)));
  });
  const source = (token, index) => ({
    id: `source-${index}`, name: `Source ${index}`, set: "CMM", setName: "Commander Masters", deckCount: 1,
    deckUrls: [`deck-${index}`], decks: [{ url: `deck-${index}` }], sources: [],
    raw: { all_parts: [{ ...token, component: "token", uri: `https://api.scryfall.com/cards/${token.id}` }] }
  });
  const objects = await buildBulkObjects([...tokens, tokens[0]].map(source), { enrichJapaneseAssets: false });
  assert.equal(objects.length, 3);
  assert.equal(new Set(objects.map(objectKey)).size, 3);
  const colorless = objects.find((object) => object.oracleId === "spirit-colorless");
  assert.equal(colorless.deckCount, 2);
  assert.equal(colorless.sourceCards.length, 2);
  assert.equal(colorless.power, "2");
  assert.equal(objects.find((object) => object.oracleId === "spirit-wb").deckCount, 1);
  assert.notEqual(objectKey(colorless), objectKey({ ...colorless, set: "OTHER" }));
  assert.equal(objectKey(colorless), objectKey({ ...colorless, printId: "another-print" }));
});

test("old checks never approve an unidentified physical variant; helpers and versioned checks survive", () => {
  const physical = { set: "CMM", name: "Spirit", typeLine: "Token Creature — Spirit", oracleId: "white" };
  const helper = { set: "CMM", name: "Copy token / copy marker", typeLine: "Marker helper", id: "source-a-marker" };
  const keys = ["CMM|Spirit|Token Creature — Spirit", "CMM|Copy token / copy marker|Marker helper", objectKey({ ...physical, oracleId: "colorless" }), "OTHER|Day/Night marker|Marker helper"];
  const migrated = migrateCheckedObjects(keys);
  assert.equal(migrated.resetCount, 1);
  assert.equal(migrated.checked.has(objectKey(physical)), false);
  assert.equal(migrated.checked.has(objectKey(helper)), true);
  assert.equal(migrated.checked.has(keys[2]), true);
  assert.equal(migrated.checked.has(objectKey({ set: "OTHER", name: "Day/Night marker", typeLine: "Marker helper" })), true);
  assert.equal(objectKey(helper), objectKey({ ...helper, id: "source-b-marker" }));
  assert.equal(migrateCheckedObjects(migrated.checked).resetCount, 0);
  assert.equal(migrateCheckedObjects(migrated.checked).changed, false);
});
