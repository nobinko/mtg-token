import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, chooseGoldfishRule, restoreGoldfishGame, advanceGoldfishGame, nextGoldfishTurn, untapGoldfishAll } from "../public/goldfish.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { castGoldfishCard, chooseGoldfishCast, setGoldfishMana, goldfishCastingCost, planGoldfishCastPayment } from "../public/goldfish-mana.js";
import { castGoldfishAlternative } from "../public/goldfish-alternatives.js";
import { activateGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { verifiedGoldfishCard } from "../public/goldfish-card-programs.js";
import { settle } from "./helpers/goldfish-pilot.js";

const fixtures = ["standard", "legacy", "pioneer"].map(format => JSON.parse(readFileSync(new URL(`./fixtures/goldfish-${format}-top10.json`, import.meta.url))));
const metadata = fixtures.flatMap(f => f.metadata);
// Focused rule scenarios use real retrieved Oracle, with an explicit prepared
// position. They are not opening-to-win coverage of the thirty archetypes.
function scenario(names) {
  const rows = Object.entries(names).map(([name, count]) => ({ name, count }));
  rows.push({ name: "Forest", count: 60 - rows.reduce((n, c) => n + c.count, 0) });
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, metadata), { random: () => .5 }));
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const find = (s, name, zone = "battlefield") => s[zone].find(c => c.name === name);
function put(s, name, zone = "hand") { return moveGoldfishCards(s, find(s, name, "library").id, zone); }
function funds(s, pool) { for (const [color, count] of Object.entries(pool)) s = setGoldfishMana(s, color, count); return s; }
const saved = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));
const opponent = { player: "opponent", virtual: true };

test("all three formats have ten distinct sourced lists and verified Oracle metadata", () => {
  for (const f of fixtures) {
    assert.equal(f.decks.length, 10); assert.equal(new Set(f.decks.map(d => d.archetype)).size, 10);
    for (const d of f.decks) { assert.match(d.url, /mtgtop8.com\/event\?/); assert.ok(d.mainboard.reduce((n, c) => n + c.count, 0) >= 60); }
    for (const c of f.metadata) { assert.ok(!c.unavailable, c.name); assert.ok(verifiedGoldfishCard(c), c.name); }
  }
});

test("Force of Will pays one life and one blue card on either player's turn, with atomic cancellation", () => {
  let s = scenario({ "Force of Will": 1, Ponder: 1 });
  s = put(put(s, "Force of Will"), "Ponder");
  const id = find(s, "Force of Will", "hand").id;
  const pending = castGoldfishAlternative(s, id, "force-will");
  assert.equal(pending.players.self.life, 20); assert.equal(pending.hand.length, 2);
  s = settle(castGoldfishAlternative(s, id, "force-will", { refs: [ref(find(s, "Ponder", "hand"), "hand")], target: opponent }));
  assert.equal(s.players.self.life, 19); assert.equal(s.exile[0].name, "Ponder"); assert.equal(s.graveyard[0].name, "Force of Will");
  assert.equal(s.rules.spellsCast, 1);
});

test("Daze returns a tapped Island as its alternative cost without spending mana", () => {
  let s = put(put(scenario({ Daze: 1, Island: 1 }), "Island", "battlefield"), "Daze");
  find(s, "Island").tapped = true;
  s = settle(castGoldfishAlternative(s, find(s, "Daze", "hand").id, "daze", { refs: [ref(find(s, "Island"))], target: opponent }));
  assert.equal(s.hand[0].name, "Island"); assert.equal(s.battlefield.length, 0); assert.equal(s.players.self.life, 20);
});

test("Bitter Triumph waits for the additional cost, cancels for free, and pays discard or life once", () => {
  let s = funds(put(put(scenario({ "Bitter Triumph": 2, Island: 1 }), "Bitter Triumph"), "Island"), { B: 2 });
  const id = find(s, "Bitter Triumph", "hand").id;
  const pending = castGoldfishCard(s, id);
  assert.equal(pending.rules.pendingChoice.optionKey, "extraCost");
  assert.equal(chooseGoldfishCast(saved(pending), { cancel: true }).manaPool.B, 2);
  s = settle(castGoldfishCard(s, id, { extraCost: "discard", costCards: [ref(find(s, "Island", "hand"), "hand")], target: opponent }));
  assert.equal(s.players.self.life, 20); assert.equal(s.graveyard.length, 2); assert.equal(s.manaPool.B, 0);
  s = funds(put(s, "Bitter Triumph"), { B: 2 });
  s = settle(castGoldfishCard(s, find(s, "Bitter Triumph", "hand").id, { extraCost: "life", target: opponent }));
  assert.equal(s.players.self.life, 17);
});

test("Flow State checks both graveyard types at resolution and Stock Up takes two", () => {
  let s = scenario({ "Flow State": 1, "Stock Up": 1, Ponder: 1, "Force of Will": 1 });
  s = funds(put(put(put(s, "Flow State"), "Ponder", "graveyard"), "Force of Will", "graveyard"), { U: 2 });
  s = advanceGoldfishGame(castGoldfishCard(s, find(s, "Flow State", "hand").id));
  assert.equal(s.rules.pendingChoice.min, 2); assert.equal(s.rules.pendingChoice.max, 2);
  s = settle(s); assert.equal(s.hand.length, 2);
  s = funds(put(s, "Stock Up"), { U: 3 });
  s = settle(castGoldfishCard(s, find(s, "Stock Up", "hand").id)); assert.equal(s.hand.length, 4);
});

test("Murktide delve pays only generic mana, tracks spell cards, and forgets counters on reentry", () => {
  let s = scenario({ "Murktide Regent": 1, Ponder: 1, "Force of Will": 1, Island: 3 });
  s = put(put(put(s, "Murktide Regent"), "Ponder", "graveyard"), "Force of Will", "graveyard");
  for (let i = 0; i < 3; i++) s = put(s, "Island", "graveyard");
  s = funds(s, { U: 2 });
  const refs = s.graveyard.map(c => ref(c, "graveyard")), id = find(s, "Murktide Regent", "hand").id;
  assert.equal(goldfishCastingCost(find(s, "Murktide Regent", "hand"), { state: s, delve: refs }), "{0}{U}{U}");
  s = settle(castGoldfishCard(s, id, { delve: refs }));
  assert.equal(find(s, "Murktide Regent").counters["+1/+1"], 2); assert.equal(goldfishCharacteristics(s, find(s, "Murktide Regent")).power, "5");
  assert.equal(s.exile.length, 5); assert.equal(s.manaPool.U, 0);
  s = moveGoldfishCards(s, id, "hand"); s = settle(moveGoldfishCards(s, id, "battlefield"));
  assert.equal(find(s, "Murktide Regent").counters["+1/+1"] || 0, 0);
});

test("delve preview reserves no cards and Trinisphere does not impose a second payment", () => {
  let s = scenario({ "Murktide Regent": 1, Trinisphere: 1, Island: 5 });
  s = put(put(s, "Murktide Regent"), "Trinisphere", "battlefield");
  for (let i = 0; i < 5; i++) s = put(s, "Island", "graveyard");
  s = funds(s, { U: 2 });
  const card = find(s, "Murktide Regent", "hand"), before = JSON.stringify(s);
  assert.equal(planGoldfishCastPayment(s, card, { preview: true }).payable, true);
  assert.equal(JSON.stringify(s), before);
  const pending = castGoldfishCard(s, card.id);
  assert.equal(pending.rules.pendingChoice.optionKey, "delve");
  assert.equal(chooseGoldfishCast(saved(pending), { cancel: true }).graveyard.length, 5);
  s = settle(castGoldfishCard(s, card.id, { delve: s.graveyard.map(c => ref(c, "graveyard")) }));
  assert.equal(s.manaPool.U, 0); assert.ok(find(s, "Murktide Regent"));
});

test("Diamond discards as a cost and allows only three mana of one color after reload", () => {
  let s = put(put(scenario({ "Lion's Eye Diamond": 1, Ponder: 1 }), "Lion's Eye Diamond", "battlefield"), "Ponder");
  s = activateGoldfishAction(s, find(s, "Lion's Eye Diamond").id, "engine:diamond");
  assert.equal(s.hand.length, 0); assert.equal(s.graveyard.length, 2);
  assert.throws(() => chooseGoldfishRule(saved(s), { colors: ["U", "B", "R"] }), /同じ色/);
  s = settle(chooseGoldfishRule(saved(s), { colors: ["B", "B", "B"] })); assert.equal(s.manaPool.B, 3); assert.equal(s.rules.spellsCast, 0);
});

test("Spyglass Siren's Map explores a nonland, adds a counter and can retain it on top", () => {
  let s = funds(put(scenario({ "Spyglass Siren": 1, Ponder: 1 }), "Spyglass Siren"), { U: 1 });
  s = settle(castGoldfishCard(s, find(s, "Spyglass Siren", "hand").id));
  s = moveGoldfishCards(s, find(s, "Ponder", "library").id, "libraryTop"); s = funds(s, { U: 1 });
  s = advanceGoldfishGame(activateGoldfishAction(s, find(s, "Map").id, "engine:map-explore", { target: ref(find(s, "Spyglass Siren")) }));
  assert.equal(find(s, "Spyglass Siren").counters["+1/+1"], 1);
  s = settle(chooseGoldfishRule(saved(s), { refs: [] })); assert.equal(s.library.at(-1).name, "Ponder"); assert.ok(!find(s, "Map"));
});

test("Sheoldred triggers once per drawn card; taking a card from a look is not drawing", () => {
  let s = scenario({ "Sheoldred, the Apocalypse": 1, Brainstorm: 1, "Stock Up": 1 });
  s = funds(put(put(s, "Sheoldred, the Apocalypse", "battlefield"), "Brainstorm"), { U: 1 });
  s = settle(castGoldfishCard(s, find(s, "Brainstorm", "hand").id)); assert.equal(s.players.self.life, 26);
  s = funds(find(s, "Stock Up", "hand") ? s : put(s, "Stock Up"), { U: 3 });
  s = settle(castGoldfishCard(s, find(s, "Stock Up", "hand").id)); assert.equal(s.players.self.life, 26);
});

test("Tendrils storm copies drain life without increasing the spell count", () => {
  let s = funds(put(put(scenario({ "Dark Ritual": 1, "Tendrils of Agony": 1 }), "Dark Ritual"), "Tendrils of Agony"), { B: 2 });
  s = settle(castGoldfishCard(s, find(s, "Dark Ritual", "hand").id));
  s = settle(castGoldfishCard(s, find(s, "Tendrils of Agony", "hand").id, { target: { player: "opponent" } }));
  assert.equal(s.players.opponent.life, 16); assert.equal(s.players.self.life, 24); assert.equal(s.rules.spellsCast, 2);
});

test("Cryomancer's reflexive trigger counts discarded nonlands and offers real stun targets", () => {
  let s = scenario({ "Seasoned Cryomancer": 1, "Spyglass Siren": 1, Ponder: 1, Island: 1 });
  s = funds(put(put(put(put(s, "Seasoned Cryomancer"), "Ponder"), "Island"), "Spyglass Siren", "battlefield"), { U: 3 });
  let sawTargets = false;
  s = settle(castGoldfishCard(s, find(s, "Seasoned Cryomancer", "hand").id), [], (c, state) => {
    if (c.kind === "cards" && c.label === "捨てる手札2枚") return { refs: [ref(find(state, "Ponder", "hand"), "hand"), ref(find(state, "Island", "hand"), "hand")] };
    if (c.type === "engine-target") { sawTargets = true; assert.equal(c.min, 0); assert.equal(c.max, 1); return { refs: [ref(find(state, "Spyglass Siren"), "battlefield")] }; }
    return null;
  });
  assert.equal(sawTargets, true); assert.equal(find(s, "Spyglass Siren").tapped, true); assert.equal(find(s, "Spyglass Siren").counters.stun, 1);
  s = settle(nextGoldfishTurn(s));
  assert.equal(find(s, "Spyglass Siren").tapped, true); assert.equal(find(s, "Spyglass Siren").counters.stun || 0, 0);
  s = settle(nextGoldfishTurn(s)); assert.equal(find(s, "Spyglass Siren").tapped, false);
});

test("stun counters replace an actual untap, and exertion skips it without consuming stun", () => {
  let s = put(scenario({ "Spyglass Siren": 1 }), "Spyglass Siren", "battlefield");
  find(s, "Spyglass Siren").counters.stun = 2;
  s = untapGoldfishAll(s); assert.equal(find(s, "Spyglass Siren").counters.stun, 2);
  find(s, "Spyglass Siren").tapped = true; find(s, "Spyglass Siren").exerted = true;
  s = settle(nextGoldfishTurn(s)); assert.equal(find(s, "Spyglass Siren").counters.stun, 2);
  s = untapGoldfishAll(s); assert.equal(find(s, "Spyglass Siren").counters.stun, 1); assert.equal(find(s, "Spyglass Siren").tapped, true);
});

test("Crop Rotation sacrifices its chosen land and Map/Lander choices preserve search rules", () => {
  let s = funds(put(put(scenario({ "Crop Rotation": 1, Island: 1, "Biotech Specialist": 1 }), "Crop Rotation"), "Island", "battlefield"), { G: 1 });
  const land = find(s, "Island"), rotation = find(s, "Crop Rotation", "hand");
  assert.equal(castGoldfishCard(s, rotation.id).rules.pendingChoice.optionKey, "costCards");
  s = settle(castGoldfishCard(s, rotation.id, { costCards: [ref(land)] }), [], c => c.kind === "cards" ? { refs: [c.candidates.find(c => c.label === "Forest").ref] } : null);
  assert.ok(find(s, "Forest")); assert.equal(find(s, "Forest").tapped, false); assert.ok(find(s, "Island", "graveyard"));
  s = funds(put(s, "Biotech Specialist"), { G: 1, R: 1 });
  s = settle(castGoldfishCard(s, find(s, "Biotech Specialist", "hand").id));
  s = funds(s, { C: 2 });
  s = settle(activateGoldfishAction(s, find(s, "Lander").id, "engine:lander"));
  assert.equal(s.battlefield.filter(c => c.name === "Forest" && c.tapped).length, 1);
  assert.equal(s.players.opponent.life, 18);
});

test("Bitter Triumph rejects stale/disallowed additional costs before any payment", () => {
  let s = funds(put(put(scenario({ "Bitter Triumph": 1, Island: 1, Ponder: 1 }), "Bitter Triumph"), "Island"), { B: 2 });
  const id = find(s, "Bitter Triumph", "hand").id, oldRef = ref(find(s, "Island", "hand"), "hand");
  s = moveGoldfishCards(moveGoldfishCards(s, oldRef.id, "graveyard"), oldRef.id, "hand");
  const before = JSON.stringify(s);
  assert.throws(() => castGoldfishCard(s, id, { extraCost: "discard", costCards: [oldRef], target: opponent }), /追加コスト/);
  assert.throws(() => castGoldfishCard(s, id, { extraCost: "life", costCards: [ref(find(s, "Island", "hand"), "hand")], target: opponent }), /カードは捨てません/);
  assert.equal(JSON.stringify(s), before);
});
