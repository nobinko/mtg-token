import assert from "node:assert/strict";
import test from "node:test";

import { findCardMentions } from "../lib/search.js";

test("findCardMentions counts unique deck hits before page-text fallback", () => {
  const candidates = [
    {
      id: "card-1",
      name: "Slickshot Show-Off",
      type_line: "Creature - Bird Wizard",
      set: "sos",
      set_name: "Secrets of Strixhaven",
      released_at: "2026-04-24",
      rarity: "rare",
      image_uris: { normal: "https://example.test/slickshot.jpg" },
      oracle_text: "Flying, haste",
      scryfall_uri: "https://scryfall.com/card/test/slickshot-show-off"
    }
  ];
  const pages = [
    {
      text: "4 Slickshot Show-Off 4 Flow State",
      deckEntries: [
        {
          title: "Deck A",
          archetype: "イゼット果敢",
          url: "https://example.test/deck-a",
          pageTitle: "Event",
          pageUrl: "https://example.test/event",
          cards: ["Slickshot Show-Off", "Flow State"],
          text: "4 Slickshot Show-Off\n4 Flow State"
        },
        {
          title: "Deck A duplicate source text",
          archetype: "イゼット果敢",
          url: "https://example.test/deck-a",
          pageTitle: "Event",
          pageUrl: "https://example.test/event",
          cards: ["Slickshot Show-Off"],
          text: "4 Slickshot Show-Off"
        }
      ]
    }
  ];

  const results = findCardMentions(candidates, pages);

  assert.equal(results.length, 1);
  assert.equal(results[0].deckCount, 1);
  assert.equal(results[0].decks.length, 1);
  assert.equal(results[0].sources.length, 1);
});
