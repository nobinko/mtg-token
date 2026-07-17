import assert from "node:assert/strict";
import test from "node:test";

import { extractDeckCardNames, extractDeckEntries, extractLinks } from "../lib/deck.js";

test("extractDeckCardNames decodes escaped deck-list markup", () => {
  const text = "4 Slickshot Show-Off\\n2 Stormchaser's Talent\\n1 Island (SOS) 42";

  assert.deepEqual(extractDeckCardNames(text), [
    "Slickshot Show-Off",
    "Stormchaser's Talent",
    "Island"
  ]);
});

test("extractDeckEntries ignores deck-list tags for the wrong format", () => {
  const html = `
    <deck-list format="legacy" deck-title="Legacy Deck">
      <main-deck>4 Brainstorm</main-deck>
    </deck-list>
  `;

  assert.deepEqual(extractDeckEntries(html, "https://magic.gg/decklists/test", "Test", [], "", "standard"), []);
});

test("extractDeckEntries reads matching magic.gg deck-list cards", () => {
  const html = `
    <deck-list format="standard" deck-title="Izzet Prowess" subtitle="Player">
      <main-deck>
        4 Slickshot Show-Off
        4 Flow State
        4 Stormchaser's Talent
      </main-deck>
    </deck-list>
  `;

  const entries = extractDeckEntries(html, "https://magic.gg/decklists/standard-test", "Event", [], "2026-05-30", "standard");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].eventDate, "2026-05-30");
  assert.deepEqual(entries[0].cards, ["Slickshot Show-Off", "Flow State", "Stormchaser's Talent"]);
});

function mtgoDecklistHtml(data) {
  return `<script>window.MTGO.decklists.data = ${JSON.stringify(data)};</script>`;
}

test("extractDeckEntries labels MTGO decks Unknown instead of the event name", () => {
  const html = mtgoDecklistHtml({
    description: "Modern Challenge 64",
    starttime: "2026-07-13",
    format: "CMODERN",
    decklists: [{
      player: "SomePlayer",
      decktournamentid: 1,
      main_deck: [
        { card_attributes: { card_name: "Ragavan, Nimble Pilferer" } },
        { card_attributes: { card_name: "Steam Vents" } }
      ],
      sideboard_deck: []
    }]
  });

  const entries = extractDeckEntries(html, "https://www.mtgo.com/decklist/modern-challenge-64-2026-07-13", "Modern Challenge 64", [], "", "modern");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Modern Challenge 64 - SomePlayer");
  assert.equal(entries[0].archetype, "Unknown");
});

test("extractDeckEntries still classifies MTGO decks by card signatures", () => {
  const html = mtgoDecklistHtml({
    description: "Standard Challenge 32",
    starttime: "2026-07-13",
    format: "CSTANDARD",
    decklists: [{
      player: "SomePlayer",
      decktournamentid: 2,
      main_deck: [
        { card_attributes: { card_name: "Slickshot Show-Off" } },
        { card_attributes: { card_name: "Flow State" } },
        { card_attributes: { card_name: "Stormchaser's Talent" } }
      ],
      sideboard_deck: []
    }]
  });

  const entries = extractDeckEntries(html, "https://www.mtgo.com/decklist/standard-challenge-32-2026-07-13", "Standard Challenge 32", [], "", "standard");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].archetype, "イゼット果敢");
});

test("extractLinks does not confuse premodern with modern MTGO decklists", () => {
  const html = `
    <a href="https://www.mtgo.com/decklist/premodern-league-2026-06-01">Premodern</a>
    <a href="https://www.mtgo.com/decklist/modern-league-2026-06-01">Modern</a>
  `;

  const links = extractLinks(html, "https://www.mtgo.com/decklists", "modern", ["https://www.mtgo.com/decklists"]);

  assert.deepEqual(links, ["https://www.mtgo.com/decklist/modern-league-2026-06-01"]);
});
