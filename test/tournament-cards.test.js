import test from "node:test";
import assert from "node:assert/strict";
import { fetchTournamentCards, fetchCardMetadata } from "../lib/scryfall.js";

test("Melee full DFC names resolve through front-face identifiers without losing back-face aliases or missing-card warnings", async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const name = "Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar";
  const card = { name, oracle_text: "Create a Clue token.", card_faces: [{ name: "Tamiyo, Inquisitive Student", type_line: "Creature", image_uris: { normal: "https://example.test/front.png" } }, { name: "Tamiyo, Seasoned Scholar", type_line: "Planeswalker", image_uris: { normal: "https://example.test/back.png" } }] };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.scryfall.com/cards/collection");
    const names = JSON.parse(options.body).identifiers.map(row => row.name); calls.push(names);
    assert.equal(names.some(name => name.includes("//")), false);
    return new Response(JSON.stringify({ data: [card], not_found: names.includes("Definitely Missing") ? [{ name: "Definitely Missing" }] : [] }));
  };
  const result = await fetchTournamentCards([{ cards: [name, "Tamiyo, Inquisitive Student", "Definitely Missing"] }]);
  assert.deepEqual(calls[0], ["Tamiyo, Inquisitive Student", "Definitely Missing"]);
  assert.equal(result.cards[0].name, name); assert.equal(result.unresolvedCardCount, 1); assert.match(result.warnings[0], /Definitely Missing/);
  const metadata = await fetchCardMetadata([name]);
  assert.equal(metadata[0].unavailable, undefined); assert.equal(metadata[0].requestedName, name); assert.equal(metadata[0].faces.length, 2);
});
