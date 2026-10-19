import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoldfishGame, keepGoldfishHand, moveGoldfishCard, mulliganGoldfish,
  playGoldfishCard, resolveGoldfishSpell, nextGoldfishTurn, restoreGoldfishGame,
  cycleGoldfishFace, goldfishPlayDestination
} from "../public/goldfish.js";
import { goldfishShortcut } from "../public/goldfish-shortcuts.js";

const rows = [
  {name: "Island", count: 10, typeLine: "Basic Land — Island"},
  {name: "Lightning Bolt", count: 10, typeLine: "Instant"},
  {name: "Monastery Swiftspear", count: 10, typeLine: "Creature — Human Monk"},
  {name: "Ponder", count: 10, typeLine: "Sorcery"},
  {name: "Mox Amber", count: 10, typeLine: "Legendary Artifact"},
  {name: "Unknown card", count: 10}
];
const opening = () => createGoldfishGame(rows, {random: () => .5});
function withCard(type) {
  let state = keepGoldfishHand(opening());
  const card = [...state.library, ...state.hand].find((card) => card.typeLine === type);
  state = moveGoldfishCard(state, card.id, "hand");
  return {state, card};
}

test("playing a land places it immediately while spells resolve to their proper zone", () => {
  for (const [type, zone, lane] of [["Basic Land — Island", "battlefield", "land"], ["Instant", "graveyard"], ["Sorcery", "graveyard"], ["Creature — Human Monk", "battlefield", "creature"], ["Legendary Artifact", "battlefield", "other"]]) {
    const {state, card} = withCard(type);
    const serialized = JSON.stringify(state);
    const played = playGoldfishCard(state, card.id);
    const land = type.includes("Land");
    assert.equal(played.stack.length, land ? 0 : 1);
    assert.equal(played.hand.length, state.hand.length - 1);
    const resolved = land ? played : resolveGoldfishSpell(played);
    assert.ok(resolved[zone].some((item) => item.id === card.id));
    if (lane) assert.equal(resolved[zone].find((item) => item.id === card.id).lane, lane);
    assert.equal(resolved.stack.length, 0);
    assert.equal(JSON.stringify(state), serialized, "history must retain the original state");
  }
});

test("stack is last in first out, blocks next turn, and survives save/restore", () => {
  let {state, card} = withCard("Instant");
  const other = state.library.find((item) => item.typeLine.startsWith("Creature"));
  state = moveGoldfishCard(state, other.id, "hand");
  // Cast the creature first, then respond with an instant. Ordinary creatures
  // cannot be cast in response to another spell.
  state = playGoldfishCard(playGoldfishCard(state, other.id), card.id);
  assert.throws(() => nextGoldfishTurn(state), /解決待ち/);
  const restored = restoreGoldfishGame(JSON.parse(JSON.stringify(state)));
  const once = resolveGoldfishSpell(restored);
  assert.equal(once.stack[0].id, other.id);
  assert.equal(once.graveyard.at(-1).id, card.id);
  assert.equal(restored.stack.length, 2);
  const twice = resolveGoldfishSpell(once);
  assert.equal(twice.battlefield.at(-1).id, other.id);
  assert.equal(nextGoldfishTurn(twice).turn, 2);
});

test("old saves without a stack and saves with all seven cards on the stack restore", () => {
  const old = keepGoldfishHand(opening());
  delete old.stack;
  assert.deepEqual(restoreGoldfishGame(old).stack, []);
  let state = keepGoldfishHand(createGoldfishGame([{name: "Bolt", typeLine: "Instant", count: 7}]));
  for (const card of [...state.hand]) state = playGoldfishCard(state, card.id);
  assert.equal(restoreGoldfishGame(state).stack.length, 7);
});

test("play requires a kept hand and known type, and alternate faces use their own type", () => {
  const initial = opening();
  assert.throws(() => playGoldfishCard(initial, initial.hand[0].id), /キープ/);
  const mulligan = mulliganGoldfish(initial);
  assert.throws(() => playGoldfishCard(mulligan, mulligan.hand[0].id), /キープ/);
  const {state, card} = withCard("");
  assert.throws(() => playGoldfishCard(state, card.id), /カードタイプ/);
  assert.throws(() => playGoldfishCard(state, state.library[0].id), /手札/);
  assert.throws(() => resolveGoldfishSpell(state), /解決待ち/);
  const faces = [{name:"Front",typeLine:"Sorcery"},{name:"Back",typeLine:"Land"}];
  let modal = keepGoldfishHand(createGoldfishGame([{name:"Front // Back",typeLine:"Sorcery // Land",faces,count:7}]));
  const id = modal.hand[0].id;
  assert.equal(goldfishPlayDestination(modal.hand[0]), "stack");
  modal = cycleGoldfishFace(modal,[id]);
  assert.equal(goldfishPlayDestination(modal.hand[0]), "battlefield");
  assert.equal(playGoldfishCard(modal,id).battlefield[0].lane,"land");
  assert.equal(goldfishPlayDestination({typeLine:"Sorcery // Land"}), "stack", "a missing face record must not play the back as a land");
});

test("Enter and Space respect focused native controls, typing, IME, and held keys", () => {
  assert.equal(goldfishShortcut({key:"Enter"}), "play");
  assert.equal(goldfishShortcut({key:" "}), "primary");
  for (const key of ["Enter", " "]) {
    assert.equal(goldfishShortcut({key}, {nativeActivation:true}), null);
    assert.equal(goldfishShortcut({key}, {editing:true}), null);
    assert.equal(goldfishShortcut({key,isComposing:true}), null);
    assert.equal(goldfishShortcut({key,repeat:true}), null);
    assert.equal(goldfishShortcut({key,ctrlKey:true}), null);
  }
});
