import assert from "node:assert/strict";
import test from "node:test";

import { findCardMentions } from "../lib/search.js";
import { extractDeckEntries } from "../lib/deck.js";

test("findCardMentions counts unique deck hits", () => {
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

test("MTGTop8 sidebar prose is not counted as a card in the extracted deck", () => {
  const url = "https://mtgtop8.com/event?e=90000&d=90001&f=MO";
  const html = '<h1>Fixture deck</h1><div>64 players - 20/09/26</div><div class="deck_line" id="md1">60 <span class="L14">Island</span></div><aside>Other deck feature: Ocelot Pride</aside>';
  const deckEntries = extractDeckEntries(html, url, "Fixture deck", [url], "", "modern");
  assert.deepEqual(deckEntries[0].cards, ["Island"]);
  assert.match(deckEntries[0].text, /Ocelot Pride/);
  const hits = findCardMentions([{ name: "Ocelot Pride" }, { name: "Island" }], [{ deckEntries }]);
  assert.deepEqual(hits.map((card) => card.name), ["Island"]);
  assert.equal(hits[0].deckCount, 1);
});

test("empty structured decks do not match prose; legacy text and DFC faces still match", () => {
  const card = { name: "Front // Back", card_faces: [{ name: "Front" }, { name: "Back" }] };
  const entries = [
    { cards: [], text: "Front", url: "empty", pageUrl: "empty" },
    { cards: ["Front"], text: "", url: "face", pageUrl: "face" },
    { text: "4 Front", url: "legacy", pageUrl: "legacy" }
  ];
  assert.deepEqual(findCardMentions([card], [{ deckEntries: entries }])[0].deckUrls, ["face", "legacy"]);
});
