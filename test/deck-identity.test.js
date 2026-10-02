import test from "node:test";
import assert from "node:assert/strict";
import { deckResultsFromPages, findCardMentions } from "../lib/search.js";
import { createDeckDeduplicator } from "../lib/deck-identity.js";

const base = { player: "Player_1", eventName: "Modern Challenge 64", eventDate: "2026-09-26", format: "modern", cards: ["Island", "Castle Ardenvale", "Dispel"],
  mainboard: [{ name: "Island", count: 56 }, { name: "Castle Ardenvale", count: 4 }], sideboard: [{ name: "Dispel", count: 15 }], url: "https://mtgo.test/1", pageUrl: "https://mtgo.test/event" };

test("same player, event, date and complete deck across sites count once with both sources", () => {
  const pages = [{ deckEntries: [{ ...base }, { ...base, url: "https://top8.test/2", pageUrl: "https://top8.test/event", eventName: "MTGO Modern Challenge 64", mainboard: [...base.mainboard].reverse() }] }];
  const decks = deckResultsFromPages(pages);
  assert.equal(decks.length, 1);
  assert.equal(decks[0].sourceDeckUrls.length, 2);
  const [hit] = findCardMentions([{ name: "Castle Ardenvale" }], pages);
  assert.equal(hit.deckCount, 1);
  assert.equal(hit.sources.length, 2);
});

test("stock lists by different players, distinct events and incomplete parses remain separate", () => {
  for (const delta of [{ player: "Other Player" }, { eventName: "Modern Challenge 32" }, { eventDate: "2026-09-27" }, { player: "" }, { mainboard: [{ name: "Island", count: 4 }] }]) {
    const unique = createDeckDeduplicator();
    unique.add({ ...base });
    unique.add({ ...base, ...delta, url: "https://other.test/2" });
    assert.equal(unique.decks.length, 2, JSON.stringify(delta));
  }
});

test("different sideboards remain distinct even when mainboards and player match", () => {
  const unique = createDeckDeduplicator();
  unique.add({ ...base });
  unique.add({ ...base, url: "https://other.test/2", sideboard: [{ name: "Negate", count: 15 }] });
  assert.equal(unique.decks.length, 2);
});

test("two same-named events published by one site are not merged", () => {
  const unique = createDeckDeduplicator();
  unique.add({ ...base });
  unique.add({ ...base, url: "https://mtgo.test/second-event" });
  assert.equal(unique.decks.length, 2);
});
