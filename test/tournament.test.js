import test from "node:test";
import assert from "node:assert/strict";
import { importTournament, restoreTournament, meleeTournamentUrl, tournamentSummary, fetchMeleeTournament } from "../lib/tournament.js";

const url = "https://melee.gg/Tournament/View/411350";
const options = { url, format: "modern", targetDate: "2026-10-03", name: "大会" };
const deck = { player: "A", title: "Cat", mainboard: [{ name: "Ocelot Pride", count: 4 }, { name: "Island", count: 56 }], sideboard: [{ name: "Dispel", count: 15 }] };
const json = (decks, extra = {}) => importTournament({ ...options, ...extra, files: [{ name: "lists.json", content: JSON.stringify(decks) }] });

test("submitted deck names survive imports and restoring an older misclassified snapshot", () => {
  // The Standard signature used by the old pipeline must not override a source label.
  const imported = json([{ ...deck, title: "Grixis Reanimator", mainboard: [
    { name: "Persist", count: 4 }, { name: "Psychic Frog", count: 4 },
    { name: "Stormchaser's Talent", count: 4 }, { name: "Slickshot Show-Off", count: 4 },
    { name: "Island", count: 44 }
  ] }]);
  assert.equal(imported.decks[0].archetype, "Grixis Reanimator");
  assert.equal(imported.decks[0].archetypeIdentity.matchedBy, "source-label");
  imported.decks[0].archetype = "イゼット果敢";
  assert.equal(restoreTournament(imported).decks[0].archetype, "Grixis Reanimator");
});

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

test("URL acquisition explains Melee access denial", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Forbidden", { status: 403 });
    await assert.rejects(fetchMeleeTournament(url), /取得を許可されません.*403/);
  } finally { globalThis.fetch = original; }
});

const officialDeck = (overrides = {}) => ({
  TournamentId: 411350, Game: "MagicTheGathering", FormatName: "Modern",
  Guid: "00000000-0000-0000-0000-000000000001", OwnerDisplayName: "Example Player", DecklistName: "Example Deck",
  Records: [{ n: "Ocelot Pride", q: 4, c: 0 }, { n: "Plains", q: 56, c: 0 }, { n: "Dispel", q: 14, c: 99 }, { n: "Kaheera, the Orphanguard", q: 1, c: 4 }],
  AdminGivenName: "Private staff name", DiscordUsername: "private-handle", OwnerUsername: "private-account", PlayerId: 123456,
  ...overrides
});

test("official Melee JSON includes the companion in the sideboard and discards account metadata", () => {
  const imported = json([officialDeck()], { participants: 1 });
  assert.equal(imported.deckCount, 1);
  assert.equal(imported.coverageComplete, true);
  assert.equal(imported.decks[0].mainboardCount, 60);
  assert.equal(imported.decks[0].sideboardCount, 15);
  assert.deepEqual(imported.decks[0].sideboard.at(-1), { name: "Kaheera, the Orphanguard", count: 1 });
  assert.equal(imported.decks[0].originalUrl, "https://melee.gg/Decklist/View/00000000-0000-0000-0000-000000000001");
  assert.equal(imported.decks[0].player, "Example Player");
  for (const privateValue of ["Private staff name", "private-handle", "private-account", "123456", "AdminGivenName", "DiscordUsername", "OwnerUsername", "PlayerId"]) assert.equal(JSON.stringify(imported).includes(privateValue), false);
});

test("official exports from another tournament, format or game are rejected before import", () => {
  for (const mismatch of [{ TournamentId: 999 }, { FormatName: "Legacy" }, { Game: "StarWarsUnlimited" }]) {
    assert.throws(() => json([officialDeck(), officialDeck(mismatch)]), /一致しません/);
  }
});

test("official exports deduplicate real deck IDs and report malformed or unknown board records", () => {
  const imported = json([officialDeck(), officialDeck(), officialDeck({ Guid: "bad" }), officialDeck({ Records: [{ n: "Plains", q: 60, c: 7 }] })], { participants: 3 });
  assert.equal(imported.deckCount, 1);
  assert.equal(imported.duplicateDeckCount, 1);
  assert.equal(imported.failures.length, 2);
  assert.match(imported.failures[0].message, /識別子/);
  assert.match(imported.failures[1].message, /未対応のカード区分/);
  assert.equal(imported.missingCount, 2);
  assert.equal(imported.coverageComplete, false);
});

test("browser snapshots revalidate cards and coverage instead of trusting supplied totals", () => {
  const snapshot = json([deck], { participants: 8, locationScope: "jp", eventScale: "grassroots", location: "東京都・テスト店舗" });
  const restored = restoreTournament({ ...snapshot, deckCount: 8, coverageComplete: true, missingCount: 0 });
  assert.equal(restored.deckCount, 1);
  assert.equal(restored.missingCount, 7);
  assert.equal(restored.coverageComplete, false);
  assert.equal(restored.locationScope, "jp");
  assert.equal(restored.eventScale, "grassroots");
  assert.equal(restored.fetchedAt, snapshot.fetchedAt);
  assert.throws(() => restoreTournament({ ...snapshot, targetDate: "2026-02-30" }), /不正/);
  assert.throws(() => restoreTournament({ ...snapshot, decks: [{ ...deck, mainboard: [{ name: "Island", count: 59 }] }] }), /完全リスト/);
  assert.equal(restoreTournament({ ...snapshot, failures: [{ name: "B", message: "不足" }], registeredCount: 1 }).coverageComplete, false);
});
