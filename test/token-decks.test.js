import assert from "node:assert/strict";
import test from "node:test";
import { findCardMentions } from "../lib/search.js";
import { buildBulkObjects } from "../lib/tokens.js";
import { decksForToken, sourcesForDeck, boardCount } from "../public/token-decks.js";

test("tokens open every adopting list beyond display caps, keeping individual decks on the same event page distinct", async () => {
  const pageUrl = "https://www.mtgo.com/decklist/modern-event-2026-10-01";
  const decks = Array.from({ length: 60 }, (_, i) => ({
    url: `${pageUrl}#mtgo-${i}`, pageUrl, title: `Player ${i}`,
    cards: [i < 40 ? "Front" : "Second Source", "Island"],
    mainboard: [{ name: i < 40 ? "Front" : "Second Source", count: 4 }, { name: "Island", count: 56 }],
    sideboard: [{ name: "Negate", count: 15 }]
  }));
  const unrelated = { ...decks[0], url: `${pageUrl}#mtgo-unrelated`, cards: ["Island"], text: "Front, Second Source" };
  const raw = { oracle_text: "Create a token that's a copy of target creature.", set: "tst", set_name: "Test" };
  const matched = findCardMentions([
    { ...raw, id: "source-a", name: "Front // Back", card_faces: [{ name: "Front" }, { name: "Back" }] },
    { ...raw, id: "source-b", name: "Second Source" }
  ], [{ deckEntries: [...decks, unrelated] }]);
  const [object] = await buildBulkObjects(matched, { enrichJapaneseAssets: false });
  assert.equal(object.decks.length, 36, "compact previews remain capped");
  assert.equal(object.deckCount, 60);
  const index = new Map([...decks, unrelated].map((deck) => [deck.url, deck]));
  const adopting = decksForToken(object, index);
  assert.equal(adopting.length, 60);
  assert.equal(adopting[59], decks[59], "the exact stored deck supplies card names and quantities");
  assert.equal(boardCount(adopting[59].mainboard), 60);
  assert.equal(boardCount(adopting[59].sideboard), 15);
  assert.deepEqual(sourcesForDeck(object, decks[39]).map((source) => source.name), ["Front // Back"]);
  assert.deepEqual(sourcesForDeck(object, decks[59]).map((source) => source.name), ["Second Source"]);
  assert.ok(!adopting.includes(unrelated), "sidebar prose cannot add an unrelated deck");
});

test("legacy previews resolve only exact deck URLs and new-set preparation has no adopting lists", () => {
  const deck = { url: "https://example.test/event#deck-1", mainboard: [{ name: "Island", count: 60 }] };
  const other = { ...deck, url: "https://example.test/event#deck-2" };
  const index = new Map([[deck.url, deck], [other.url, other]]);
  assert.deepEqual(decksForToken({ decks: [{ url: deck.url }, { url: deck.url }, { url: "missing" }] }, index), [deck]);
  assert.deepEqual(decksForToken({ preparationOnly: true, sourceCards: [] }, index), []);
});
