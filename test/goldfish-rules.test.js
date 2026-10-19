import { nextGoldfishTurn } from "./helpers/goldfish-turns.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, playGoldfishCard, resolveGoldfishSpell,
  chooseGoldfishRule, advanceGoldfishTriggers, cloneGoldfishState, restoreGoldfishGame, setGoldfishCastCount, removeGoldfishStackAbility, adjustGoldfishCounter, drawGoldfishCard,
  toggleGoldfishFaceDown, copyGoldfishCards, setGoldfishAutomaticAbilities } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana } from "../public/goldfish-mana.js";
import { goldfishCharacteristics, goldfishGraveyardTypes, goldfishRuleCoverage } from "../public/goldfish-rules.js";

const rows = [
  { name: "Monastery Swiftspear", typeLine: "Creature — Human Monk", power: "1", toughness: "2", manaCost: "{R}", oracleText: "Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)" },
  { name: "Dragon's Rage Channeler", typeLine: "Creature — Human Shaman", power: "1", toughness: "1", manaCost: "{R}", oracleText: "Whenever you cast a noncreature spell, surveil 1.\nDelirium — As long as there are four or more card types among cards in your graveyard, this creature gets +2/+2, has flying, and attacks each combat if able." },
  { name: "Cori-Steel Cutter", typeLine: "Artifact — Equipment", manaCost: "{1}{R}", oracleText: "Equipped creature gets +1/+1 and has trample and haste.\nFlurry — Whenever you cast your second spell each turn, create a 1/1 white Monk creature token with prowess. You may attach this Equipment to it. (Whenever you cast a noncreature spell, the token gets +1/+1 until end of turn.)\nEquip {1}{R}" },
  { name: "Slickshot Show-Off", typeLine: "Creature — Bird Wizard", power: "1", toughness: "2", oracleText: "Flying, haste\nWhenever you cast a noncreature spell, this creature gets +2/+0 until end of turn.\nPlot {1}{R}" },
  { name: "Consider", typeLine: "Instant", manaCost: "{U}", oracleText: "Surveil 1.\nDraw a card." },
  { name: "Memnite", typeLine: "Artifact Creature — Construct", manaCost: "{0}", power: "1", toughness: "1" },
  { name: "Island", typeLine: "Basic Land — Island", oracleText: "{T}: Add {U}." }
].map((row) => ({ ...row, count: 5 }));
const start = () => keepGoldfishHand(createGoldfishGame(rows, { random: () => .5 }));
function put(state, name, zone) {
  const card = [...state.library, ...state.hand].find((card) => card.name === name);
  assert.ok(card, name);
  return { state: moveGoldfishCards(state, [card.id], zone), id: card.id };
}
function cast(state, name = "Consider") {
  const prepared = put(state, name, "hand");
  return playGoldfishCard(prepared.state, prepared.id);
}
function order(state, ruleNames) {
  if (!state.rules.pendingChoice) return state;
  const ids = state.rules.pendingChoice.entryIds;
  const desired = ruleNames ? [...ids].sort((a, b) => ruleNames.indexOf(state.stack.find((e) => e.id === a).ability.rule) - ruleNames.indexOf(state.stack.find((e) => e.id === b).ability.rule)) : ids;
  return chooseGoldfishRule(state, { order: desired });
}

test("casting emits prowess once; lands, creatures and zone corrections do not", () => {
  let { state, id } = put(start(), "Monastery Swiftspear", "battlefield");
  state = cast(state, "Island");
  assert.equal(state.rules.spellsCast, 0);
  state = cast(state, "Memnite");
  assert.equal(state.rules.spellsCast, 1);
  assert.equal(state.stack.length, 1);
  state = resolveGoldfishSpell(state);
  state = cast(state);
  assert.equal(state.stack.length, 2);
  assert.equal(state.stack.at(-1).ability.label, "果敢 +1/+1");
  const next = resolveGoldfishSpell(state);
  assert.equal(goldfishCharacteristics(next, next.battlefield.find((c) => c.id === id)).power, "2");
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((c) => c.id === id)).power, "1");
  assert.equal(next.battlefield.find((c) => c.id === id).counters["+1/+1"], undefined);
  assert.equal(put(next, "Consider", "graveyard").state.rules.spellsCast, 2);
});

test("Channeler surveils before the spell; a required choice locks mutations and survives save", () => {
  let { state } = put(start(), "Dragon's Rage Channeler", "battlefield");
  state = cast(state);
  const top = state.library.at(-1).id;
  const library = state.library.map((card) => card.id);
  state = advanceGoldfishTriggers(state);
  assert.equal(state.rules.pendingChoice.type, "surveil");
  assert.equal(state.stack.length, 2);
  assert.throws(() => drawGoldfishCard(state), /選択/);
  assert.throws(() => moveGoldfishCards(state, [top], "hand"), /選択/);
  assert.throws(() => nextGoldfishTurn(state), /選択/);
  assert.throws(() => resolveGoldfishSpell(state), /選択/);
  const restored = restoreGoldfishGame(JSON.parse(JSON.stringify(state)), { metadata: rows });
  assert.equal(restored.stack.at(-1).kind, "ability");
  assert.equal(restored.stack.at(-1).oracleText, state.stack.at(-1).oracleText);
  assert.throws(() => chooseGoldfishRule(restored, { destination: "libraryBottom" }), /山札の上/);
  const kept = chooseGoldfishRule(restored, { destination: "top" });
  assert.deepEqual(kept.library.map((card) => card.id), library);
  const milled = chooseGoldfishRule(restored, { destination: "graveyard" });
  assert.equal(milled.graveyard.at(-1).id, top);
  assert.deepEqual(milled.library.map((card) => card.id), library.slice(0, -1));
  assert.equal(milled.stack.at(-1).name, "Consider");
  assert.equal(state.library.at(-1).id, top);
});

test("simultaneous triggers use a validated player-selected top-first order", () => {
  let state = put(start(), "Dragon's Rage Channeler", "battlefield").state;
  state = put(state, "Monastery Swiftspear", "battlefield").state;
  state = put(state, "Cori-Steel Cutter", "battlefield").state;
  state = setGoldfishCastCount(state, 1);
  state = cast(state);
  assert.equal(state.rules.pendingChoice.type, "order");
  const ids = state.rules.pendingChoice.entryIds;
  assert.equal(ids.length, 3);
  assert.throws(() => chooseGoldfishRule(state, { order: [ids[0], ids[0], ids[1]] }), /一度ずつ/);
  assert.throws(() => castGoldfishCard(state, state.hand[0].id, { manual: true }), /選択/);
  const next = order(state, ["boost", "surveil", "cutter"]);
  assert.equal(next.stack.at(-1).ability.rule, "boost");
  assert.equal(next.stack[0].name, "Consider");
  assert.equal(advanceGoldfishTriggers(next).rules.pendingChoice.type, "surveil");
});

test("Cutter triggers only on spell two, including creature spells, with optional attachment", () => {
  let { state, id } = put(start(), "Cori-Steel Cutter", "battlefield");
  state = resolveGoldfishSpell(cast(state, "Memnite"));
  state = cast(state, "Memnite");
  assert.equal(state.stack.at(-1).ability.rule, "cutter");
  state = advanceGoldfishTriggers(state);
  assert.equal(state.rules.pendingChoice.type, "attach");
  assert.equal(state.battlefield.filter((card) => card.name === "Monk").length, 1);
  const attached = chooseGoldfishRule(restoreGoldfishGame(JSON.parse(JSON.stringify(state))), { attach: true });
  const token = attached.battlefield.find((card) => card.name === "Monk");
  assert.equal(token.oracleText, "Prowess");
  assert.deepEqual(token.colors, ["W"]);
  assert.equal(goldfishCharacteristics(attached, token).power, "2");
  assert.match(goldfishCharacteristics(attached, token).notes.join(" "), /トランプル・速攻/);
  assert.equal(attached.battlefield.find((card) => card.id === id).attachedTo.id, token.id);
  const declined = chooseGoldfishRule(state, { attach: false });
  assert.equal(goldfishCharacteristics(declined, declined.battlefield.find((card) => card.name === "Monk")).power, "1");
  let third = resolveGoldfishSpell(attached);
  third = cast(third);
  assert.equal(third.rules.spellsCast, 3);
  assert.deepEqual(third.stack.filter((card) => card.kind === "ability").map((card) => card.ability.rule), ["boost"]);
  third = advanceGoldfishTriggers(third);
  assert.equal(goldfishCharacteristics(third, third.battlefield.find((card) => card.name === "Monk")).power, "3");
});

test("casting Cutter itself does not trigger it; it still counts as the first spell", () => {
  let state = resolveGoldfishSpell(cast(start(), "Cori-Steel Cutter"));
  assert.equal(state.rules.spellsCast, 1);
  state = cast(state);
  assert.equal(state.stack.filter((card) => card.kind === "ability").length, 1);
  assert.equal(state.stack.at(-1).ability.rule, "cutter");
  state = chooseGoldfishRule(advanceGoldfishTriggers(state), { attach: false });
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.name === "Monk")).power, "1", "new Monk does not get earlier cast's prowess");
});

test("countering the spell keeps its triggers; removed sources do not cancel surveil or token generation", () => {
  let prepared = put(start(), "Cori-Steel Cutter", "battlefield");
  let state = cast(setGoldfishCastCount(prepared.state, 1));
  const spell = state.stack.find((card) => card.kind !== "ability");
  state = moveGoldfishCards(state, [spell.id, prepared.id], "graveyard");
  state = advanceGoldfishTriggers(state);
  assert.equal(state.stack.length, 0);
  assert.equal(state.battlefield.filter((card) => card.name === "Monk").length, 1);
  assert.equal(state.rules.pendingChoice, null);
  prepared = put(start(), "Dragon's Rage Channeler", "battlefield");
  state = moveGoldfishCards(cast(prepared.state), [prepared.id], "graveyard");
  assert.equal(advanceGoldfishTriggers(state).rules.pendingChoice.type, "surveil");
});

test("an old prowess trigger cannot buff a source which leaves and returns", () => {
  let { state, id } = put(start(), "Monastery Swiftspear", "battlefield");
  state = cast(state);
  state = moveGoldfishCards(state, [id], "hand");
  state = moveGoldfishCards(state, [id], "battlefield");
  state = advanceGoldfishTriggers(state);
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.id === id)).power, "1");
});

test("next turn clears temporary boosts and cast count, preserving counters and equipment", () => {
  let { state, id } = put(start(), "Monastery Swiftspear", "battlefield");
  state = adjustGoldfishCounter(state, [id], "+1/+1", 2);
  state = resolveGoldfishSpell(advanceGoldfishTriggers(cast(state)));
  state = chooseGoldfishRule(state, { allocation: state.rules.pendingChoice.cardIds.map((id) => ({ id, destination: "top" })) });
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.id === id)).power, "4");
  const next = nextGoldfishTurn(state);
  assert.equal(goldfishCharacteristics(next, next.battlefield.find((card) => card.id === id)).power, "3");
  assert.equal(next.rules.spellsCast, 0);
  assert.equal(state.rules.spellsCast, 1);
});

test("real mana payment and exile casts produce exactly one event atomically", () => {
  let state = put(start(), "Monastery Swiftspear", "battlefield").state;
  const prepared = put(state, "Consider", "exile");
  state = setGoldfishMana(prepared.state, "U", 1);
  const next = castGoldfishCard(state, prepared.id, { fromExile: true });
  assert.equal(next.rules.spellsCast, 1);
  assert.equal(next.manaPool.U, 0);
  assert.equal(next.stack.length, 2);
  assert.equal(state.rules.spellsCast, 0);
  assert.equal(state.manaPool.U, 1);
  assert.equal(state.exile.some((card) => card.id === prepared.id), true);
});

test("old saves ask for an explicit cast count; nested choices/effects clone independently", () => {
  const old = start(); delete old.rules;
  const restored = restoreGoldfishGame(old);
  assert.equal(restored.rules.castCountKnown, false);
  assert.throws(() => cast(restored), /すでに唱えた回数/);
  assert.equal(cast(setGoldfishCastCount(restored, 1)).rules.spellsCast, 2);
  let state = put(start(), "Monastery Swiftspear", "battlefield").state;
  state = advanceGoldfishTriggers(cast(state));
  const clone = cloneGoldfishState(state);
  clone.battlefield[0].temporaryEffects[0].power = 99;
  assert.equal(state.battlefield[0].temporaryEffects[0].power, 1);
});

test("face-down and suppressed sources do not trigger; copied permanents do; ability removal is explicit", () => {
  const prepared = put(start(), "Monastery Swiftspear", "battlefield");
  assert.equal(cast(toggleGoldfishFaceDown(prepared.state, [prepared.id])).stack.length, 1);
  assert.equal(cast(setGoldfishAutomaticAbilities(prepared.state, prepared.id, false)).stack.length, 1);
  let state = cast(copyGoldfishCards(prepared.state, [prepared.id]));
  assert.equal(state.rules.pendingChoice.entryIds.length, 2);
  state = order(state);
  const id = state.stack.at(-1).id;
  assert.throws(() => moveGoldfishCards(state, [id], "graveyard"), /誘発はカード/);
  state = removeGoldfishStackAbility(state, id);
  assert.equal(state.stack.length, 2);
  assert.equal(state.rules.spellsCast, 1);
});

test("multiple Channelers resolve separate surveils, even after save/reload", () => {
  let state = put(start(), "Dragon's Rage Channeler", "battlefield").state;
  state = put(state, "Dragon's Rage Channeler", "battlefield").state;
  state = advanceGoldfishTriggers(order(cast(state)));
  const first = state.rules.pendingChoice.cardId;
  state = chooseGoldfishRule(state, { destination: "graveyard" });
  state = advanceGoldfishTriggers(restoreGoldfishGame(JSON.parse(JSON.stringify(state))));
  assert.notEqual(state.rules.pendingChoice.cardId, first);
  state = chooseGoldfishRule(state, { destination: "top" });
  assert.equal(state.graveyard.at(-1).id, first);
  assert.equal(state.stack.length, 1);
});

test("delirium uses card types, excluding token and subtype names; Slickshot is +2/+0", () => {
  let state = put(start(), "Dragon's Rage Channeler", "battlefield").state;
  const id = state.battlefield[0].id;
  for (const name of ["Consider", "Island", "Memnite"]) state = put(state, name, "graveyard").state;
  assert.deepEqual(new Set(goldfishGraveyardTypes(state)), new Set(["Instant", "Land", "Artifact", "Creature"]));
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.id === id)).power, "3");
  state = put(start(), "Slickshot Show-Off", "battlefield").state;
  state = advanceGoldfishTriggers(cast(state));
  assert.equal(goldfishCharacteristics(state, state.battlefield[0]).power, "3");
  assert.equal(goldfishCharacteristics(state, state.battlefield[0]).toughness, "2");
});

test("unimplemented cast abilities pause visibly and are never silently executed", () => {
  let { state, id } = put(start(), "Memnite", "battlefield");
  state.battlefield.find((card) => card.id === id).oracleText = "Whenever you cast a noncreature spell, draw two cards.";
  state = advanceGoldfishTriggers(cast(state));
  assert.equal(state.rules.pendingChoice.type, "manual");
  const count = state.hand.length;
  state = chooseGoldfishRule(state, { acknowledge: true });
  assert.equal(state.hand.length, count);
  assert.equal(state.stack.length, 1);
  const cutter = rows.find((row) => row.name === "Cori-Steel Cutter");
  assert.equal(goldfishRuleCoverage(cutter).automatic.some((item) => item.startsWith("果敢")), false, "Cutter itself has no prowess");
});

test("multiple Cutters each create one Monk; moving equipment to a new Monk removes the old bonus", () => {
  let state = put(start(), "Cori-Steel Cutter", "battlefield").state;
  state = put(state, "Cori-Steel Cutter", "battlefield").state;
  state = advanceGoldfishTriggers(order(cast(setGoldfishCastCount(state, 1), "Memnite")));
  assert.equal(state.rules.pendingChoice.type, "attach");
  state = advanceGoldfishTriggers(chooseGoldfishRule(state, { attach: true }));
  assert.equal(state.rules.pendingChoice.type, "attach");
  state = chooseGoldfishRule(state, { attach: true });
  const original = state.battlefield.filter((card) => card.name === "Monk").map((card) => card.id);
  assert.equal(original.length, 2);
  assert.ok(state.battlefield.filter((card) => original.includes(card.id)).every((card) => goldfishCharacteristics(state, card).power === "2"));
  state = nextGoldfishTurn(resolveGoldfishSpell(state));
  state = advanceGoldfishTriggers(order(cast(setGoldfishCastCount(state, 1), "Memnite")));
  state = advanceGoldfishTriggers(chooseGoldfishRule(state, { attach: true }));
  state = chooseGoldfishRule(state, { attach: true });
  assert.ok(state.battlefield.filter((card) => original.includes(card.id)).every((card) => goldfishCharacteristics(state, card).power === "1"));
  assert.equal(state.battlefield.filter((card) => card.name === "Monk").length, 4);
});

test("returned Cutter cannot attach via its old trigger, and bounced tokens cease to exist", () => {
  const prepared = put(start(), "Cori-Steel Cutter", "battlefield");
  let state = cast(setGoldfishCastCount(prepared.state, 1));
  state = moveGoldfishCards(state, [prepared.id], "hand");
  state = moveGoldfishCards(state, [prepared.id], "battlefield");
  state = advanceGoldfishTriggers(state);
  assert.equal(state.rules.pendingChoice, null);
  const monk = state.battlefield.find((card) => card.name === "Monk");
  const before = state.library.length;
  state = moveGoldfishCards(state, [monk.id], "libraryTop");
  assert.equal(state.library.length, before);
  assert.equal(state.battlefield.some((card) => card.id === monk.id), false);
});

test("split cards count both types for delirium, while double-faced cards count only the front", () => {
  const state = start();
  const template = state.library.pop();
  state.graveyard.push({ ...template, layout: "split", faces: [{ typeLine: "Instant" }, { typeLine: "Sorcery" }] });
  state.graveyard.push({ ...template, id: "dfc", layout: "modal_dfc", faces: [{ typeLine: "Creature — Human" }, { typeLine: "Land" }] });
  assert.deepEqual(new Set(goldfishGraveyardTypes(state)), new Set(["Instant", "Sorcery", "Creature"]));
});

test("two prowess instances each trigger, and an empty library completes surveil without a choice", () => {
  let state = put(start(), "Monastery Swiftspear", "battlefield").state;
  state.battlefield[0].oracleText = "Prowess, prowess";
  state = advanceGoldfishTriggers(order(cast(state)));
  assert.equal(goldfishCharacteristics(state, state.battlefield[0]).power, "3");
  state = put(start(), "Dragon's Rage Channeler", "battlefield").state;
  state = cast(state);
  state.graveyard.push(...state.library); state.library = [];
  state = advanceGoldfishTriggers(state);
  assert.equal(state.rules.pendingChoice, null);
  assert.equal(state.stack.at(-1).name, "Consider");
});
