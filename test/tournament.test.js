import test from "node:test";
import assert from "node:assert/strict";
import { importTournament, meleeTournamentUrl, tournamentSummary, fetchMeleeTournament } from "../lib/tournament.js";

const url = "https://melee.gg/Tournament/View/411350";
const options = { url, format: "modern", targetDate: "2026-10-03", name: "大会" };
const deck = { player: "A", title: "Cat", mainboard: [{ name: "Ocelot Pride", count: 4 }, { name: "Island", count: 56 }], sideboard: [{ name: "Dispel", count: 15 }] };
const json = (decks, extra = {}) => importTournament({ ...options, ...extra, files: [{ name: "lists.json", content: JSON.stringify(decks) }] });

test("Melee URLs are canonicalized without accepting arbitrary network targets", () => {
  assert.equal(meleeTournamentUrl(`${url}/?round=1#Standings`), url);
  for (const invalid of ["http://melee.gg/Tournament/View/411350", "https://evil.test/Tournament/View/411350", "https://melee.gg.evil.test/Tournament/View/411350", "https://x@melee.gg/Tournament/View/411350", "https://melee.gg:444/Tournament/View/411350", "https://melee.gg/Decklist/View/411350", "https://melee.gg/Tournament/View/0"]) assert.equal(meleeTournamentUrl(invalid), "");
});

test("MTGO blank line separates sideboard and identical anonymous entrants are retained", () => {
  const imported = importTournament({ ...options, participants: 2, files: [{ name: "lists.txt", content: "4 Ocelot Pride\n56 Island\n\n15 Dispel\n===\n4 Ocelot Pride\n56 Island\n\n15 Dispel" }] });
  assert.equal(imported.deckCount, 2);
  assert.equal(imported.decks[0].sideboardCount, 15);
  assert.notEqual(imported.decks[0].url, imported.decks[1].url);
  assert.equal(imported.coverageComplete, true);
});

test("Arena set numbers, companion and multiple Player blocks preserve board counts", () => {
  const imported = importTournament({ ...options, files: [{ name: "arena.txt", content: "Player: A\nCompanion\n1 Jegantha, the Wellspring (IKO) 222\nDeck\n4 Ocelot Pride (MH3) 38\n56 Island (M21) 265\nSideboard\n1 Jegantha, the Wellspring (IKO) 222\nPlayer: B\nDeck\n60 Mountain\nSideboard\n15 Dispel" }] });
  assert.equal(imported.deckCount, 2);
  assert.deepEqual(imported.decks[0].mainboard[0], { name: "Ocelot Pride", count: 4 });
  assert.equal(imported.decks[0].sideboardCount, 1);
  assert.equal(imported.decks[1].player, "B");
});

test("CSV detects a first-column CardName and quoted commas, CRLF and doubled quotes", () => {
  const imported = importTournament({ ...options, files: [{ name: "lists.csv", content: 'CardName,Quantity,Player,Board,DeckName\r\n"Tamiyo, Inquisitive Student",4,"A, B",main,"Name ""quoted"""\r\nIsland,56,"A, B",main,"Name ""quoted"""\r\nDispel,15,"A, B",sideboard,"Name ""quoted"""' }] });
  assert.equal(imported.deckCount, 1);
  assert.equal(imported.decks[0].mainboard[0].name, "Tamiyo, Inquisitive Student");
  assert.equal(imported.decks[0].title, 'Name "quoted"');
});

test("only a real deck URL deduplicates lists, partial/unknown coverage remains explicit", () => {
  const deckUrl = "https://melee.gg/Decklist/View/d22d2e01-0b26-458a-b2df-b4d200b2bcfe";
  const imported = json([{ ...deck, url: deckUrl }, { ...deck, url: deckUrl }, { ...deck, player: "B" }, { ...deck, player: "C", mainboard: [{ name: "Island", count: 59 }] }], { participants: 537 });
  assert.equal(imported.deckCount, 2);
  assert.equal(imported.duplicateDeckCount, 1);
  assert.equal(imported.failures.length, 1);
  assert.equal(imported.missingCount, 535);
  assert.equal(imported.coverageComplete, false);
  const unknown = json([deck]);
  assert.equal(unknown.registeredCount, null);
  assert.equal(unknown.missingCount, null);
  assert.equal(unknown.coverageComplete, false);
  assert.equal("decks" in tournamentSummary(imported), false);
});

test("malformed lists and untranslated names cannot silently become zero-token results", () => {
  for (const content of ["Deck\n4 Island\nHTML garbage", "[]", '{"decks":"bad"}', "CardName,Quantity,Player\nIsland,no,A", "Player: A\n60 島", "Deck\n60 Island\nSideboard\n16 Dispel"]) assert.throws(() => importTournament({ ...options, files: [{ name: "bad.txt", content }] }));
  assert.throws(() => json([deck, deck], { participants: 1 }), /参加人数/);
  assert.throws(() => importTournament({ ...options, files: [{ content: "x".repeat(3 * 1024 * 1024 + 1) }] }), /3MB/);
});

test("URL acquisition explains access denial and never presents a standings page as all entrants", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
    await assert.rejects(fetchMeleeTournament(url), /自動取得できません.*403/);
  } finally { globalThis.fetch = original; }
});
