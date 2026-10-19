import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, advanceGoldfishGame, chooseGoldfishRule, nextGoldfishTurn, restoreGoldfishGame } from "../public/goldfish.js";
import { activateGoldfishAction, chooseGoldfishAction } from "../public/goldfish-actions.js";
import { castGoldfishCard, setGoldfishMana, planGoldfishCastPayment, goldfishCastingCost } from "../public/goldfish-mana.js";
import { goldfishCharacteristics, goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishReference } from "../public/goldfish-objects.js";
import { goldfishSpellProgram } from "../public/goldfish-spells.js";

// Real public 60/15 lists from Melee tournament 411350, plus metadata obtained
// through the app on 2026-10-18. Test setup chooses cards; draws remain real.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/goldfish-real-decks.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));
function start(player) {
  const deck = fixture.decks.find((item) => item.player === player);
  assert.equal(deck.mainboard.reduce((sum, row) => sum + row.count, 0), 60);
  const rows = deck.mainboard.map((row) => ({ ...fixture.metadata.find((meta) => meta.name === row.name), ...row }));
  return keepGoldfishHand(createGoldfishGame(rows, { sideboardRows: deck.sideboard, random: () => .5 }));
}
function put(state, name, zone) {
  const item = [...state.library, ...state.hand].find((card) => card.name === name);
  assert.ok(item, name); return [moveGoldfishCards(state, [item.id], zone), item.id];
}
const snap = (state) => restoreGoldfishGame(JSON.parse(JSON.stringify(state)), { metadata: fixture.metadata });
const mana = (state, color, amount) => setGoldfishMana(state, color, amount);
const advance = (state) => advanceGoldfishGame(state);
const find = (state, id) => [...state.hand, ...state.battlefield, ...state.graveyard, ...state.exile].find((card) => card.id === id);

test("real Izzet list: plot, free cast, second-spell Monk, equip, combat characteristics and Islet draw", () => {
  let state = start("Kazuaki Kurokawa"), slick, cutter, bolt, islet;
  [state, slick] = put(state, "Slickshot Show-Off", "hand");
  [state, cutter] = put(state, "Cori-Steel Cutter", "battlefield");
  [state] = put(state, "Mountain", "battlefield"); [state] = put(state, "Mountain", "battlefield");
  state = activateGoldfishAction(state, slick, "plot");
  assert.equal(state.rules.spellsCast, 0);
  state = snap(nextGoldfishTurn(state));
  state = advance(castGoldfishCard(state, slick, { fromExile: true }));
  assert.equal(state.rules.spellsCast, 1);
  [state, bolt] = put(state, "Lightning Bolt", "hand");
  state = advance(castGoldfishCard(state, bolt, { target: { player: "opponent" } }));
  assert.equal(state.rules.pendingChoice.type, "attach");
  state = advance(chooseGoldfishRule(snap(state), { attach: true }));
  assert.equal(state.players.opponent.life, 17);
  assert.equal(goldfishCharacteristics(state, find(state, slick)).power, "3");
  assert.equal(state.battlefield.filter((card) => card.name === "Monk").length, 1);
  state = activateGoldfishAction(mana(state, "R", 2), cutter, "equip");
  state = advance(chooseGoldfishAction(state, { target: goldfishReference(find(state, slick)) }));
  assert.equal(goldfishCharacteristics(state, find(state, slick)).power, "4");
  assert.equal(goldfishKeywords(state, find(state, slick)).has("trample"), true);
  assert.equal(state.rules.spellsCast, 2);
  [state, islet] = put(state, "Fiery Islet", "battlefield");
  const hands = state.hand.length;
  state = advance(activateGoldfishAction(mana(state, "C", 1), islet, "land-draw"));
  assert.equal(state.hand.length, hands + 1);
  assert.equal(find(state, islet).incarnation > 1, true);
});

test("real Grixis list: Looting discard, Frog abilities, graveyard casting and cycling", () => {
  let state = start("mekabu2026"), frog, loot, rex, archon, gaze, unearth;
  [state, frog] = put(state, "Psychic Frog", "battlefield");
  [state, loot] = put(state, "Faithless Looting", "hand");
  [state, rex] = put(state, "Tyrranax Rex", "hand"); [state, archon] = put(state, "Archon of Cruelty", "hand");
  const hands = state.hand.length;
  state = advance(castGoldfishCard(mana(state, "R", 1), loot));
  assert.equal(state.hand.length, hands + 1); // Spell left the hand, then two draws.
  assert.equal(state.rules.pendingChoice.destination, "graveyard");
  state = advance(chooseGoldfishRule(snap(state), { ids: [rex, archon] }));
  assert.equal(state.hand.length, hands - 1);
  const returnCard = state.hand[0];
  state = activateGoldfishAction(state, frog, "frog-counter");
  state = advance(chooseGoldfishAction(state, { cards: [goldfishReference(returnCard, "hand")] }));
  assert.equal(goldfishCharacteristics(state, find(state, frog)).power, "2");
  const refs = [rex, archon, returnCard.id].map((id) => goldfishReference(find(state, id), "graveyard"));
  state = advance(activateGoldfishAction(state, frog, "frog-flying", { cards: refs }));
  assert.equal(goldfishKeywords(state, find(state, frog)).has("flying"), true);
  assert.equal(goldfishCastingCost(find(state, loot), { fromGraveyard: true }), "{2}{R}");
  assert.equal(planGoldfishCastPayment(mana(state, "R", 1), find(state, loot), { fromGraveyard: true }).payable, false);
  state = advance(castGoldfishCard(mana(state, "R", 3), loot, { fromGraveyard: true }));
  state = advance(chooseGoldfishRule(snap(state), { ids: state.hand.slice(0, 2).map((card) => card.id) }));
  assert.equal(state.exile.some((card) => card.id === loot), true);
  [state, gaze] = put(state, "Otherworldly Gaze", "graveyard");
  state = advance(castGoldfishCard(mana(state, "U", 2), gaze, { fromGraveyard: true }));
  assert.equal(state.rules.pendingChoice.cardIds.length, 3);
  const allocation = state.rules.pendingChoice.cardIds.map((id, index) => ({ id, destination: index === 0 ? "top" : "graveyard" }));
  state = advance(chooseGoldfishRule(snap(state), { allocation }));
  assert.equal(state.library.at(-1).id, allocation[0].id); assert.equal(state.exile.some((card) => card.id === gaze), true);
  [state, unearth] = put(state, "Unearth", "hand");
  const castCount = state.rules.spellsCast;
  state = advance(activateGoldfishAction(mana(state, "U", 2), unearth, "cycling"));
  assert.equal(state.rules.spellsCast, castCount);
  assert.equal(state.graveyard.some((card) => card.id === unearth), true);
});

test("real deck additional costs cannot silently pass as ordinary mana payment", () => {
  let state = start("mekabu2026"), id;
  [state, id] = put(state, "Abhorrent Oculus", "hand");
  state = mana(state, "U", 3);
  const before = JSON.stringify(state);
  assert.throws(() => castGoldfishCard(state, id), /追加コスト/);
  assert.equal(JSON.stringify(state), before);
});

test("new spell adapters check complete Oracle, not just names", () => {
  for (const name of ["Faithless Looting", "Otherworldly Gaze"]) {
    const card = fixture.metadata.find((item) => item.name === name);
    assert.ok(goldfishSpellProgram(card));
    assert.equal(goldfishSpellProgram({ ...card, oracleText: `${card.oracleText}\nYou lose 2 life.` }), null);
  }
});
