import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustGoldfishCounter,
  copyGoldfishCards,
  createGoldfishGame,
  createGoldfishToken,
  cycleGoldfishFace,
  defaultGoldfishLane,
  drawGoldfishCard,
  groupGoldfishCards,
  keepGoldfishHand,
  moveGoldfishCard,
  moveGoldfishCards,
  moveGoldfishTopCards,
  mulliganGoldfish,
  nextGoldfishTurn,
  peekGoldfishLibrary,
  restoreGoldfishGame,
  setGoldfishCardNote,
  setGoldfishCardsTapped,
  setGoldfishLife,
  setGoldfishPowerToughness,
  setGoldfishTracker,
  shuffleGoldfishLibrary,
  takeGoldfishCardFromLibrary,
  toggleGoldfishFaceDown,
  toggleGoldfishTapped,
  untapGoldfishAll
} from "../public/goldfish.js";

const deck = [{ name: "Island", count: 30 }, { name: "Test Spell", count: 30 }];
const fixedRandom = () => 0.25;

test("createGoldfishGame shuffles a real 60-card deck and draws seven", () => {
  const state = createGoldfishGame(deck, { sideboardRows: [{ name: "Dispel", count: 2 }], random: fixedRandom });
  assert.equal(state.library.length, 53);
  assert.equal(state.hand.length, 7);
  assert.equal(state.sideboard.length, 2);
  assert.deepEqual(state.players, {
    self: { life: 20, poison: 0, energy: 0 },
    opponent: { life: 20, poison: 0, energy: 0 }
  });
  assert.equal(state.phase, "opening");
  assert.equal(state.turn, 0);
});

test("card metadata and basic land names choose the expected battlefield lanes", () => {
  assert.equal(defaultGoldfishLane("Legendary Creature — Human", "Test"), "creature");
  assert.equal(defaultGoldfishLane("Artifact Land", "Test"), "land");
  assert.equal(defaultGoldfishLane("Instant", "Test"), "other");
  assert.equal(defaultGoldfishLane("", "Snow-Covered Forest"), "land");
});

test("London mulligan requires the right number of bottom cards", () => {
  const initial = createGoldfishGame(deck, { random: fixedRandom });
  const mulligan = mulliganGoldfish(initial, fixedRandom);
  assert.equal(mulligan.bottomRequired, 1);
  assert.throws(() => keepGoldfishHand(mulligan, []), /1枚/);

  const kept = keepGoldfishHand(mulligan, [mulligan.hand[0].id]);
  assert.equal(kept.hand.length, 6);
  assert.equal(kept.library.length, 54);
  assert.equal(kept.phase, "playing");
  assert.equal(kept.turn, 1);
});

test("London mulligan can reach a legal zero-card hand", () => {
  let state = createGoldfishGame(deck, { random: fixedRandom });
  for (let count = 0; count < 7; count += 1) state = mulliganGoldfish(state, fixedRandom);
  assert.equal(state.bottomRequired, 7);
  const kept = keepGoldfishHand(state, state.hand.map((card) => card.id));
  assert.equal(kept.hand.length, 0);
  assert.equal(kept.library.length, 60);
});

test("the player on the draw receives a card after keeping", () => {
  const initial = createGoldfishGame(deck, { onThePlay: false, random: fixedRandom });
  const kept = keepGoldfishHand(initial, []);
  assert.equal(kept.hand.length, 8);
  assert.equal(kept.library.length, 52);
});

test("cards move between zones, tap, untap next turn, and draw", () => {
  let state = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const cardId = state.hand[0].id;
  state = moveGoldfishCard(state, cardId, "battlefield");
  state = toggleGoldfishTapped(state, cardId);
  assert.equal(state.battlefield[0].tapped, true);

  const libraryBefore = state.library.length;
  state = nextGoldfishTurn(state);
  assert.equal(state.turn, 2);
  assert.equal(state.battlefield[0].tapped, false);
  assert.equal(state.library.length, libraryBefore - 1);

  state = drawGoldfishCard(state);
  assert.equal(state.library.length, libraryBefore - 2);
  state = moveGoldfishCard(state, cardId, "graveyard");
  assert.equal(state.battlefield.length, 0);
  assert.equal(state.graveyard[0].id, cardId);
});

test("life changes are bounded", () => {
  const state = createGoldfishGame(deck, { random: fixedRandom });
  assert.equal(setGoldfishLife(state, 1000).life, 999);
  assert.equal(setGoldfishLife(state, -1000).life, -99);
});

test("both players' life and resource trackers are independent and bounded", () => {
  let state = createGoldfishGame(deck, { random: fixedRandom });
  state = setGoldfishTracker(state, "opponent", "life", 13);
  state = setGoldfishTracker(state, "opponent", "poison", 120);
  state = setGoldfishTracker(state, "self", "energy", 7);
  assert.equal(state.players.opponent.life, 13);
  assert.equal(state.players.opponent.poison, 99);
  assert.equal(state.players.self.life, 20);
  assert.equal(state.players.self.energy, 7);
  assert.equal(state.life, 20);
});

test("battlefield cards can be placed and reordered within explicit lanes", () => {
  let state = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const [first, second, third] = state.hand.slice(0, 3);
  state = moveGoldfishCard(state, first.id, "battlefield", { lane: "land" });
  state = moveGoldfishCard(state, second.id, "battlefield", { lane: "land" });
  state = moveGoldfishCard(state, third.id, "battlefield", { lane: "creature" });
  assert.deepEqual(state.battlefield.filter((card) => card.lane === "land").map((card) => card.id), [first.id, second.id]);
  state = moveGoldfishCard(state, second.id, "battlefield", { lane: "land", index: 0 });
  assert.deepEqual(state.battlefield.filter((card) => card.lane === "land").map((card) => card.id), [second.id, first.id]);
  assert.equal(state.battlefield.find((card) => card.id === third.id).lane, "creature");
});

test("multi-select tap operations and untap-all preserve the input state", () => {
  let state = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const ids = state.hand.slice(0, 2).map((card) => card.id);
  state = moveGoldfishCards(state, ids, "battlefield", { lane: "other" });
  const tapped = setGoldfishCardsTapped(state, ids, true);
  assert.equal(tapped.battlefield.every((card) => card.tapped), true);
  assert.equal(state.battlefield.every((card) => !card.tapped), true);
  const untapped = untapGoldfishAll(tapped);
  assert.equal(untapped.battlefield.every((card) => !card.tapped), true);
});

test("counters, power/toughness overrides, and notes attach to battlefield cards", () => {
  let state = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const id = state.hand[0].id;
  state = moveGoldfishCard(state, id, "battlefield", { lane: "creature" });
  state = adjustGoldfishCounter(state, [id], "+1/+1", 2);
  state = adjustGoldfishCounter(state, [id], "+1/+1", -1);
  state = setGoldfishPowerToughness(state, [id], "5", "6");
  state = setGoldfishCardNote(state, [id], "攻撃済み");
  const card = state.battlefield[0];
  assert.equal(card.counters["+1/+1"], 1);
  assert.equal(card.powerOverride, "5");
  assert.equal(card.toughnessOverride, "6");
  assert.equal(card.note, "攻撃済み");
});

test("tokens, copies, face-down cards, alternate faces, and groups are modeled", () => {
  const modalDeck = [
    { name: "Island", count: 59 },
    {
      name: "Test Double Card",
      count: 1,
      typeLine: "Creature",
      faces: [
        { name: "Front", typeLine: "Creature", imageUrl: "front.png", power: "2", toughness: "2" },
        { name: "Back", typeLine: "Creature", imageUrl: "back.png", power: "4", toughness: "4" }
      ]
    }
  ];
  let state = keepGoldfishHand(createGoldfishGame(modalDeck, { random: () => 0 }), []);
  const double = [...state.hand, ...state.library].find((card) => card.name === "Test Double Card");
  state = moveGoldfishCard(state, double.id, "battlefield", { lane: "creature" });
  state = createGoldfishToken(state, { name: "Goblin", typeLine: "Token Creature", power: "1", toughness: "1", count: 2 });
  state = copyGoldfishCards(state, [double.id]);
  const tokenIds = state.battlefield.filter((card) => card.kind === "token").map((card) => card.id);
  state = groupGoldfishCards(state, tokenIds);
  state = toggleGoldfishFaceDown(state, [tokenIds[0]]);
  state = cycleGoldfishFace(state, [double.id]);
  assert.equal(state.battlefield.filter((card) => card.kind === "token").length, 2);
  assert.equal(state.battlefield.filter((card) => card.kind === "copy").length, 1);
  assert.equal(state.battlefield.find((card) => card.id === tokenIds[0]).faceDown, true);
  assert.equal(state.battlefield.find((card) => card.id === double.id).faceIndex, 1);
  assert.ok(state.battlefield.filter((card) => tokenIds.includes(card.id)).every((card) => card.groupId));
});

test("top-X operations preserve peek order and do not shuffle", () => {
  let state = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const top = peekGoldfishLibrary(state, 3);
  const originalRemainder = state.library.filter((card) => !top.some((item) => item.id === card.id)).map((card) => card.id);
  const moved = moveGoldfishTopCards(state, 3, "exile");
  assert.deepEqual(moved.exile.map((card) => card.id), top.map((card) => card.id));
  assert.deepEqual(moved.library.map((card) => card.id), originalRemainder);
  assert.equal(state.exile.length, 0);
});

test("cards can move through command and sideboard zones", () => {
  let state = keepGoldfishHand(createGoldfishGame(deck, { sideboardRows: [{ name: "Dispel", count: 2 }], random: fixedRandom }), []);
  const mainId = state.hand[0].id;
  const sideId = state.sideboard[0].id;
  state = moveGoldfishCard(state, mainId, "command");
  state = moveGoldfishCard(state, sideId, "hand");
  assert.equal(state.command[0].id, mainId);
  assert.ok(state.hand.some((card) => card.id === sideId));
  assert.equal(state.sideboard.length, 1);
});

test("saved games restore as independent validated states", () => {
  const original = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const restored = restoreGoldfishGame(JSON.parse(JSON.stringify(original)));
  restored.hand[0].name = "Changed";
  assert.notEqual(original.hand[0].name, "Changed");
  assert.equal(restored.phase, "playing");
  assert.throws(() => restoreGoldfishGame(null), /不正/);
  assert.throws(() => restoreGoldfishGame({ deckRows: [], library: [] }), /有効なデッキ/);
});

test("taking a searched card moves one copy and shuffles the remaining library", () => {
  const initial = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const target = initial.library[5];
  const beforeIds = initial.library.filter((card) => card.id !== target.id).map((card) => card.id);
  const next = takeGoldfishCardFromLibrary(initial, target.id, "battlefield", () => 0);

  assert.equal(next.library.length, initial.library.length - 1);
  assert.equal(next.battlefield.at(-1).id, target.id);
  assert.notDeepEqual(next.library.map((card) => card.id), beforeIds);
  assert.equal(initial.library.some((card) => card.id === target.id), true);
});

test("library search rejects cards outside the library and invalid destinations", () => {
  const state = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  assert.throws(() => takeGoldfishCardFromLibrary(state, state.hand[0].id, "battlefield"), /山札にありません/);
  assert.throws(() => takeGoldfishCardFromLibrary(state, state.library[0].id, "libraryTop"), /移動先が不正/);
});

test("shuffling the library preserves every card and leaves the input untouched", () => {
  const state = keepGoldfishHand(createGoldfishGame(deck, { random: fixedRandom }), []);
  const beforeIds = state.library.map((card) => card.id);
  const next = shuffleGoldfishLibrary(state, () => 0);

  assert.deepEqual([...next.library.map((card) => card.id)].sort(), [...beforeIds].sort());
  assert.notDeepEqual(next.library.map((card) => card.id), beforeIds);
  assert.deepEqual(state.library.map((card) => card.id), beforeIds);
});
