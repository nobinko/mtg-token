import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, nextGoldfishTurn, restoreGoldfishGame } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana, planGoldfishCastPayment, planGoldfishPayment } from "../public/goldfish-mana.js";
import { activateGoldfishAction, goldfishActionReason } from "../public/goldfish-actions.js";
import { goldfishCardActions } from "../public/goldfish-action-definitions.js";
import { goldfishReference as ref, moveGoldfishRuleObject as move } from "../public/goldfish-objects.js";
import { makeGameToken, cardName } from "../public/goldfish-events.js";
import { TOKENS } from "../public/goldfish-card-programs.js";
import { flushEngineEvents } from "../public/goldfish-engine.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { settle } from "./helpers/goldfish-pilot.js";
const metadata = JSON.parse(fs.readFileSync(new URL("./fixtures/goldfish-public-top30.json", import.meta.url))).metadata;
const get = (s, n, z = "battlefield") => s[z].find(c => cardName(c) === n);
function game(names) {
  const rows = names.map(name => ({ name, count: 1 }));
  rows.push({ name: "Swamp", count: 60 - rows.length });
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, metadata), { random: () => .5 }));
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const put = (s, n, z = "hand") => {
  if (z !== "battlefield") return moveGoldfishCards(s, get(s, n, "library").id, z);
  move(s, get(s, n, "library").id, "library", z);
  flushEngineEvents(s);
  return settle(s);
};
const reload = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));

test("Deadly Precision previews sacrifice payment, charges only B, and destroys the selected creature", () => {
  let s = put(put(game(["Deadly Precision", "Biotech Specialist"]), "Deadly Precision"), "Biotech Specialist", "battlefield");
  s = setGoldfishMana(s, "B", 1);
  const clue = makeGameToken(s, TOKENS.clue)[0], target = ref(get(s, "Biotech Specialist"));
  assert.equal(planGoldfishCastPayment(s, get(s, "Deadly Precision", "hand"), { preview: true }).payable, true);
  s = settle(castGoldfishCard(s, get(s, "Deadly Precision", "hand").id, { format: { cards: [ref(clue)] }, target }));
  assert.ok(!get(s, "Clue")); assert.ok(get(s, "Biotech Specialist", "graveyard")); assert.equal(s.manaPool.B, 0);
});

test("Deadly Precision can pay four extra mana and rejects impossible payment without sacrificing anything", () => {
  let s = put(game(["Deadly Precision"]), "Deadly Precision");
  const clue = makeGameToken(s, TOKENS.clue)[0];
  const before = JSON.stringify(s);
  assert.throws(() => castGoldfishCard(s, get(s, "Deadly Precision", "hand").id, { format: { cards: [ref(clue)] }, target: { player: "opponent", virtual: true } }), /マナ/);
  assert.ok(s.battlefield.some(c => c.id === clue.id)); assert.equal(JSON.stringify(s), before);
  s = setGoldfishMana(setGoldfishMana(s, "B", 1), "C", 4);
  assert.equal(planGoldfishCastPayment(s, get(s, "Deadly Precision", "hand"), { format: { cards: [] } }).payable, true);
  s = settle(castGoldfishCard(s, get(s, "Deadly Precision", "hand").id, { format: { cards: [] } }));
  assert.ok(get(s, "Deadly Precision", "graveyard")); assert.ok(get(s, "Clue")); assert.equal(s.manaPool.C, 0);
});

test("Null Summoner only triggers when cast and explicitly keeps an unmodeled opponent hand outside the simulation", () => {
  let s = put(game(["Null Summoner"]), "Null Summoner");
  s = setGoldfishMana(setGoldfishMana(setGoldfishMana(s, "U", 1), "B", 1), "C", 2);
  s = settle(castGoldfishCard(s, get(s, "Null Summoner", "hand").id));
  assert.ok(get(s, "Null Summoner"));
  assert.ok(s.rules.notices.some(n => n.text.includes("相手の手札") && n.text.includes("省略")));
  const cheated = settle(put(game(["Null Summoner"]), "Null Summoner", "battlefield"));
  assert.ok(!cheated.rules.notices?.some(n => n.text.includes("追放する実物")));
});

test("Ral Guest's loyalty abilities surveil and reanimate, use loyalty only once per turn, and survive save/restore", () => {
  let s = put(put(game(["Ral Zarek, Guest Lecturer", "Biotech Specialist"]), "Ral Zarek, Guest Lecturer", "battlefield"), "Biotech Specialist", "graveyard");
  const ral = get(s, "Ral Zarek, Guest Lecturer");
  s = settle(activateGoldfishAction(s, ral.id, "engine:fp-guest-surveil"), [], c => c.kind === "cards" && c.label.includes("諜報") ? { refs: [] } : null);
  assert.equal(get(s, ral.name).counters.loyalty, 4);
  const action = goldfishCardActions(get(s, ral.name)).find(a => a.id === "engine:fp-guest-return");
  assert.ok(goldfishActionReason(s, get(s, ral.name), action));
  s = settle(nextGoldfishTurn(reload(s)));
  s = settle(activateGoldfishAction(s, ral.id, action.id, { target: ref(get(s, "Biotech Specialist", "graveyard"), "graveyard") }));
  assert.ok(get(s, "Biotech Specialist")); assert.equal(get(s, ral.name).counters.loyalty, 2);
});

test("Ral Guest's five coin flips skip opponent turns without replaying random results or opponent upkeep", t => {
  let s = put(game(["Ral Zarek, Guest Lecturer"]), "Ral Zarek, Guest Lecturer", "battlefield");
  const ral = get(s, "Ral Zarek, Guest Lecturer"); ral.counters.loyalty = 7;
  const flips = [.1, .9, .2, .8, .3]; let i = 0;
  t.mock.method(Math, "random", () => flips[i++]);
  s = settle(activateGoldfishAction(s, ral.id, "engine:fp-guest-coins", { target: { player: "opponent" } }));
  assert.equal(i, 5); assert.equal(s.rules.skippedOpponentTurns, 3);
  s = reload(s); s.rules.opponentLibrary = 20;
  for (let turn = 0; turn < 3; turn++) s = settle(nextGoldfishTurn(s));
  assert.equal(s.rules.opponentLibrary, 20); assert.equal(s.rules.skippedOpponentTurns, 0); assert.equal(i, 5);
  s = settle(nextGoldfishTurn(s)); assert.equal(s.rules.opponentLibrary, 19);
});

test("Ral Guest can target both players for discard while enforcing one loyalty activation", () => {
  let s = put(put(game(["Ral Zarek, Guest Lecturer", "Deadly Precision"]), "Ral Zarek, Guest Lecturer", "battlefield"), "Deadly Precision");
  const id = get(s, "Ral Zarek, Guest Lecturer").id;
  s = settle(activateGoldfishAction(s, id, "engine:fp-guest-discard", { targets: [{ player: "self" }, { player: "opponent" }] }));
  assert.equal(s.hand.length, 0); assert.ok(get(s, "Deadly Precision", "graveyard"));
  assert.equal(get(s, "Ral Zarek, Guest Lecturer").counters.loyalty, 2);
  assert.ok(s.rules.notices.some(n => n.text.includes("相手は手札を1枚")));
});

test("Great Hall only spends colored mana on instants or sorceries, pays one life, and has no inactive cast trigger", () => {
  let s = put(put(game(["Great Hall of the Biblioplex", "Plunder the Trollshaws"]), "Great Hall of the Biblioplex", "battlefield"), "Plunder the Trollshaws");
  assert.equal(planGoldfishPayment(s, { manaCost: "{U}" }, { spell: { typeLine: "Creature", manaCost: "{U}" } }).payable, false);
  assert.equal(planGoldfishPayment(s, { manaCost: "{U}" }).payable, false, "colored mana cannot pay an ability");
  s = setGoldfishMana(s, "C", 1);
  s = settle(castGoldfishCard(s, get(s, "Plunder the Trollshaws", "hand").id, { confirmLife: true }));
  assert.equal(s.players.self.life, 19);
  assert.equal(get(s, "Great Hall of the Biblioplex").typeLine, "Land");
});

test("Great Hall becomes a lasting 2/4 Wizard, pumps only after animation, and loses animation on a zone change", () => {
  let s = put(put(game(["Great Hall of the Biblioplex", "Plunder the Trollshaws"]), "Great Hall of the Biblioplex", "battlefield"), "Plunder the Trollshaws");
  const id = get(s, "Great Hall of the Biblioplex").id;
  s = settle(activateGoldfishAction(setGoldfishMana(s, "C", 5), id, "engine:fp-great-hall"));
  assert.equal(goldfishCharacteristics(s, get(s, "Great Hall of the Biblioplex")).power, "2");
  assert.equal(goldfishCharacteristics(s, get(s, "Great Hall of the Biblioplex")).toughness, "4");
  s = setGoldfishMana(setGoldfishMana(s, "U", 1), "C", 1);
  s = settle(castGoldfishCard(s, get(s, "Plunder the Trollshaws", "hand").id));
  assert.equal(goldfishCharacteristics(s, get(s, "Great Hall of the Biblioplex")).power, "3");
  s = settle(nextGoldfishTurn(reload(s)));
  assert.equal(goldfishCharacteristics(s, get(s, "Great Hall of the Biblioplex")).power, "2");
  assert.match(get(s, "Great Hall of the Biblioplex").typeLine, /Creature/);
  move(s, id, "battlefield", "hand");
  assert.equal(get(s, "Great Hall of the Biblioplex", "hand").greatHallAnimated, undefined);
  assert.equal(get(s, "Great Hall of the Biblioplex", "hand").typeLine, "Land");
});
