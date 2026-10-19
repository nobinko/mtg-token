import { nextGoldfishTurn, endGoldfishTurn } from "./helpers/goldfish-turns.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, restoreGoldfishGame, advanceGoldfishGame, resolveGoldfishSpell, removeGoldfishStackAbility, playGoldfishCard } from "../public/goldfish.js";
import { activateGoldfishAction, chooseGoldfishAction, goldfishActionTargets, goldfishActionPayment } from "../public/goldfish-actions.js";
import { goldfishCardActions, goldfishPlotReady, goldfishEquipmentBonus } from "../public/goldfish-action-definitions.js";
import { setGoldfishMana, castGoldfishCard } from "../public/goldfish-mana.js";
import { goldfishReference } from "../public/goldfish-objects.js";
import { goldfishCharacteristics, goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishAttackers } from "../public/goldfish-combat.js";

const oracle = JSON.parse(readFileSync(new URL("./fixtures/goldfish-oracle.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));
const rows = [...oracle,
  { name: "Cori-Steel Cutter", typeLine: "Artifact — Equipment", manaCost: "{1}{R}", oracleText: "Equipped creature gets +1/+1 and has trample and haste.\nFlurry — Whenever you cast your second spell each turn, create a 1/1 white Monk creature token with prowess. You may attach this Equipment to it.\nEquip {1}{R}" },
  { name: "Mountain", typeLine: "Basic Land — Mountain", oracleText: "{T}: Add {R}." },
  { name: "Island", typeLine: "Basic Land — Island", oracleText: "{T}: Add {U}." },
  { name: "Monastery Swiftspear", typeLine: "Creature — Human Monk", power: "1", toughness: "2", manaCost: "{R}", oracleText: "Haste\nProwess" },
  { name: "Dragon's Rage Channeler", typeLine: "Creature — Human Shaman", power: "1", toughness: "1", manaCost: "{R}", oracleText: "Whenever you cast a noncreature spell, surveil 1.\nDelirium — As long as there are four or more card types among cards in your graveyard, this creature gets +2/+2, has flying, and attacks each combat if able." },
].map((item) => ({ ...item, count: 4 }));
const start = () => keepGoldfishHand(createGoldfishGame(rows, { random: () => .5 }));
function put(state, name, zone = "battlefield") {
  const card = [...state.hand, ...state.library].find((item) => item.name === name);
  assert.ok(card, name);
  return [moveGoldfishCards(state, [card.id], zone), card.id];
}
const snap = (state) => restoreGoldfishGame(JSON.parse(JSON.stringify(state)), { metadata: rows });
const pay = (state) => setGoldfishMana(setGoldfishMana(state, "R", 1), "U", 1);
const card = (state, id) => [...state.hand, ...state.battlefield, ...state.exile, ...state.graveyard].find((item) => item.id === id);

test("plot pays its own cost, does not cast or trigger, survives save and casts once for free later", () => {
  let state = start(), id;
  [state, id] = put(state, "Slickshot Show-Off", "hand");
  [state] = put(state, "Mountain"); [state] = put(state, "Island"); [state] = put(state, "Cori-Steel Cutter");
  const before = JSON.stringify(state);
  let plotted = activateGoldfishAction(state, id, "plot");
  assert.equal(JSON.stringify(state), before);
  assert.equal(plotted.rules.spellsCast, 0); assert.equal(plotted.stack.length, 0);
  assert.equal(plotted.battlefield.filter((item) => item.tapped).length, 2);
  assert.equal(card(plotted, id).playPermission.kind, "plot");
  assert.throws(() => castGoldfishCard(plotted, id, { fromExile: true }), /後の自分/);
  plotted = snap(nextGoldfishTurn(plotted));
  assert.equal(goldfishPlotReady(plotted, card(plotted, id)), true);
  const played = castGoldfishCard(plotted, id, { fromExile: true });
  assert.equal(played.rules.spellsCast, 1); assert.equal(played.stack[0].id, id);
  assert.equal(played.battlefield.some((item) => item.tapped), false);
  assert.equal(played.stack[0].playPermission, undefined);
  assert.equal(advanceGoldfishGame(played).battlefield.some((item) => item.id === id), true);
});

test("plot and plotted casting enforce timing, X=0, and marker lifetime", () => {
  let state = start(), id;
  [state, id] = put(pay(state), "Slickshot Show-Off", "hand");
  for (const invalid of [{ ...state, rules: { ...state.rules, activePlayer: "opponent" } }, { ...state, rules: { ...state.rules, combat: { stage: "normal" } } }, { ...state, stack: [{ id: "pending", kind: "ability" }] }]) assert.throws(() => activateGoldfishAction(invalid, id, "plot"), /メイン/);
  let plotted = nextGoldfishTurn(activateGoldfishAction(state, id, "plot"));
  assert.throws(() => castGoldfishCard(endGoldfishTurn(plotted), id, { fromExile: true }), /後の自分/);
  assert.throws(() => castGoldfishCard(plotted, id, { fromExile: true, x: 2 }), /Xは0/);
  plotted = nextGoldfishTurn(plotted); // No expiry at the end of one turn.
  assert.equal(goldfishPlotReady(plotted, card(plotted, id)), true);
  plotted = moveGoldfishCards(moveGoldfishCards(plotted, [id], "hand"), [id], "exile");
  assert.equal(card(plotted, id).playPermission, undefined);
});

test("plot life payment is chosen once and cancellation is free", () => {
  let state = start(), id;
  [state, id] = put(state, "Slickshot Show-Off", "hand");
  [state] = put(state, "Fiery Islet"); [state] = put(state, "Island");
  const pending = activateGoldfishAction(state, id, "plot");
  assert.equal(pending.rules.pendingChoice.type, "action"); assert.equal(pending.players.self.life, 20);
  assert.equal(chooseGoldfishAction(pending, { cancel: true }).hand.some((item) => item.id === id), true);
  const done = chooseGoldfishAction(snap(pending), { confirmLife: true });
  assert.equal(done.players.self.life, 19); assert.equal(done.exile.length, 1);
  assert.throws(() => chooseGoldfishAction(done, { confirmLife: true }), /選択/);
});

function equipBoard() {
  let state = pay(start()), equipment, first, second;
  [state, equipment] = put(state, "Cori-Steel Cutter");
  [state, first] = put(state, "Monastery Swiftspear");
  [state, second] = put(state, "Dragon's Rage Channeler");
  return { state, equipment, first, second };
}
test("equip chooses a creature, pays without casting, then transfers stats and haste on resolution", () => {
  let { state, equipment, first, second } = equipBoard();
  const pending = activateGoldfishAction(state, equipment, "equip");
  assert.equal(pending.rules.pendingChoice.type, "action"); assert.equal(pending.manaPool.R, 1);
  state = chooseGoldfishAction(snap(pending), { target: goldfishReference(card(pending, first)) });
  assert.equal(state.rules.spellsCast, 0); assert.equal(state.manaPool.R, 0);
  assert.equal(card(state, equipment).attachedTo, null);
  state = resolveGoldfishSpell(state);
  assert.equal(goldfishCharacteristics(state, card(state, first)).power, "2");
  state = activateGoldfishAction(pay(state), equipment, "equip", { target: goldfishReference(card(state, second)) });
  assert.equal(card(state, equipment).attachedTo.id, first);
  state = advanceGoldfishGame(snap(state));
  assert.equal(goldfishCharacteristics(state, card(state, first)).power, "1");
  assert.equal(goldfishCharacteristics(state, card(state, second)).power, "2");
  assert.equal(goldfishKeywords(state, card(state, second)).has("haste"), true);
  assert.equal(goldfishAttackers(state).find((item) => item.card.id === second).reason, "");
});

test("equip does not refund on counter or retarget a departed and returned creature", () => {
  const { state, equipment, first } = equipBoard();
  const activated = activateGoldfishAction(state, equipment, "equip", { target: goldfishReference(card(state, first)) });
  const countered = removeGoldfishStackAbility(activated, activated.stack.at(-1).id);
  assert.equal(countered.manaPool.R, 0); assert.equal(card(countered, equipment).attachedTo, null);
  let moved = moveGoldfishCards(moveGoldfishCards(activated, [first], "hand"), [first], "battlefield");
  moved = advanceGoldfishGame(moved);
  assert.equal(card(moved, equipment).attachedTo, null);
  const noSource = advanceGoldfishGame(moveGoldfishCards(activated, [equipment], "graveyard"));
  assert.equal(noSource.stack.length, 0);
});

test("equip rejects noncreatures, shroud and sorcery timing before costs", () => {
  let { state, equipment, first } = equipBoard();
  card(state, first).oracleText = "Shroud";
  assert.equal(goldfishActionTargets(state, card(state, equipment)).some((item) => item.id === first), false);
  const before = JSON.stringify(state);
  assert.throws(() => activateGoldfishAction(state, equipment, "equip", { target: goldfishReference(card(state, first)) }), /不適正|適正/);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => activateGoldfishAction(endGoldfishTurn(state), equipment, "equip"), /メイン/);
  card(state, equipment).typeLine += " Creature";
  assert.equal(goldfishCardActions(card(state, equipment)).some((item) => item.id === "equip"), false);
});

test("ordinary equipment clauses support bonuses and keywords without guessing conditional text", () => {
  assert.deepEqual(goldfishEquipmentBonus({ typeLine: "Artifact — Equipment", oracleText: "Equipped creature gets +2/+0 and has first strike.\nEquip {2}" }), { power: 2, toughness: 0, keywords: ["first strike"] });
  assert.deepEqual(goldfishEquipmentBonus({ typeLine: "Artifact — Equipment", oracleText: "Equipped creature gets +1/+1 for each artifact you control." }), { power: 0, toughness: 0, keywords: [] });
  assert.equal(goldfishCardActions({ typeLine: "Artifact — Equipment", oracleText: "Equip legendary creature {1}" }).length, 0);
});

test("Fiery Islet cannot fund its own tap and sacrifice, and draws only on resolution", () => {
  let state = start(), id;
  [state, id] = put(state, "Fiery Islet");
  assert.throws(() => activateGoldfishAction(state, id, "land-draw"), /マナ/);
  [state] = put(state, "Mountain");
  const hand = state.hand.length, life = state.players.self.life;
  const action = goldfishCardActions(card(state, id)).find((item) => item.id === "land-draw");
  assert.equal(goldfishActionPayment(state, card(state, id), action).activations.some((item) => item.id === id), false);
  state = activateGoldfishAction(state, id, "land-draw");
  assert.equal(state.graveyard.some((item) => item.id === id), true);
  assert.equal(state.hand.length, hand); assert.equal(state.players.self.life, life); assert.equal(state.rules.spellsCast, 0);
  state = advanceGoldfishGame(snap(state));
  assert.equal(state.hand.length, hand + 1);
});

test("Frog discards at activation, uses its original object, and gives temporary flying", () => {
  let state = start(), id;
  [state, id] = put(state, "Psychic Frog");
  const discard = goldfishReference(state.hand[0], "hand");
  let pending = activateGoldfishAction(state, id, "frog-counter");
  state = chooseGoldfishAction(snap(pending), { cards: [discard] });
  assert.equal(state.graveyard.at(-1).id, discard.id); assert.equal(card(state, id).counters["+1/+1"], undefined);
  state = advanceGoldfishGame(state);
  assert.equal(goldfishCharacteristics(state, card(state, id)).power, "2");
  state = moveGoldfishCards(state, state.hand.slice(0, 2).map((item) => item.id), "graveyard");
  pending = activateGoldfishAction(state, id, "frog-flying");
  const refs = state.graveyard.slice(0, 3).map((item) => goldfishReference(item, "graveyard"));
  assert.throws(() => chooseGoldfishAction(pending, { cards: [refs[0], refs[0], refs[1]] }), /重複/);
  state = chooseGoldfishAction(snap(pending), { cards: refs });
  assert.equal(state.exile.length, 3); assert.equal(goldfishKeywords(state, card(state, id)).has("flying"), false);
  state = advanceGoldfishGame(state);
  assert.equal(goldfishKeywords(state, card(state, id)).has("flying"), true);
  state = endGoldfishTurn(state);
  assert.equal(goldfishKeywords(state, card(state, id)).has("flying"), false);
  assert.equal(card(state, id).counters["+1/+1"], 1);
});

test("Frog's counter does not follow a blink, cancellation preserves cards, pending choices lock play", () => {
  let state = start(), id;
  [state, id] = put(state, "Psychic Frog");
  const pending = activateGoldfishAction(state, id, "frog-counter");
  assert.throws(() => activateGoldfishAction(pending, id, "frog-counter"), /選択/);
  assert.equal(chooseGoldfishAction(pending, { cancel: true }).hand.length, state.hand.length);
  state = chooseGoldfishAction(pending, { cards: [goldfishReference(state.hand[0], "hand")] });
  state = moveGoldfishCards(moveGoldfishCards(state, [id], "hand"), [id], "battlefield");
  state = advanceGoldfishGame(state);
  assert.equal(card(state, id).counters["+1/+1"], undefined);
});

test("normal sorcery casting cannot bypass a pending activated ability", () => {
  let { state, equipment, first } = equipBoard(), spell;
  state = activateGoldfishAction(state, equipment, "equip", { target: goldfishReference(card(state, first)) });
  [state, spell] = put(state, "Slickshot Show-Off", "hand");
  assert.throws(() => playGoldfishCard(state, spell), /スタックに応答/);
});

test("cycling discards as a cost, draws on resolution, works on opponent turn and is not a cast", () => {
  let state = start(), id;
  [state, id] = put(state, "Unearth", "hand");
  state = pay(endGoldfishTurn(state));
  const count = state.hand.length;
  state = activateGoldfishAction(state, id, "cycling");
  assert.equal(state.hand.length, count - 1); assert.equal(state.graveyard.at(-1).id, id);
  assert.equal(state.rules.spellsCast, 0); assert.equal(state.manaPool.U, 0);
  state = advanceGoldfishGame(snap(state));
  assert.equal(state.hand.length, count);
});

test("exiling for Frog can remove delirium and lethal damage is checked before resolving flying", () => {
  let state = start(), frog, drc;
  [state, frog] = put(state, "Psychic Frog"); [state, drc] = put(state, "Dragon's Rage Channeler");
  for (const name of ["Mountain", "Cori-Steel Cutter", "Lightning Bolt", "Preordain"]) [state] = put(state, name, "graveyard");
  card(state, drc).damage = 1;
  assert.equal(goldfishCharacteristics(state, card(state, drc)).toughness, "3");
  const refs = state.graveyard.slice(0, 3).map((item) => goldfishReference(item, "graveyard"));
  state = activateGoldfishAction(state, frog, "frog-flying", { cards: refs });
  assert.equal(state.graveyard.some((item) => item.id === drc), true);
  assert.match(state.rules.lastAction, /Dragon's Rage Channelerは墓地へ/);
  assert.equal(state.stack.length, 1);
  assert.equal(goldfishKeywords(state, card(state, frog)).has("flying"), false);
});
