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

test("extractLinks does not confuse premodern with modern MTGO decklists", () => {
  const html = `
    <a href="https://www.mtgo.com/decklist/premodern-league-2026-06-01">Premodern</a>
    <a href="https://www.mtgo.com/decklist/modern-league-2026-06-01">Modern</a>
  `;

  const links = extractLinks(html, "https://www.mtgo.com/decklists", "modern", ["https://www.mtgo.com/decklists"]);

  assert.deepEqual(links, ["https://www.mtgo.com/decklist/modern-league-2026-06-01"]);
});
