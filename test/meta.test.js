import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseRepresentativeDeck,
  deckDistance,
  extractMtgTop8ArchetypeDeckLinks,
  extractMtgTop8MetaSnapshot,
  normalizeMtgTop8ArchetypeUrl,
  representativeAsOfDate
} from "../lib/meta.js";

test("representativeAsOfDate never searches beyond the available snapshot date", () => {
  assert.equal(representativeAsOfDate("2026-10-03", "2026-09-09"), "2026-09-09");
  assert.equal(representativeAsOfDate("2026-08-30", "2026-09-09"), "2026-08-30");
  assert.equal(representativeAsOfDate("not-a-date", "2026-09-09"), "");
});

test("extractMtgTop8MetaSnapshot ranks the current format breakdown and preserves tie order", () => {
  const html = `
    <div class=S14 align=center>120 decks</div>
    <div class=S14><a href=archetype?a=1&meta=54&f=MO>Alpha</a></div><div><div class=S14>8 %</div></div>
    <div class=S14><a href=archetype?a=2&meta=54&f=MO>Beta</a></div><div><div class=S14>12 %</div></div>
    <div class=S14><a href=archetype?a=3&meta=54&f=MO>Gamma</a></div><div><div class=S14>8 %</div></div>
  `;

  const snapshot = extractMtgTop8MetaSnapshot(html, "https://mtgtop8.com/format?f=MO", "2026-09-08T00:00:00.000Z");

  assert.equal(snapshot.totalDecks, 120);
  assert.equal(snapshot.windowLabel, "直近2週間");
  assert.deepEqual(snapshot.entries.map((entry) => [entry.rank, entry.name, entry.sharePercent]), [
    [1, "Beta", 12],
    [2, "Alpha", 8],
    [3, "Gamma", 8]
  ]);
});

test("MTGTop8 archetype URLs are locked to the expected host and format", () => {
  assert.equal(
    normalizeMtgTop8ArchetypeUrl("https://www.mtgtop8.com/archetype?a=351&meta=54&f=MO", "modern"),
    "https://mtgtop8.com/archetype?a=351&meta=54&f=MO"
  );
  assert.equal(normalizeMtgTop8ArchetypeUrl("http://mtgtop8.com/archetype?a=351&meta=54&f=MO", "modern"), "");
  assert.equal(normalizeMtgTop8ArchetypeUrl("https://example.com/archetype?a=351&meta=54&f=MO", "modern"), "");
  assert.equal(normalizeMtgTop8ArchetypeUrl("https://mtgtop8.com/archetype?a=351&meta=54&f=ST", "modern"), "");
});

test("extractMtgTop8ArchetypeDeckLinks reads deck URLs and row dates", () => {
  const html = `
    <table><tr>
      <td><a href=/event?e=90599&d=887785&f=MO>UR Cutter Prowess</a></td>
      <td><a class=player href=/search?player=Player>Player</a></td>
      <td><a href=/event?e=90599&f=MO>MTGO Challenge 64</a></td>
      <td class=O16>stars</td><td>5-8</td><td>07/09/26</td>
    </tr></table>
  `;

  assert.deepEqual(extractMtgTop8ArchetypeDeckLinks(html, "https://mtgtop8.com/archetype?a=351&meta=54&f=MO", "modern"), [{
    url: "https://mtgtop8.com/event?e=90599&d=887785&f=MO",
    name: "UR Cutter Prowess",
    eventDate: "2026-09-07",
    player: "Player",
    event: "MTGO Challenge 64",
    placement: "5-8"
  }]);
});

function deck(url, firstCount, secondCount, eventDate = "2026-09-08") {
  return {
    url,
    eventDate,
    mainboard: [{ name: "Island", count: firstCount }, { name: "Spell", count: secondCount }],
    sideboard: [{ name: "Side Card", count: 15 }]
  };
}

test("chooseRepresentativeDeck returns the complete real list nearest the group medoid", () => {
  const middle = deck("https://example.test/middle", 30, 30);
  const representative = chooseRepresentativeDeck([
    deck("https://example.test/left", 31, 29),
    middle,
    deck("https://example.test/right", 29, 31),
    { url: "https://example.test/incomplete", mainboard: [{ name: "Island", count: 20 }], sideboard: [] }
  ]);

  assert.equal(representative.deck, middle);
  assert.equal(representative.sampleSize, 3);
  assert.ok(representative.similarityPercent > 95);
  assert.equal(deckDistance(middle, middle), 0);
});
