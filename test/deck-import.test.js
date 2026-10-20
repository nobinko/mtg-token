import test from "node:test";
import assert from "node:assert/strict";
import { parseSoloDeck } from "../public/deck-import.js";

test("solo import reads Arena print suffixes, MTGO blank sideboard, and companion without duplicating it", () => {
  const arena = parseSoloDeck("Companion\n1 Jegantha, the Wellspring\nDeck\n4 Llanowar Elves (FDN) 227\n56 Forest\nSideboard\n1 Jegantha, the Wellspring\n14 Swamp");
  assert.deepEqual(arena.mainboard[0], { name: "Llanowar Elves", count: 4 });
  assert.equal(arena.sideboard.reduce((n, c) => n + c.count, 0), 15);
  assert.deepEqual(parseSoloDeck("60 Island\n\n4 Negate").sideboard, [{ name: "Negate", count: 4 }]);
  assert.deepEqual(parseSoloDeck("60 Island\nSB: 4 Negate").sideboard, [{ name: "Negate", count: 4 }]);
  assert.deepEqual(parseSoloDeck("[Main Deck]\n60 Island\n[Sideboard]\n4 Negate").sideboard, [{ name: "Negate", count: 4 }]);
  assert.equal(parseSoloDeck("[Mainboard]\n60 Island").mainboard[0].count, 60);
});

test("solo JSON keeps the actual list and source; duplicate rows merge", () => {
  const deck = parseSoloDeck(JSON.stringify({ title: "Dimir Tempo", url: "https://mtgtop8.com/event?e=1&d=2", mainboard: [{ name: "Island", count: 30 }, { name: "island", count: 30 }], sideboard: [] }));
  assert.deepEqual(deck.mainboard, [{ name: "Island", count: 60 }]);
  assert.equal(deck.title, "Dimir Tempo"); assert.equal(deck.url, "https://mtgtop8.com/event?e=1&d=2");
});

test("solo import rejects incomplete, multiple, malformed and oversized decks before opening a game", () => {
  for (const input of ["", "59 Island", "251 Island", "60 Island\nSideboard\n16 Swamp", "60 Island\nunexpected", "60 Island\n===\n60 Swamp", "60 島", "{bad json", JSON.stringify({mainboard:[{name:"<img>",count:60}]}), "x".repeat(50001)]) assert.throws(() => parseSoloDeck(input), undefined, input.slice(0, 80));
  for (const url of ["javascript:alert(1)", "https://user:secret@example.com"]) assert.throws(() => parseSoloDeck(JSON.stringify({url,mainboard:[{name:"Island",count:60}]})), /出典URL/);
});
