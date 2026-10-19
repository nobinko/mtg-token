import { nextGoldfishTurn } from "./helpers/goldfish-turns.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, playGoldfishCard, resolveGoldfishSpell, advanceGoldfishGame,
  chooseGoldfishRule, cloneGoldfishState, restoreGoldfishGame, setGoldfishCastCount, setGoldfishLandCount } from "../public/goldfish.js";
import { goldfishSpellProgram, goldfishSpellTargets, applyGoldfishStateActions } from "../public/goldfish-spells.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { castGoldfishCard, chooseGoldfishCast, setGoldfishMana, planGoldfishPayment } from "../public/goldfish-mana.js";
import { goldfishReference } from "../public/goldfish-objects.js";
import { resolveGoldfishFetch } from "../public/goldfish-fetch.js";

// Oracle read from the application's Scryfall metadata endpoint, 2026-10-18.
const oracle = JSON.parse(readFileSync(new URL("./fixtures/goldfish-oracle.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));
const rows = [...oracle,
  { name: "Monastery Swiftspear", typeLine: "Creature — Human Monk", manaCost: "{R}", power: "1", toughness: "2", oracleText: "Haste\nProwess" },
  { name: "Dragon's Rage Channeler", typeLine: "Creature — Human Shaman", manaCost: "{R}", power: "1", toughness: "1", oracleText: "Whenever you cast a noncreature spell, surveil 1.\nDelirium — As long as there are four or more card types among cards in your graveyard, this creature gets +2/+2, has flying, and attacks each combat if able." },
  { name: "Cori-Steel Cutter", typeLine: "Artifact — Equipment", manaCost: "{1}{R}", oracleText: "Equipped creature gets +1/+1 and has trample and haste.\nFlurry — Whenever you cast your second spell each turn, create a 1/1 white Monk creature token with prowess. You may attach this Equipment to it.\nEquip {1}{R}" },
  { name: "Mountain", typeLine: "Basic Land — Mountain", oracleText: "{T}: Add {R}." },
  { name: "Island", typeLine: "Basic Land — Island", oracleText: "{T}: Add {U}." },
  { name: "Scalding Tarn", typeLine: "Land", oracleText: "{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Mountain card, put it onto the battlefield, then shuffle." },
  { name: "Big Creature", typeLine: "Creature — Beast", manaCost: "{4}{G}{G}", power: "6", toughness: "6", oracleText: "" },
  { name: "Legendary Creature", typeLine: "Legendary Creature", manaCost: "{1}{U}", power: "2", toughness: "2", oracleText: "" }
].map((card) => ({ ...card, count: 3 }));
const start = () => keepGoldfishHand(createGoldfishGame(rows, { random: () => .5 }));
function put(state, name, zone = "hand") {
  const card = [...state.library, ...state.hand].find((item) => item.name === name);
  assert.ok(card, `fixture ${name}`);
  return { state: moveGoldfishCards(state, [card.id], zone), id: card.id };
}
function cast(state, name, options = {}) {
  const prepared = put(state, name);
  return playGoldfishCard(prepared.state, prepared.id, options);
}
const snap = (state) => restoreGoldfishGame(JSON.parse(JSON.stringify(state)), { metadata: rows });
const allocate = (state, destinations) => chooseGoldfishRule(state, { allocation: state.rules.pendingChoice.cardIds.map((id, index) => ({ id, destination: destinations[index] })) });

test("verified spell adapters reject changed Oracle and cover the expected real cards", () => {
  const supported = oracle.filter((card) => goldfishSpellProgram(card));
  assert.equal(supported.length, 18);
  for (const card of supported) assert.equal(goldfishSpellProgram({ ...card, oracleText: card.oracleText + "\nYou lose 3 life." }), null, card.name);
  assert.equal(goldfishSpellProgram({ ...oracle[0], name: "Unverified imitation" }), null);
});

test("Preordain orders top and bottom, then draws once without shuffling the rest", () => {
  let state = resolveGoldfishSpell(cast(start(), "Preordain"));
  const before = JSON.stringify(state), original = state.library.map((card) => card.id), handCount = state.hand.length;
  const [first, second] = state.rules.pendingChoice.cardIds;
  state = allocate(state, ["bottom", "top"]);
  assert.equal(state.hand.length, handCount + 1);
  assert.equal(state.hand.at(-1).id, second);
  assert.equal(state.library[0].id, first);
  assert.deepEqual(state.library.slice(1).map((card) => card.id), original.slice(0, -2));
  assert.equal(state.graveyard.at(-1).name, "Preordain");
  assert.equal(state.stack.length, 0);
  assert.equal(state.rules.resolution, null);
  const pending = JSON.parse(before);
  assert.throws(() => chooseGoldfishRule(pending, { allocation: [{ id: first, destination: "top" }, { id: first, destination: "top" }] }), /一度ずつ/);
  assert.equal(JSON.stringify(pending), before);
});

test("Channeler surveil, then Consider surveil and draw are distinct persistent stages", () => {
  let state = put(start(), "Dragon's Rage Channeler", "battlefield").state;
  state = advanceGoldfishGame(cast(state, "Consider"));
  assert.equal(state.rules.pendingChoice.type, "surveil");
  const first = state.rules.pendingChoice.cardId;
  state = advanceGoldfishGame(chooseGoldfishRule(snap(state), { destination: "graveyard" }));
  assert.equal(state.rules.pendingChoice.type, "spell-arrange");
  const second = state.rules.pendingChoice.cardIds[0];
  assert.notEqual(second, first);
  state = allocate(snap(state), ["top"]);
  assert.equal(state.hand.at(-1).id, second);
  assert.ok(state.graveyard.some((card) => card.id === first));
  assert.equal(state.graveyard.at(-1).name, "Consider");
});

test("Serum Visions draws before scry; Opt scries before drawing", () => {
  let prepared = cast(start(), "Serum Visions");
  const first = prepared.library.at(-1).id;
  let state = resolveGoldfishSpell(prepared);
  assert.equal(state.hand.at(-1).id, first);
  assert.ok(!state.rules.pendingChoice.cardIds.includes(first));
  const chosen = [...state.rules.pendingChoice.cardIds];
  state = chooseGoldfishRule(state, { allocation: chosen.toReversed().map((id) => ({ id, destination: "top" })) });
  assert.equal(state.library.at(-1).id, chosen[1]);
  prepared = cast(start(), "Opt");
  const topTwo = prepared.library.slice(-2).map((card) => card.id);
  state = allocate(resolveGoldfishSpell(prepared), ["bottom"]);
  assert.equal(state.hand.at(-1).id, topTwo[0]);
  assert.equal(state.library[0].id, topTwo[1]);
});

test("Ponder ordering precedes a separate optional shuffle, then one draw", () => {
  let state = resolveGoldfishSpell(cast(start(), "Ponder"));
  const ids = state.rules.pendingChoice.cardIds;
  const hand = state.hand.length;
  state = chooseGoldfishRule(state, { allocation: ids.toReversed().map((id) => ({ id, destination: "top" })) });
  assert.equal(state.rules.pendingChoice.type, "spell-shuffle");
  assert.equal(state.hand.length, hand);
  const ordered = snap(state);
  state = chooseGoldfishRule(ordered, { shuffle: false });
  assert.equal(state.hand.at(-1).id, ids[2]);
  const shuffled = chooseGoldfishRule(ordered, { shuffle: true });
  assert.equal(shuffled.hand.length, hand + 1);
  assert.equal(shuffled.stack.length, 0);
  assert.equal(new Set([...shuffled.library, shuffled.hand.at(-1)].map((card) => card.id)).size, ordered.library.length);
});

test("Brainstorm draws three, returns any two hand cards top-first, and resumes without extra draws", () => {
  let initial = cast(start(), "Brainstorm");
  const oldHand = initial.hand[0].id, draws = initial.library.slice(-3).map((card) => card.id);
  let state = resolveGoldfishSpell(initial);
  assert.equal(state.hand.length, initial.hand.length + 3);
  assert.equal(state.rules.pendingChoice.type, "spell-return");
  const saved = snap(state);
  assert.throws(() => chooseGoldfishRule(saved, { ids: [oldHand, oldHand] }), /2枚/);
  state = chooseGoldfishRule(saved, { ids: [oldHand, draws[0]] });
  assert.deepEqual(state.library.slice(-2).map((card) => card.id), [draws[0], oldHand]);
  assert.equal(state.hand.length, initial.hand.length + 1);
  assert.equal(state.graveyard.at(-1).name, "Brainstorm");
});

test("Iteration allocates exactly one to each zone, tracks permission, and expires it next turn", () => {
  let state = resolveGoldfishSpell(cast(start(), "Expressive Iteration"));
  const ids = state.rules.pendingChoice.cardIds;
  assert.throws(() => allocate(state, ["hand", "hand", "exile"]), /手札1枚/);
  state = allocate(snap(state), ["hand", "bottom", "exile"]);
  assert.equal(state.hand.at(-1).id, ids[0]);
  assert.equal(state.library[0].id, ids[1]);
  assert.equal(state.exile.at(-1).id, ids[2]);
  assert.equal(state.exile.at(-1).playPermission.turn, state.turn);
  const next = nextGoldfishTurn(state);
  assert.throws(() => castGoldfishCard(next, ids[2], { fromExile: true, manual: true }), /期限/);
  assert.equal(state.rules.spellsCast, 1);
});

test("Iteration with fewer than three follows hand then bottom then exile priority", () => {
  for (const size of [0, 1, 2]) {
    let state = cast(start(), "Expressive Iteration");
    state.graveyard.push(...state.library.splice(0, state.library.length - size));
    const hand = state.hand.length;
    state = resolveGoldfishSpell(state);
    if (size) state = allocate(state, size === 1 ? ["hand"] : ["hand", "bottom"]);
    assert.equal(state.hand.length, hand + Number(size > 0));
    assert.equal(state.exile.length, 0);
    assert.equal(state.library.length, Math.max(0, size - 1));
    assert.equal(state.stack.length, 0);
  }
});

test("Manamorphose accepts exactly two colored mana, preserves pool, then draws", () => {
  let state = resolveGoldfishSpell(cast(setGoldfishMana(start(), "C", 2), "Manamorphose"));
  const count = state.hand.length;
  assert.throws(() => chooseGoldfishRule(state, { colors: ["C", "U"] }), /色/);
  state = chooseGoldfishRule(snap(state), { colors: ["U", "R"] });
  assert.equal(state.manaPool.U, 1); assert.equal(state.manaPool.R, 1); assert.equal(state.manaPool.C, 2);
  assert.equal(state.hand.length, count + 1); assert.equal(state.stack.length, 0);
});

test("targets precede payment and casting; cancel and invalid targets leave costs untouched", () => {
  let prepared = put(setGoldfishMana(start(), "R", 1), "Lightning Bolt");
  const initial = JSON.stringify(prepared.state);
  let state = castGoldfishCard(prepared.state, prepared.id);
  assert.equal(state.rules.pendingChoice.type, "cast-target");
  assert.equal(state.manaPool.R, 1); assert.equal(state.rules.spellsCast, 0); assert.equal(state.stack.length, 0);
  const cancelled = chooseGoldfishCast(snap(state), { cancel: true });
  assert.equal(cancelled.manaPool.R, 1); assert.equal(cancelled.rules.spellsCast, 0);
  assert.throws(() => chooseGoldfishCast(state, { target: { player: "unknown" } }), /対象/);
  state = advanceGoldfishGame(chooseGoldfishCast(state, { target: { player: "opponent" } }));
  assert.equal(state.players.opponent.life, 17); assert.equal(state.manaPool.R, 0); assert.equal(state.rules.spellsCast, 1);
  assert.equal(JSON.stringify(prepared.state), initial);
});

test("Growth adds a temporary +2/+2 alongside prowess, with explicit phyrexian life payment", () => {
  let prepared = put(start(), "Monastery Swiftspear", "battlefield");
  const sourceId = prepared.id;
  prepared = put(prepared.state, "Mutagenic Growth");
  assert.equal(planGoldfishPayment(prepared.state, prepared.state.hand.find((card) => card.id === prepared.id)).life, 2);
  let state = castGoldfishCard(prepared.state, prepared.id, { confirmLife: true, phyrexianLife: true });
  state = chooseGoldfishCast(snap(state), { target: goldfishReference(state.battlefield.find((card) => card.id === sourceId), "battlefield") });
  state = advanceGoldfishGame(state);
  assert.equal(state.players.self.life, 18);
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.id === sourceId)).power, "4");
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.id === sourceId)).toughness, "5");
  state = nextGoldfishTurn(state);
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.id === sourceId)).power, "1");
});

test("a target leaving and returning is a new object; the spell fizzles but its cast triggers remain", () => {
  let prepared = put(start(), "Monastery Swiftspear", "battlefield");
  const id = prepared.id;
  let state = cast(prepared.state, "Mutagenic Growth", { target: goldfishReference(prepared.state.battlefield[0], "battlefield") });
  state = moveGoldfishCards(state, [id], "hand"); state = moveGoldfishCards(state, [id], "battlefield");
  state = advanceGoldfishGame(state);
  assert.equal(state.stack.length, 0);
  assert.equal(goldfishCharacteristics(state, state.battlefield[0]).power, "1");
  assert.match(state.rules.lastAction, /不適正/);
  assert.equal(state.rules.spellsCast, 1);
});

test("Heat evaluates delirium on resolution and damage destroys lethal creatures", () => {
  let prepared = put(start(), "Big Creature", "battlefield");
  const id = prepared.id;
  let state = cast(prepared.state, "Unholy Heat", { target: goldfishReference(prepared.state.battlefield[0], "battlefield") });
  for (const name of ["Mountain", "Mishra's Bauble", "Preordain", "Consider"]) state = put(state, name, "graveyard").state;
  state = advanceGoldfishGame(state);
  assert.ok(state.graveyard.some((card) => card.id === id));
  prepared = put(start(), "Big Creature", "battlefield");
  state = advanceGoldfishGame(cast(prepared.state, "Lightning Bolt", { target: goldfishReference(prepared.state.battlefield[0], "battlefield") }));
  assert.equal(state.battlefield[0].damage, 3);
  assert.equal(nextGoldfishTurn(state).battlefield[0].damage, 0);
  state.battlefield[0].oracleText = "Indestructible";
  state.battlefield[0].damage = 20;
  applyGoldfishStateActions(state);
  assert.equal(state.battlefield.length, 1);
});

test("Unearth/Persist restrict graveyard targets; Reanimate loses life and preserves object identity", () => {
  let small = put(start(), "Monastery Swiftspear", "graveyard");
  let state = put(small.state, "Big Creature", "graveyard").state;
  state = put(state, "Legendary Creature", "graveyard").state;
  const unearth = rows.find((card) => card.name === "Unearth"), persist = rows.find((card) => card.name === "Persist");
  assert.deepEqual(goldfishSpellTargets(state, unearth).map((row) => row.label), ["Monastery Swiftspear", "Legendary Creature"]);
  assert.deepEqual(goldfishSpellTargets(state, persist).map((row) => row.label), ["Monastery Swiftspear", "Big Creature"]);
  const target = state.graveyard.find((card) => card.name === "Big Creature");
  state = advanceGoldfishGame(cast(state, "Reanimate", { target: goldfishReference(target, "graveyard") }));
  assert.equal(state.players.self.life, 14);
  assert.equal(state.battlefield.find((card) => card.id === target.id).incarnation, target.incarnation + 1);
  state = advanceGoldfishGame(cast(state, "Persist", { target: goldfishReference(state.graveyard.find((card) => card.id === small.id), "graveyard") }));
  assert.equal(state.battlefield.find((card) => card.id === small.id).counters["-1/-1"], 1);
});

test("flashback selects a target then sacrifices a Mountain atomically and exiles on resolve or counter", () => {
  let prepared = put(start(), "Mountain", "battlefield");
  const mountain = prepared.id;
  prepared = put(prepared.state, "Lava Dart", "graveyard");
  let state = castGoldfishCard(prepared.state, prepared.id, { fromGraveyard: true });
  assert.equal(state.rules.pendingChoice.type, "cast-target");
  state = chooseGoldfishCast(state, { target: { player: "opponent" } });
  assert.equal(state.rules.pendingChoice.type, "cast-sacrifice");
  assert.ok(state.battlefield.some((card) => card.id === mountain));
  state = chooseGoldfishCast(snap(state), { sacrifice: goldfishReference(state.battlefield.find((card) => card.id === mountain)) });
  assert.equal(state.rules.spellsCast, 1); assert.equal(state.stack.at(-1).cast.flashback, true);
  assert.ok(state.graveyard.some((card) => card.id === mountain));
  const countered = moveGoldfishCards(state, [prepared.id], "hand");
  assert.ok(countered.exile.some((card) => card.id === prepared.id));
  assert.ok(!countered.hand.some((card) => card.id === prepared.id));
  state = advanceGoldfishGame(state);
  assert.equal(state.players.opponent.life, 19); assert.ok(state.exile.some((card) => card.id === prepared.id));
});

test("automatic progress skips optional order prompts but full control preserves them", () => {
  let state = put(start(), "Monastery Swiftspear", "battlefield").state;
  state = put(state, "Dragon's Rage Channeler", "battlefield").state;
  state = put(state, "Cori-Steel Cutter", "battlefield").state;
  state = cast(setGoldfishCastCount(state, 1), "Preordain");
  assert.equal(advanceGoldfishGame(state, { autoOrder: false }).rules.pendingChoice.type, "order");
  state = advanceGoldfishGame(state);
  assert.equal(state.rules.pendingChoice.type, "surveil");
  state = advanceGoldfishGame(chooseGoldfishRule(state, { destination: "top" }));
  assert.equal(state.rules.pendingChoice.type, "attach");
  state = advanceGoldfishGame(chooseGoldfishRule(state, { attach: true }));
  assert.equal(state.rules.pendingChoice.type, "spell-arrange");
  state = allocate(state, ["top", "bottom"]);
  assert.equal(state.stack.length, 0);
  assert.equal(state.battlefield.filter((card) => card.name === "Monk").length, 1);
});

test("lands have one play per turn; old saves request a count, and fetch surveils after shuffling", () => {
  let prepared = put(start(), "Mountain");
  let state = castGoldfishCard(prepared.state, prepared.id);
  prepared = put(state, "Island");
  assert.throws(() => castGoldfishCard(prepared.state, prepared.id), /土地はプレイ済み/);
  assert.equal(nextGoldfishTurn(state).rules.landsPlayed, 0);
  delete prepared.state.rules.landsPlayed;
  state = castGoldfishCard(snap(prepared.state), prepared.id);
  assert.equal(state.rules.pendingChoice.type, "land-count");
  state = chooseGoldfishCast(state, { count: 1 });
  assert.ok(state.hand.some((card) => card.id === prepared.id));
  state = castGoldfishCard(setGoldfishLandCount(state, 0), prepared.id);
  assert.equal(state.rules.landsPlayed, 1);
  prepared = put(start(), "Scalding Tarn", "battlefield");
  const target = prepared.state.library.find((card) => card.name === "Thundering Falls");
  state = resolveGoldfishFetch(prepared.state, prepared.id, target.id, { random: () => .2 });
  const afterShuffle = state.library.at(-1).id;
  state = advanceGoldfishGame(state);
  assert.equal(state.rules.pendingChoice.type, "surveil");
  assert.equal(state.rules.pendingChoice.cardId, afterShuffle);
  assert.equal(state.rules.landsPlayed, 0);
});

test("unknown spell bodies remain on stack and unknown ETB effects explicitly pause", () => {
  let prepared = put(start(), "Opt");
  prepared.state.hand.find((card) => card.id === prepared.id).oracleText += "\nDraw another card.";
  let state = advanceGoldfishGame(playGoldfishCard(prepared.state, prepared.id));
  assert.equal(state.stack.length, 1);
  assert.equal(state.rules.pendingChoice, null);
  prepared = put(start(), "Big Creature");
  prepared.state.hand.find((card) => card.id === prepared.id).oracleText = "When this creature enters, draw ten cards.";
  state = advanceGoldfishGame(playGoldfishCard(prepared.state, prepared.id));
  assert.equal(state.rules.pendingChoice.type, "manual");
  assert.equal(state.battlefield[0].name, "Big Creature");
});
