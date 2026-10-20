import assert from "node:assert/strict";
import test from "node:test";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, cloneGoldfishState, restoreGoldfishGame,
  nextGoldfishTurn, restartGoldfishGame, cycleGoldfishFace } from "../public/goldfish.js";
import { goldfishLandManaOptions, planGoldfishPayment, activateGoldfishLand, castGoldfishCard,
  setGoldfishMana, clearGoldfishMana, goldfishLandEntryOptions } from "../public/goldfish-mana.js";
import { goldfishCardOperations } from "../public/goldfish-effects.js";

const land = (name, typeLine, oracleText = "") => ({ name, typeLine, oracleText });
const island = land("Island", "Basic Land — Island");
const mountain = land("Mountain", "Basic Land — Mountain");
const dual = land("Steam Vents", "Land — Island Mountain");
const source = (text) => land("Test land", "Land", text);
const spell = (manaCost, extra = {}) => ({ name: "Test spell", typeLine: "Instant", manaCost, ...extra });
function game(lands, card = spell("{U}{R}")) {
  let state = keepGoldfishHand(createGoldfishGame([{ ...card, count: 7 }, ...lands.map((row) => ({ ...row, count: 1 }))], { random: () => .7 }));
  const all = [...state.hand, ...state.library];
  const landIds = all.filter((row) => row.typeLine.startsWith("Land") || row.typeLine.startsWith("Basic Land")).map((row) => row.id);
  if (landIds.length) state = moveGoldfishCards(state, landIds, "battlefield");
  const id = all.find((row) => row.name === card.name).id;
  state = moveGoldfishCards(state, [id], "hand");
  return { state, id, card: state.hand.find((row) => row.id === id) };
}

test("mana recognizes basic subtypes and complete unrestricted abilities, never partial conditional/filter/fetch text", () => {
  assert.deepEqual(goldfishLandManaOptions(dual).map((op) => op.pool.U + op.pool.R), [1, 1]);
  for (const text of ["{T}: Add {U} or {R}.", "{T}: Add {U}, {R}, or {G}.", "{T}: Add {C}{C}.", "{T}: Add one mana of any color."]) assert.ok(goldfishLandManaOptions(source(text)).length);
  for (const text of ["{T}: Add {U}. Spend this mana only to cast creature spells.", "{T}: Add {C}. If you control a Forest, add {G} instead.", "{1}, {T}: Add {U}{R}.", "{T}, Sacrifice Test land: Add {R}.", "{T}: Add one mana of any color that a land an opponent controls could produce."]) assert.equal(goldfishLandManaOptions(source(text)).length, 0, text);
  assert.equal(goldfishLandManaOptions({ ...island, faceDown: true }).length, 0);
  assert.equal(goldfishLandManaOptions({ ...island, typeLine: "Land Creature — Forest Dryad" }).length, 0);
  assert.equal(goldfishLandManaOptions({ typeLine: "Artifact", oracleText: "{T}: Add {C}{C}." }).length, 0);
});

test("auto-payment assigns duals correctly without reusing a land; colored, generic and true colorless remain distinct", () => {
  const { state, card } = game([dual, mountain]);
  assert.equal(planGoldfishPayment(state, card).payable, true);
  assert.equal(planGoldfishPayment(game([dual]).state, card).payable, false);
  assert.equal(planGoldfishPayment(game([island, mountain]).state, spell("{C}{R}")).payable, false);
  assert.equal(planGoldfishPayment(game([island, mountain]).state, spell("{1}{R}")).payable, true);
  assert.equal(planGoldfishPayment(game([source("{T}: Add {C}{C}."), mountain]).state, spell("{2}{R}")).payable, true);
  const tapped = cloneGoldfishState(state); tapped.battlefield[0].tapped = true;
  assert.equal(planGoldfishPayment(tapped, card).payable, false);
});

test("activation and cast consume pool first, preserve surplus, and are immutable atomic save/history operations", () => {
  const { state, id } = game([island, mountain], spell("{U}"));
  const before = JSON.stringify(state);
  const active = activateGoldfishLand(state, state.battlefield.find((row) => row.name === "Island").id);
  assert.equal(active.manaPool.U, 1);
  assert.equal(active.battlefield.filter((row) => row.tapped).length, 1);
  const floated = setGoldfishMana(active, "R", 2);
  const paid = castGoldfishCard(floated, id);
  assert.equal(paid.stack.at(-1).id, id);
  assert.equal(paid.manaPool.U, 0); assert.equal(paid.manaPool.R, 2);
  assert.equal(paid.battlefield.filter((row) => row.tapped).length, 1);
  assert.deepEqual(restoreGoldfishGame(JSON.parse(JSON.stringify(paid))).manaPool, paid.manaPool);
  assert.equal(JSON.stringify(state), before);
  assert.equal(cloneGoldfishState(floated).manaPool.U, 1, "undo retains payment state");
  assert.throws(() => activateGoldfishLand(active, active.battlefield.find((row) => row.tapped).id), /アンタップ/);
  assert.equal(planGoldfishPayment(state, state.hand.find((row) => row.id === id), { autoTap: false }).payable, false);
  assert.throws(() => castGoldfishCard(state, id, { autoTap: false }), /マナプール/);
});

test("cost choices cover hybrid, X, phyrexian mana or life, and do not treat absent costs or snow as free", () => {
  const { state } = game([island, mountain]);
  assert.equal(planGoldfishPayment(state, spell("{U/R}{U}")).payable, true);
  assert.equal(planGoldfishPayment(state, spell("{2/B}")).payable, true);
  assert.equal(planGoldfishPayment(state, spell("{U/P}")).payable, true);
  assert.equal(planGoldfishPayment(state, spell("{B/P}")).life, 2);
  assert.equal(planGoldfishPayment(state, spell("{U/P}")).life, 0, "prefer mana unless life was explicitly selected");
  assert.equal(planGoldfishPayment(state, spell("{U/P}"), { phyrexianLife: true }).life, 2);
  assert.equal(planGoldfishPayment(state, spell("{X}{U}"), { x: 1 }).payable, true);
  assert.equal(planGoldfishPayment(state, spell("{X}{U}"), { x: 2 }).payable, false);
  for (const cost of ["", "{S}", "{Y}"]) assert.equal(planGoldfishPayment(state, spell(cost)).supported, false);
  assert.equal(planGoldfishPayment(state, spell("{0}")).payable, true);
  assert.equal(planGoldfishPayment(state, spell("{X}"), { x: .5 }).supported, false);
  const variable = game([island, mountain], spell("{X}{U}"));
  assert.equal(castGoldfishCard(variable.state, variable.id, { x: 1 }).stack.at(-1).note, "X=1");
});

test("pain lands need an explicit life choice and safe lands are preferred", () => {
  const pain = source("{T}: Add {U} or {R}. Test land deals 1 damage to you.");
  const { state, card, id } = game([pain], spell("{U}"));
  assert.equal(planGoldfishPayment(state, card).life, 1);
  assert.throws(() => castGoldfishCard(state, id), /ライフ/);
  assert.equal(castGoldfishCard(state, id, { confirmLife: true }).players.self.life, 19);
  assert.equal(planGoldfishPayment(game([pain, island]).state, card).life, 0);
  const low = cloneGoldfishState(state); low.players.self.life = 1;
  assert.equal(planGoldfishPayment(low, card).payable, false);
  assert.equal(goldfishLandManaOptions(source("{T}, Pay 1 life: Add {G} or {W}."))[0].life, 1);
  const city = source("Whenever this land becomes tapped, it deals 1 damage to you.\n{T}: Add one mana of any color.");
  assert.equal(goldfishLandManaOptions(city).length, 5);
  assert.ok(goldfishLandManaOptions(city).every((option) => option.life === 1 && option.damage));
});

test("land entry respects taplands and explicit shock/conditional choices", () => {
  const shock = { ...dual, oracleText: "As Steam Vents enters, you may pay 2 life. If you don't, it enters tapped." };
  const { state } = game([], { ...shock, count: 7 });
  const id = state.hand[0].id;
  const safe = castGoldfishCard(state, id);
  assert.equal(safe.battlefield.at(-1).tapped, true);
  const paid = castGoldfishCard(state, id, { entry: 1 });
  assert.equal(paid.battlefield.at(-1).tapped, false); assert.equal(paid.life, 18);
  assert.equal(goldfishLandEntryOptions(source("This land enters tapped.")).length, 1);
  assert.equal(goldfishLandEntryOptions(source("This land enters tapped unless you control two or fewer other lands.")).length, 2);
});

test("common conditional lands determine entry from the actual battlefield and turn", () => {
  const slow = source("This land enters tapped unless you control two or more other lands.");
  const creatureLand = source("If you control two or more other lands, this land enters tapped.");
  const basicCheck = source("This land enters tapped unless you control a basic land.");
  const town = source("This land enters tapped unless it's your first, second, or third turn of the game.");
  for (const count of [0, 1, 2, 3]) {
    const state = game(Array.from({ length: count }, () => dual)).state;
    assert.equal(goldfishLandEntryOptions(slow, state).length, 1);
    assert.equal(goldfishLandEntryOptions(slow, state)[0].tapped, count < 2);
    assert.equal(goldfishLandEntryOptions(creatureLand, state)[0].tapped, count >= 2);
    assert.equal(goldfishLandEntryOptions(basicCheck, state)[0].tapped, true, "basic land types do not make a shockland basic");
  }
  const state = game([island]).state;
  assert.equal(goldfishLandEntryOptions(basicCheck, state)[0].tapped, false);
  for (const turn of [1, 2, 3, 4, 9]) {
    state.turn = turn;
    assert.equal(goldfishLandEntryOptions(town, state)[0].tapped, turn > 3);
  }
  const entered = game([], { ...slow, name: "Shipwreck Marsh", count: 7 });
  entered.state = moveGoldfishCards(entered.state, entered.state.battlefield.map(c => c.id), "libraryBottom");
  assert.throws(() => castGoldfishCard(entered.state, entered.id, { entry: 1 }), /土地の出し方/, "an obsolete saved choice cannot bypass the forced tap");
  const paid = castGoldfishCard(entered.state, entered.id);
  assert.equal(paid.battlefield.at(-1).tapped, true);
  const moon = { ...state, battlefield: [{ name: "Blood Moon", typeLine: "Enchantment" }] };
  assert.equal(goldfishLandEntryOptions(slow, moon)[0].tapped, false);
});

test("face-specific costs survive normalization and restoration", () => {
  const card = spell("{3}{U}", { faces: [{ name: "Front", typeLine: "Instant", manaCost: "{3}{U}" }, { name: "Back", typeLine: "Sorcery", manaCost: "{R}" }] });
  const { state, id } = game([mountain], card);
  const flipped = restoreGoldfishGame(cycleGoldfishFace(state, [id]));
  assert.equal(planGoldfishPayment(flipped, flipped.hand.find((row) => row.id === id)).payable, true);
  assert.equal(castGoldfishCard(flipped, id).manaPool.R, 0);
});

test("restart, next turn, and manual pool clearing reset mana while old saves gain an empty pool", () => {
  const { state } = game([island]);
  const withMana = setGoldfishMana(state, "U", 3);
  assert.equal(nextGoldfishTurn(withMana).manaPool.U, 0);
  assert.equal(clearGoldfishMana(withMana).manaPool.U, 0);
  const restarted = restartGoldfishGame(withMana);
  assert.equal(restarted.phase, "opening"); assert.equal(restarted.hand.length, 7);
  assert.equal(restarted.life, 20); assert.equal(restarted.manaPool.U, 0); assert.equal(restarted.battlefield.length, 0);
  assert.equal(withMana.battlefield.length, 1, "restart can be undone from the original snapshot");
  assert.equal(restartGoldfishGame({ ...withMana, onThePlay: false }).onThePlay, false);
  const old = cloneGoldfishState(state); delete old.manaPool;
  assert.equal(restoreGoldfishGame(old).manaPool.U, 0);
});

test("returning multiple cards keeps top/bottom order; return-and-shuffle conserves every card", () => {
  const { state } = game([island]);
  const ids = state.hand.slice(0, 2).map((card) => card.id);
  const top = moveGoldfishCards(state, ids, "libraryTop");
  assert.deepEqual(top.library.slice(-2).map((card) => card.id).reverse(), ids);
  const bottom = moveGoldfishCards(state, ids, "libraryBottom");
  assert.deepEqual(bottom.library.slice(0, 2).map((card) => card.id), ids);
  const shuffled = moveGoldfishCards(state, ids, "libraryShuffle");
  assert.equal(shuffled.library.length, state.library.length + 2);
  assert.deepEqual(shuffled.library.map((card) => card.id).sort(), [...state.library.map((card) => card.id), ...ids].sort());
});

test("explicit exile play pays mana atomically; ordinary casting never consumes an exiled card", () => {
  const { state, id } = game([island], spell("{U}"));
  const exiled = moveGoldfishCards(state, [id], "exile");
  assert.throws(() => castGoldfishCard(exiled, id), /手札/);
  const played = castGoldfishCard(exiled, id, { fromExile: true });
  assert.equal(played.exile.length, 0); assert.equal(played.stack.at(-1).id, id);
  assert.equal(played.hand.length, exiled.hand.length); assert.equal(played.battlefield[0].tapped, true);
  assert.equal(exiled.exile.length, 1); assert.equal(exiled.battlefield[0].tapped, false);
});

test("deck text exposes explicit top-card and draw shortcuts without automatically executing triggers or opponent effects", () => {
  const channeler = goldfishCardOperations({ oracleText: "Whenever you cast a noncreature spell, surveil 1." });
  assert.deepEqual(channeler.operations.map(({ kind, count }) => [kind, count]), [["surveil", 1]]);
  const iteration = goldfishCardOperations({ oracleText: "Look at the top three cards of your library. Put one of them into your hand, put one on the bottom of your library, and exile one." });
  assert.equal(iteration.operations[0].count, 3);
  const fullIteration = goldfishCardOperations({ oracleText: "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them. You may play the exiled card this turn." });
  assert.deepEqual(fullIteration.operations[0].destinations, { hand: 1, exile: 1, libraryBottom: 1 });
  assert.equal(goldfishCardOperations({ oracleText: "Scry 2. Draw a card." }).operations.length, 2);
  assert.equal(goldfishCardOperations({ oracleText: "Draw two cards, then discard two cards." }).operations[0].count, 2);
  assert.equal(goldfishCardOperations({ oracleText: "Target opponent draws three cards." }).operations.length, 0);
});
