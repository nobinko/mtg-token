import { nextGoldfishTurn, endGoldfishTurn } from "./helpers/goldfish-turns.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, playGoldfishCard, resolveGoldfishSpell, advanceGoldfishGame,
  chooseGoldfishRule, restoreGoldfishGame, activateGoldfishBauble, removeGoldfishStackAbility,
  beginGoldfishCombat, resolveGoldfishCombat } from "../public/goldfish.js";
import { goldfishAttackers } from "../public/goldfish-combat.js";
import { goldfishKeywords, goldfishCharacteristics } from "../public/goldfish-rules.js";
import { goldfishReference } from "../public/goldfish-objects.js";
import { castGoldfishCard } from "../public/goldfish-mana.js";

const oracle = JSON.parse(readFileSync(new URL("./fixtures/goldfish-oracle.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));
const rows = [...oracle,
  { name: "Swift", typeLine: "Creature", power: "1", toughness: "2", oracleText: "Haste\nProwess" },
  { name: "Watcher", typeLine: "Creature", power: "2", toughness: "2", oracleText: "Vigilance\nLifelink" },
  { name: "Wall", typeLine: "Creature", power: "2", toughness: "4", oracleText: "Defender" },
  { name: "Infecter", typeLine: "Creature", power: "2", toughness: "2", oracleText: "Infect" },
  { name: "Attacker", typeLine: "Creature", power: "2", toughness: "2", oracleText: "Whenever this creature attacks, draw two cards." },
  { name: "Dragon's Rage Channeler", typeLine: "Creature", power: "1", toughness: "1", oracleText: "Whenever you cast a noncreature spell, surveil 1.\nDelirium — As long as there are four or more card types among cards in your graveyard, this creature gets +2/+2, has flying, and attacks each combat if able." },
  { name: "Forest", typeLine: "Basic Land — Forest", oracleText: "{T}: Add {G}." },
  { name: "Frail", typeLine: "Creature", manaCost: "{B}", power: "1", toughness: "1", oracleText: "When this creature enters, draw a card." }
].map((row) => ({ ...row, count: 3 }));
const start = () => keepGoldfishHand(createGoldfishGame(rows, { random: () => .5 }));
function put(state, name, zone = "battlefield") {
  const card = [...state.library, ...state.hand].find((item) => item.name === name);
  assert.ok(card, name);
  return { state: moveGoldfishCards(state, [card.id], zone), id: card.id };
}
const snap = (state) => restoreGoldfishGame(JSON.parse(JSON.stringify(state)));
const declare = (state, ids) => chooseGoldfishRule(beginGoldfishCombat(state), { ids });
const peek = (state, id, player = "self") => advanceGoldfishGame(activateGoldfishBauble(state, id, player));

test("Bauble targets before sacrifice, looks without moving, and draws only next turn upkeep", () => {
  const setup = put(start(), "Mishra's Bauble");
  let state = activateGoldfishBauble(setup.state, setup.id);
  assert.equal(state.rules.pendingChoice.type, "bauble-target");
  assert.ok(state.battlefield.some((card) => card.id === setup.id));
  assert.equal(chooseGoldfishRule(state, { cancel: true }).graveyard.length, 0);
  state = advanceGoldfishGame(chooseGoldfishRule(state, { player: "self" }));
  assert.equal(state.rules.pendingChoice.type, "bauble-look");
  assert.equal(state.rules.spellsCast, 0);
  const top = state.library.at(-1).id, handCount = state.hand.length;
  assert.equal(state.rules.pendingChoice.cardId, top);
  state = chooseGoldfishRule(snap(state), { acknowledge: true });
  assert.equal(state.library.at(-1).id, top);
  assert.equal(state.hand.length, handCount);
  state = endGoldfishTurn(state);
  assert.equal(state.rules.activePlayer, "opponent");
  assert.equal(state.hand.length, handCount);
  assert.equal(state.stack.at(-1).ability.rule, "draw");
  state = advanceGoldfishGame(snap(state));
  assert.equal(state.hand.at(-1).id, top);
  assert.equal(state.hand.length, handCount + 1);
  state = nextGoldfishTurn(state);
  assert.equal(state.hand.length, handCount + 2);
  assert.equal(state.rules.delayedDraws.length, 0);
});

test("Bauble on opponent turn delays until own upkeep, ahead of normal draw; fast next turn resumes safely", () => {
  let { state, id } = put(start(), "Mishra's Bauble");
  state = chooseGoldfishRule(peek(endGoldfishTurn(state), id, "opponent"), { acknowledge: true });
  const handCount = state.hand.length;
  state = nextGoldfishTurn(state);
  assert.equal(state.turn, 2);
  assert.equal(state.hand.length, handCount);
  assert.equal(state.rules.pendingTurnDraw, true);
  state = resolveGoldfishSpell(snap(state));
  assert.equal(state.hand.length, handCount + 2);
  assert.equal(state.rules.pendingTurnDraw, false);
  ({ state, id } = put(state, "Mishra's Bauble"));
  state = chooseGoldfishRule(peek(state, id), { acknowledge: true });
  const before = state.hand.length;
  state = nextGoldfishTurn(state);
  assert.equal(state.rules.activePlayer, "opponent");
  assert.equal(state.rules.resumeNextTurn, true);
  state = advanceGoldfishGame(snap(state));
  assert.equal(state.rules.activePlayer, "self");
  assert.equal(state.turn, 3);
  assert.equal(state.hand.length, Math.min(7, before) + 2);
});

test("countered Bauble produces no delayed draw; multiple Baubles draw once each", () => {
  let { state, id } = put(start(), "Mishra's Bauble");
  state = activateGoldfishBauble(state, id, "self");
  state = removeGoldfishStackAbility(state, state.stack.at(-1).id);
  assert.equal(state.rules.delayedDraws.length, 0);
  for (let index = 0; index < 2; index++) {
    ({ state, id } = put(state, "Mishra's Bauble"));
    state = chooseGoldfishRule(peek(state, id), { acknowledge: true });
  }
  const before = state.hand.length;
  state = advanceGoldfishGame(nextGoldfishTurn(state));
  assert.equal(state.hand.length, before + 3);
  assert.equal(state.rules.delayedDraws.length, 0);
  state = nextGoldfishTurn(state);
  assert.equal(state.hand.length, Math.min(7, before + 3) + 1);
});

test("combat enforces summoning sickness, haste, defender, vigilance and one declaration", () => {
  let setup = put(start(), "Swift"), state = setup.state, swift = setup.id;
  setup = put(state, "Watcher"); state = setup.state; const watcher = setup.id;
  setup = put(state, "Wall"); state = setup.state; const wall = setup.id;
  assert.ok(goldfishAttackers(state).find((item) => item.card.id === watcher).reason);
  assert.throws(() => declare(state, [watcher]), /攻撃できる/);
  state = declare(state, [swift]);
  assert.equal(state.battlefield.find((card) => card.id === swift).tapped, true);
  assert.throws(() => nextGoldfishTurn(state), /戦闘ダメージ/);
  state = resolveGoldfishCombat(state);
  assert.equal(state.players.opponent.life, 19);
  assert.throws(() => beginGoldfishCombat(state), /宣言済み/);
  state = nextGoldfishTurn(state);
  assert.throws(() => declare(state, [wall]), /攻撃できる/);
  state = declare(state, [watcher]);
  assert.equal(state.battlefield.find((card) => card.id === watcher).tapped, false);
  state = resolveGoldfishCombat(state);
  assert.equal(state.players.opponent.life, 17);
  assert.equal(state.players.self.life, 22);
});

test("pump and prowess between declaration and damage use current power; returned attackers leave combat", () => {
  let { state, id } = put(start(), "Swift");
  const swift = id;
  state = declare(state, [swift]);
  ({ state, id } = put(state, "Mutagenic Growth", "hand"));
  state = advanceGoldfishGame(playGoldfishCard(state, id, { target: goldfishReference(state.battlefield.find((card) => card.id === swift), "battlefield") }));
  assert.equal(goldfishCharacteristics(state, state.battlefield.find((card) => card.id === swift)).power, "4");
  state = resolveGoldfishCombat(snap(state));
  assert.equal(state.players.opponent.life, 16);
  state = nextGoldfishTurn(state);
  state = declare(state, [swift]);
  state = moveGoldfishCards(moveGoldfishCards(state, [swift], "hand"), [swift], "battlefield");
  state = resolveGoldfishCombat(state);
  assert.equal(state.players.opponent.life, 16);
});

test("Violent Urge grants first strike and delirium double strike; two damage steps allow responses", () => {
  let { state, id } = put(start(), "Swift"); const swift = id;
  for (const name of ["Mishra's Bauble", "Preordain", "Forest", "Watcher"]) state = put(state, name, "graveyard").state;
  state = declare(state, [swift]);
  ({ state, id } = put(state, "Violent Urge", "hand"));
  state = advanceGoldfishGame(playGoldfishCard(state, id, { target: goldfishReference(state.battlefield.find((card) => card.id === swift), "battlefield") }));
  assert.ok(goldfishKeywords(state, state.battlefield.find((card) => card.id === swift)).has("double strike"));
  state = resolveGoldfishCombat(state);
  assert.equal(state.players.opponent.life, 17);
  assert.equal(state.rules.combat.stage, "normal");
  ({ state, id } = put(state, "Mutagenic Growth", "hand"));
  state = advanceGoldfishGame(playGoldfishCard(state, id, { target: goldfishReference(state.battlefield.find((card) => card.id === swift), "battlefield") }));
  state = resolveGoldfishCombat(snap(state));
  assert.equal(state.players.opponent.life, 11);
  state = nextGoldfishTurn(state);
  assert.ok(!goldfishKeywords(state, state.battlefield.find((card) => card.id === swift)).has("double strike"));
});

test("infect, Psychic Frog draw, unknown attack triggers, and legacy entry turns", () => {
  let { state, id } = put(start(), "Infecter"); const infecter = id;
  ({ state, id } = put(state, "Psychic Frog")); const frog = id;
  delete state.battlefield.find((card) => card.id === frog).enteredTurn;
  assert.ok(goldfishAttackers(snap(state)).find((item) => item.card.id === frog).reason);
  state = nextGoldfishTurn(state);
  const handCount = state.hand.length;
  state = resolveGoldfishCombat(declare(state, [infecter, frog]));
  assert.equal(state.players.opponent.poison, 2);
  assert.equal(state.players.opponent.life, 19);
  state = advanceGoldfishGame(state);
  assert.equal(state.hand.length, handCount + 1);
  ({ state, id } = put(state, "Attacker"));
  state = nextGoldfishTurn(state);
  state = advanceGoldfishGame(declare(state, [id]));
  assert.equal(state.rules.pendingChoice.type, "manual");
});

test("delirious Channeler must attack if able, including after a saved choice", () => {
  let { state, id } = put(start(), "Dragon's Rage Channeler");
  for (const name of ["Mishra's Bauble", "Preordain", "Forest", "Watcher"]) state = put(state, name, "graveyard").state;
  state = nextGoldfishTurn(state);
  const pending = snap(beginGoldfishCombat(state));
  assert.throws(() => chooseGoldfishRule(pending, { ids: [] }), /可能なら攻撃/);
  state = resolveGoldfishCombat(chooseGoldfishRule(pending, { ids: [id] }));
  assert.equal(state.players.opponent.life, 17);
});

test("Iteration permission expires on opponent turn and lands cannot be played there", () => {
  let { state, id } = put(start(), "Expressive Iteration", "hand");
  state = advanceGoldfishGame(playGoldfishCard(state, id));
  state = chooseGoldfishRule(state, { allocation: state.rules.pendingChoice.cardIds.map((value, index) => ({ id: value, destination: ["hand", "bottom", "exile"][index] })) });
  const exiled = state.exile.at(-1).id;
  state = endGoldfishTurn(state);
  assert.throws(() => castGoldfishCard(state, exiled, { fromExile: true }), /期限/);
  ({ state, id } = put(state, "Forest", "hand"));
  assert.throws(() => playGoldfishCard(state, id), /相手のターン/);
});

test("a reanimated creature that immediately dies still emits its entry trigger", () => {
  let { state, id } = put(start(), "Frail", "graveyard"); const target = goldfishReference(state.graveyard.find((card) => card.id === id), "graveyard");
  ({ state, id } = put(state, "Persist", "hand"));
  state = advanceGoldfishGame(playGoldfishCard(state, id, { target }));
  assert.ok(state.graveyard.some((card) => card.name === "Frail"));
  assert.equal(state.rules.pendingChoice.type, "manual");
  assert.equal(state.rules.pendingChoice.sourceName, "Frail");
});

test("first strike does not deal normal damage, and combat step changes empty floating mana", () => {
  let { state, id } = put(start(), "Swift"); const swift = id;
  state.manaPool.R = 2;
  state = declare(state, [swift]);
  assert.equal(state.manaPool.R, 0);
  let prepared = put(state, "Preordain", "hand");
  assert.throws(() => playGoldfishCard(prepared.state, prepared.id), /戦闘中/);
  ({ state, id } = put(state, "Violent Urge", "hand"));
  state = advanceGoldfishGame(playGoldfishCard(state, id, { target: goldfishReference(state.battlefield.find((card) => card.id === swift), "battlefield") }));
  state.manaPool.U = 1;
  state = resolveGoldfishCombat(state);
  assert.equal(state.manaPool.U, 0);
  assert.equal(state.players.opponent.life, 17);
  assert.equal(state.rules.combat.stage, "normal");
  state = resolveGoldfishCombat(state);
  assert.equal(state.players.opponent.life, 17);
  assert.equal(state.rules.combat.stage, "done");
});
