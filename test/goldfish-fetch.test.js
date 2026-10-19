import assert from "node:assert/strict";
import test from "node:test";
import { createGoldfishGame, keepGoldfishHand, peekGoldfishLibrary, restoreGoldfishGame } from "../public/goldfish.js";
import { goldfishFetchRule, goldfishFetchTargets, goldfishFetchEntry, resolveGoldfishFetch } from "../public/goldfish-fetch.js";
import { goldfishShortcut } from "../public/goldfish-shortcuts.js";

const delta = { name: "Polluted Delta", typeLine: "Land", oracleText: "{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle." };
const wilds = { name: "Evolving Wilds", typeLine: "Land", oracleText: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." };
const passage = { ...wilds, name: "Fabled Passage", oracleText: `${wilds.oracleText} Then if you control four or more lands, untap that land.` };
const island = { name: "Island", typeLine: "Basic Land — Island" };
const shock = { name: "Watery Grave", typeLine: "Land — Island Swamp", oracleText: "({T}: Add {U} or {B}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped." };
const surveil = { name: "Undercity Sewers", typeLine: "Land — Island Swamp", oracleText: "This land enters tapped.\nWhen this land enters, surveil 1." };
function scenario(source = delta, lands = [island, shock, surveil], { life = 20, others = 0 } = {}) {
  const game = keepGoldfishHand(createGoldfishGame([{ ...island, count: 60 }], { random: () => 0.4 }));
  const card = game.hand[0];
  return { ...game, life, players: { ...game.players, self: { ...game.players.self, life } },
    battlefield: [{ ...card, ...source, id: "fetch" }, ...Array.from({ length: others }, (_, index) => ({ ...card, id: `other-${index}` }))],
    library: lands.map((land, index) => ({ ...card, ...land, id: `land-${index}` })) };
}

test("fetch recognizes exact single-land abilities, both named and current Oracle, without pretending to pay mana or find two cards", () => {
  assert.equal(goldfishFetchRule(delta).life, 1);
  assert.equal(goldfishFetchRule({ ...delta, oracleText: delta.oracleText.replace("this land", delta.name) }).life, 1);
  assert.equal(goldfishFetchRule(wilds).life, 0);
  assert.equal(goldfishFetchRule({ ...delta, oracleText: delta.oracleText.replace("Island or Swamp", "basic land") }).basic, true);
  assert.equal(goldfishFetchRule({ ...delta, oracleText: delta.oracleText.replace("{T}", "{2}, {T}") }), null);
  assert.equal(goldfishFetchRule({ ...delta, oracleText: delta.oracleText.replace("Island or Swamp", "Island and Swamp") }), null);
  assert.equal(goldfishFetchRule({ ...delta, typeLine: "Creature — Human" }), null);
  assert.equal(goldfishFetchRule({ ...delta, faceDown: true }), null);
});

test("fetch filters land subtypes, basic versus nonbasic, and only the front face in a library", () => {
  const lands = [island, shock, { name: "Plains", typeLine: "Basic Land — Plains" },
    { name: "Wastes", typeLine: "Basic Land" }, { name: "Snow-Covered Island", typeLine: "Basic Snow Land — Island" },
    { name: "Spell // Island", typeLine: "Sorcery // Land — Island", faces: [{ typeLine: "Sorcery" }, { typeLine: "Land — Island" }] }];
  assert.deepEqual(goldfishFetchTargets(scenario(delta, lands), "fetch").map((card) => card.name), ["Island", "Watery Grave", "Snow-Covered Island"]);
  assert.deepEqual(goldfishFetchTargets(scenario(wilds, lands), "fetch").map((card) => card.name), ["Island", "Plains", "Wastes", "Snow-Covered Island"]);
});

test("fetch and shock payments, sacrifice, entry and shuffle form one immutable undoable transition", () => {
  const original = scenario();
  const saved = structuredClone(original);
  const next = resolveGoldfishFetch(original, "fetch", "land-1", { entry: "pay2", random: () => 0 });
  assert.equal(next.life, 17);
  assert.equal(next.players.self.life, 17);
  assert.deepEqual(next.graveyard.map((card) => card.name), ["Polluted Delta"]);
  assert.deepEqual(next.battlefield.map((card) => [card.name, card.tapped]), [["Watery Grave", false]]);
  assert.deepEqual(next.library.map((card) => card.id), ["land-2", "land-0"]);
  assert.deepEqual(original, saved, "Preview/cancel and undo retain the full previous state, including library order");
  const restored = restoreGoldfishGame(JSON.parse(JSON.stringify(next)));
  assert.equal(restored.life, 17);
  assert.equal(restored.battlefield[0].name, "Watery Grave");
  const tapped = resolveGoldfishFetch(original, "fetch", "land-1");
  assert.equal(tapped.life, 19);
  assert.equal(tapped.battlefield[0].tapped, true);
});

test("illegal sources, insufficient life, wrong targets and invalid shock choices cannot change the game", () => {
  const original = scenario(delta, [island, shock], { life: 2 });
  assert.equal(goldfishFetchEntry(original, "fetch", original.library[1]).choices.length, 1);
  assert.throws(() => resolveGoldfishFetch(original, "fetch", "land-1", { entry: "pay2" }), /ライフ/);
  assert.throws(() => resolveGoldfishFetch(scenario(delta, [island], { life: 0 }), "fetch", "land-0"), /ライフ/);
  assert.throws(() => resolveGoldfishFetch(scenario({ ...delta, tapped: true }), "fetch", null), /タップ中/);
  assert.throws(() => resolveGoldfishFetch(scenario({ ...delta, faceDown: true }), "fetch", null), /対応/);
  assert.throws(() => resolveGoldfishFetch(scenario(wilds), "fetch", "land-1"), /探せる/);
  assert.throws(() => resolveGoldfishFetch(original, "land-0", null), /対応/);
  assert.equal(original.players.self.life, 2);
  assert.equal(original.battlefield[0].name, "Polluted Delta");
});

test("basic fetches cost zero life, and Passage counts the fetched land but excludes itself", () => {
  const wild = resolveGoldfishFetch(scenario(wilds), "fetch", "land-0");
  assert.equal(wild.life, 20);
  assert.equal(wild.battlefield[0].tapped, true);
  for (const others of [2, 3]) {
    const next = resolveGoldfishFetch(scenario(passage, [island], { others }), "fetch", "land-0");
    assert.equal(next.battlefield.length, others + 1);
    assert.equal(next.battlefield.find((card) => card.id === "land-0").tapped, others === 2);
    assert.equal(next.life, 20);
  }
});

test("fail to find still pays and shuffles; surveil lands enter tapped and reveal only after the fetch shuffle", () => {
  const original = scenario();
  const failed = resolveGoldfishFetch(original, "fetch", null, { random: () => 0 });
  assert.equal(failed.life, 19);
  assert.equal(failed.battlefield.length, 0);
  assert.equal(failed.library.length, original.library.length);
  assert.notDeepEqual(failed.library.map((card) => card.id), original.library.map((card) => card.id));
  assert.equal(goldfishFetchEntry(original, "fetch", original.library[2]).surveil, true);
  const next = resolveGoldfishFetch(original, "fetch", "land-2", { random: () => 0 });
  assert.equal(next.battlefield[0].tapped, true);
  assert.equal(peekGoldfishLibrary(next, 1)[0].id, "land-0");
});

test("conditional taplands require a player choice while unconditional taplands do not", () => {
  const state = scenario();
  const conditional = { name: "Sunken Hollow", typeLine: "Land — Island Swamp", oracleText: "This land enters tapped unless you control two or more basic lands." };
  assert.equal(goldfishFetchEntry(state, "fetch", conditional).choices.length, 2);
  assert.match(goldfishFetchEntry(state, "fetch", conditional).note, /条件/);
  assert.equal(goldfishFetchEntry(state, "fetch", surveil).choices.length, 1);
});

test("keyboard mapping supports common actions without hijacking browser commands, typing, IME or key repeat", () => {
  for (const [key, action] of Object.entries({ f: "fetch", b: "battlefield", g: "graveyard", e: "exile", h: "hand", d: "draw", n: "next", k: "keep", m: "mulligan", "3": "hand:3" })) {
    assert.equal(goldfishShortcut({ key }), action);
    assert.equal(goldfishShortcut({ key }, { editing: true }), null);
    for (const modifier of ["ctrlKey", "metaKey", "altKey", "repeat", "isComposing", "defaultPrevented"]) assert.equal(goldfishShortcut({ key, [modifier]: true }), null);
  }
  for (const key of ["l", "t", "u"]) assert.equal(goldfishShortcut({ key, ctrlKey: true }), null);
  assert.equal(goldfishShortcut({ key: "z", ctrlKey: true }), "undo");
  assert.equal(goldfishShortcut({ key: "z", metaKey: true, shiftKey: true }), "redo");
  assert.equal(goldfishShortcut({ key: "z", ctrlKey: true }, { editing: true }), null);
  assert.equal(goldfishShortcut({ key: "?", shiftKey: true }), "help");
  assert.equal(goldfishShortcut({ key: "Escape" }, { editing: true }), "escape");
});
