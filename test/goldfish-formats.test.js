import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, chooseGoldfishRule, restoreGoldfishGame, advanceGoldfishGame, nextGoldfishTurn, untapGoldfishAll, drawGoldfishCards } from "../public/goldfish.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { castGoldfishCard, chooseGoldfishCast, setGoldfishMana, goldfishCastingCost, planGoldfishCastPayment } from "../public/goldfish-mana.js";
import { castGoldfishAlternative } from "../public/goldfish-alternatives.js";
import { activateGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
import { goldfishCharacteristics, goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishSpellTargets } from "../public/goldfish-spells.js";
import { goldfishFinish, sideboardGoldfishGame } from "../public/goldfish-sideboard.js";
import { abilityBlockReason } from "../public/goldfish-constraints.js";
import { goldfishLandManaOptions } from "../public/goldfish-mana.js";
import { queueGameAbility } from "../public/goldfish-events.js";
import { verifiedGoldfishCard } from "../public/goldfish-card-programs.js";
import { gameLandTypes } from "../public/goldfish-engine.js";
import { settle } from "./helpers/goldfish-pilot.js";

const fixtures = ["standard", "legacy", "pioneer"].map(format => JSON.parse(readFileSync(new URL(`./fixtures/goldfish-${format}-top10.json`, import.meta.url))));
const metadata = [...fixtures.flatMap(f => f.metadata), ...JSON.parse(readFileSync(new URL("./fixtures/goldfish-top10.json", import.meta.url))).metadata];
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

test("Show and Tell puts Sheltered by Ghosts attached without targeting, or leaves it in hand", () => {
  for (const withCreature of [false, true]) {
    let s = funds(put(put(scenario({ "Show and Tell": 1, "Sheltered by Ghosts": 1, "Spyglass Siren": 1 }), "Show and Tell"), "Sheltered by Ghosts"), { U: 3 });
    if (withCreature) { s = put(s, "Spyglass Siren", "battlefield"); find(s, "Spyglass Siren").temporaryEffects.push({ keywords: ["shroud"], turn: s.turn }); }
    s = settle(castGoldfishCard(s, find(s, "Show and Tell", "hand").id), [], c => c.label === "手札から戦場へ出すカード（0〜1枚）" ? { refs: [c.candidates.find(x => x.label === "Sheltered by Ghosts").ref] } : null);
    if (withCreature) { assert.equal(find(s, "Sheltered by Ghosts").attachedTo.id, find(s, "Spyglass Siren").id); assert.ok(goldfishKeywords(s, find(s, "Spyglass Siren")).has("lifelink")); }
    else { assert.ok(find(s, "Sheltered by Ghosts", "hand")); assert.ok(!find(s, "Sheltered by Ghosts", "graveyard")); }
  }
});

test("Yavimaya and Urborg grant mana only on the battlefield and lose their effects under Blood Moon", () => {
  let s = scenario({ "Yavimaya, Cradle of Growth": 1, "Urborg, Tomb of Yawgmoth": 1, Wasteland: 1, Island: 1, "Life from the Loam": 1, "Blood Moon": 1 });
  s = put(put(put(s, "Yavimaya, Cradle of Growth", "battlefield"), "Wasteland", "battlefield"), "Life from the Loam");
  assert.equal(planGoldfishCastPayment(s, find(s, "Life from the Loam", "hand"), { preview: true }).payable, true);
  assert.deepEqual(gameLandTypes(s, find(s, "Island", "library")), ["Island"]);
  s = put(s, "Urborg, Tomb of Yawgmoth", "battlefield");
  assert.ok(goldfishLandManaOptions(find(s, "Wasteland"), s).some(o => o.pool.B === 1));
  s = put(s, "Blood Moon", "battlefield");
  for (const land of s.battlefield.filter(c => c.name !== "Blood Moon")) assert.deepEqual(gameLandTypes(s, land), ["Mountain"]);
  const y = find(s, "Yavimaya, Cradle of Growth");
  s = moveGoldfishCards(moveGoldfishCards(s, y.id, "hand"), y.id, "battlefield");
  assert.deepEqual(gameLandTypes(s, find(s, "Wasteland")), ["Mountain"]);
  s = moveGoldfishCards(s, find(s, "Blood Moon").id, "graveyard");
  assert.ok(gameLandTypes(s, find(s, "Wasteland")).includes("Forest"));
});

test("Get Out locks one or two owned permanents before payment and rechecks each target", () => {
  let s = funds(put(put(put(scenario({ "Get Out": 1, "Spyglass Siren": 2 }), "Get Out"), "Spyglass Siren", "battlefield"), "Spyglass Siren", "battlefield"), { U: 2 });
  s = settle(s);
  const targets = s.battlefield.filter(c => c.name === "Spyglass Siren").map(c => ref(c, "battlefield"));
  const pending = castGoldfishCard(s, find(s, "Get Out", "hand").id);
  assert.equal(pending.rules.pendingChoice.optionKey, "mode"); assert.equal(pending.manaPool.U, 2);
  assert.equal(chooseGoldfishCast(saved(pending), { cancel: true }).manaPool.U, 2);
  s = castGoldfishCard(s, find(s, "Get Out", "hand").id, { mode: "return", modeTargets: targets });
  s = moveGoldfishCards(s, targets[0].id, "exile");
  s = settle(saved(s)); assert.equal(s.hand.length, 1); assert.equal(s.hand[0].id, targets[1].id); assert.equal(s.manaPool.U, 0);
});

test("Tear Asunder checks its kicked target restriction before spending and exiles it", () => {
  let s = settle(put(scenario({ "Tear Asunder": 1, "Spyglass Siren": 1 }), "Spyglass Siren", "battlefield"));
  s = funds(put(s, "Tear Asunder"), { G: 1, B: 3 });
  const id = find(s, "Tear Asunder", "hand").id, target = ref(find(s, "Spyglass Siren"), "battlefield");
  assert.throws(() => castGoldfishCard(s, id, { modeTargets: [target] }), /対象/);
  assert.equal(s.manaPool.B, 3);
  s = settle(castGoldfishCard(s, id, { kicked: true, modeTargets: [target] }));
  assert.equal(s.exile[0].name, "Spyglass Siren"); assert.equal(s.manaPool.B, 0);
});

test("Winternight Stories chooses a creature or two discards and harmonizes with a summoning-sick creature", () => {
  let s = scenario({ "Winternight Stories": 1, "Spyglass Siren": 2, "Murktide Regent": 1 });
  s = put(put(s, "Winternight Stories"), "Spyglass Siren"); s = funds(s, { U: 3 });
  s = settle(castGoldfishCard(s, find(s, "Winternight Stories", "hand").id), [], (c, state) => {
    if (c.label === "捨て方を選ぶ") return { value: "creature" };
    if (c.label === "捨てる手札") return { refs: [ref(find(state, "Spyglass Siren", "hand"), "hand")] };
    return null;
  });
  assert.equal(s.hand.length, 3); assert.ok(find(s, "Winternight Stories", "graveyard"));
  // Explicit prepared position: a 4-power creature can pay the tap cost even
  // on its entry turn; it may not also produce mana for the same payment.
  if (!find(s, "Murktide Regent", "hand")) s = put(s, "Murktide Regent");
  s = settle(moveGoldfishCards(s, find(s, "Murktide Regent", "hand").id, "battlefield"));
  find(s, "Murktide Regent").counters["+1/+1"] = 1;
  s = funds(s, { U: 1 });
  const stories = find(s, "Winternight Stories", "graveyard"), r = ref(find(s, "Murktide Regent"));
  assert.equal(planGoldfishCastPayment(s, stories, { fromGraveyard: true, preview: true }).payable, true);
  const pending = castGoldfishCard(s, stories.id, { fromGraveyard: true });
  assert.equal(pending.rules.pendingChoice.optionKey, "harmonizeTap"); assert.equal(find(pending, "Murktide Regent").tapped, false);
  s = settle(chooseGoldfishCast(saved(pending), { refs: [r] }));
  assert.equal(find(s, "Murktide Regent").tapped, true); assert.equal(s.manaPool.U, 0); assert.ok(find(s, "Winternight Stories", "exile"));
});

test("Lively Dirge pays for both modes and chooses reanimation after its tutor with a total MV cap", () => {
  let s = funds(put(scenario({ "Lively Dirge": 1, "Cauldron Familiar": 1, "Sheoldred, the Apocalypse": 1 }), "Lively Dirge"), { B: 5 });
  s = put(s, "Sheoldred, the Apocalypse", "graveyard");
  s = advanceGoldfishGame(castGoldfishCard(s, find(s, "Lively Dirge", "hand").id, { mode: "both" }));
  assert.equal(s.manaPool.B, 0);
  s = advanceGoldfishGame(chooseGoldfishRule(saved(s), { refs: [ref(find(s, "Cauldron Familiar", "library"), "library")] }));
  assert.match(s.rules.pendingChoice.label, /合計マナ総量4/);
  assert.throws(() => chooseGoldfishRule(saved(s), { refs: s.graveyard.map(c => ref(c, "graveyard")) }), /合計マナ総量/);
  s = settle(chooseGoldfishRule(saved(s), { refs: [ref(find(s, "Cauldron Familiar", "graveyard"), "graveyard")] }));
  assert.ok(find(s, "Cauldron Familiar")); assert.equal(s.players.opponent.life, 19);
});

test("Familiar and Oven loop uses Food costs, ETB drain and the sacrificed creature's current toughness", () => {
  let s = funds(put(put(scenario({ "Cauldron Familiar": 1, "Witch's Oven": 1 }), "Witch's Oven", "battlefield"), "Cauldron Familiar"), { B: 1 });
  s = settle(castGoldfishCard(s, find(s, "Cauldron Familiar", "hand").id));
  find(s, "Cauldron Familiar").counters["+1/+1"] = 3;
  const familiarId = find(s, "Cauldron Familiar").id;
  s = settle(activateGoldfishAction(s, find(s, "Witch's Oven").id, "engine:oven", { costCards: [ref(find(s, "Cauldron Familiar"), "battlefield")] }));
  assert.equal(s.battlefield.filter(c => c.name === "Food").length, 2);
  const pending = activateGoldfishAction(s, familiarId, "engine:familiar-return"); assert.equal(pending.battlefield.filter(c => c.name === "Food").length, 2);
  s = settle(activateGoldfishAction(s, familiarId, "engine:familiar-return", { costCards: [ref(find(s, "Food"), "battlefield")] }));
  assert.equal(s.battlefield.filter(c => c.name === "Food").length, 1); assert.ok(find(s, "Cauldron Familiar"));
  assert.equal(s.players.self.life, 22); assert.equal(s.players.opponent.life, 18);
  s = funds(s, { B: 2 }); s = settle(activateGoldfishAction(s, find(s, "Food").id, "engine:food")); assert.equal(s.players.self.life, 25);
});

test("Monstrous Rage makes and replaces a Role, keeps the temporary pumps, and loses the Role with its creature", () => {
  let s = settle(put(scenario({ "Monstrous Rage": 2, "Cauldron Familiar": 1 }), "Cauldron Familiar", "battlefield"));
  s = funds(s, { R: 2 });
  for (let i = 0; i < 2; i++) { s = put(s, "Monstrous Rage"); s = settle(castGoldfishCard(s, find(s, "Monstrous Rage", "hand").id, { target: ref(find(s, "Cauldron Familiar")) })); }
  assert.equal(s.battlefield.filter(c => c.name === "Monster Role").length, 1);
  assert.equal(goldfishCharacteristics(s, find(s, "Cauldron Familiar")).power, "6"); assert.ok(goldfishKeywords(s, find(s, "Cauldron Familiar")).has("trample"));
  s = settle(moveGoldfishCards(s, find(s, "Cauldron Familiar").id, "hand")); assert.equal(s.battlefield.length, 0);
});

test("Fleshraker triggers for the Spawn and each other colorless creature without duplicate manual triggers", () => {
  let s = settle(put(scenario({ "Glaring Fleshraker": 2 }), "Glaring Fleshraker", "battlefield"));
  s = funds(s, { C: 4 });
  assert.equal(s.players.opponent.life, 20); // does not trigger for itself
  s = put(s, "Glaring Fleshraker"); s = settle(castGoldfishCard(s, find(s, "Glaring Fleshraker", "hand").id));
  assert.equal(s.battlefield.filter(c => c.name === "Eldrazi Spawn").length, 1); assert.equal(s.players.opponent.life, 18);
});

test("Static Prison consumes energy only on its controller's first main and sacrifices when unpaid", () => {
  let s = funds(put(scenario({ "Static Prison": 1 }), "Static Prison"), { W: 1 });
  s = settle(castGoldfishCard(s, find(s, "Static Prison", "hand").id));
  assert.equal(s.players.self.energy, 2);
  s = settle(nextGoldfishTurn(s), [], c => c.label === "静牢を維持しますか？" ? { value: "pay" } : null);
  assert.equal(s.players.self.energy, 1); assert.ok(find(s, "Static Prison"));
  s = settle(nextGoldfishTurn(s), [], c => c.label === "静牢を維持しますか？" ? { value: "sacrifice" } : null);
  assert.equal(s.players.self.energy, 1); assert.ok(find(s, "Static Prison", "graveyard"));
});

test("Stifle targets abilities rather than spells and leaves their source in play", () => {
  let s = settle(put(scenario({ Stifle: 1, "Spyglass Siren": 1 }), "Spyglass Siren", "battlefield"));
  s = funds(put(s, "Stifle"), { U: 1 });
  queueGameAbility(s, find(s, "Spyglass Siren"), "テスト用の起動：ドロー", [{ op: "draw", count: 1 }], { activated: true });
  const target = ref(s.stack.at(-1), "stack");
  assert.ok(goldfishSpellTargets(s, find(s, "Stifle", "hand")).some(t => t.ref.id === target.id));
  s = settle(castGoldfishCard(s, find(s, "Stifle", "hand").id, { target }));
  assert.equal(s.hand.length, 0); assert.ok(find(s, "Spyglass Siren"));
});

test("Doomsday chooses and orders five real cards, halves life, then Oracle can win with devotion", () => {
  let s = funds(put(scenario({ Doomsday: 1, "Thassa's Oracle": 1, Ponder: 1, Island: 3 }), "Doomsday"), { B: 3 });
  s = advanceGoldfishGame(castGoldfishCard(s, find(s, "Doomsday", "hand").id));
  const names = ["Thassa's Oracle", "Ponder", "Island", "Island", "Island"];
  const remaining = [...s.library], selected = names.map(n => { const i = remaining.findIndex(c => c.name === n); return ref(remaining.splice(i, 1)[0], "library"); });
  s = advanceGoldfishGame(chooseGoldfishRule(saved(s), { refs: selected }));
  const candidates = [...s.rules.pendingChoice.candidates];
  const ordered = names.map(n => candidates.splice(candidates.findIndex(c => c.label === n), 1)[0].ref);
  s = settle(chooseGoldfishRule(saved(s), { refs: ordered }));
  assert.equal(s.library.length, 5); assert.equal(s.library.at(-1).name, "Thassa's Oracle"); assert.equal(s.players.self.life, 10); assert.equal(s.exile.length, 54);
  // Prepare the post-cantrip end of the pile explicitly for this rule test.
  s = moveGoldfishCards(s, s.library.slice(-3).map(c => c.id), "hand"); s = funds(s, { U: 2 });
  s = settle(castGoldfishCard(s, find(s, "Thassa's Oracle", "hand").id)); assert.equal(goldfishFinish(s)?.kind, "win");
});

test("Oracle uses devotion at resolution even if its source leaves, including zero with an empty library", () => {
  let s = funds(put(scenario({ "Thassa's Oracle": 1 }), "Thassa's Oracle"), { U: 2 });
  s = castGoldfishCard(s, find(s, "Thassa's Oracle", "hand").id);
  // Resolve only the permanent, retaining its triggered ability on the stack.
  return import("../public/goldfish.js").then(({ resolveGoldfishSpell }) => {
    s = resolveGoldfishSpell(s);
    s = moveGoldfishCards(s, find(s, "Thassa's Oracle").id, "graveyard");
    s = moveGoldfishCards(s, s.library.map(c => c.id), "exile");
    s = settle(s); assert.equal(goldfishFinish(s)?.kind, "win");
  });
});

test("Petrified Hamlet names a land, stops its nonmana ability and grants colorless mana", () => {
  let s = put(scenario({ "Petrified Hamlet": 1, "Boseiju, Who Endures": 1 }), "Petrified Hamlet");
  s = settle(castGoldfishCard(s, find(s, "Petrified Hamlet", "hand").id), [], c => c.kind === "name" ? { value: "Boseiju, Who Endures" } : null);
  s = put(s, "Boseiju, Who Endures");
  assert.match(abilityBlockReason(s, find(s, "Boseiju, Who Endures", "hand"), { zone: "hand" }), /集落/);
  s = moveGoldfishCards(s, find(s, "Boseiju, Who Endures", "hand").id, "battlefield");
  assert.ok(goldfishLandManaOptions(find(s, "Boseiju, Who Endures"), s).some(o => o.pool.C === 1));
  assert.equal(abilityBlockReason(s, find(s, "Boseiju, Who Endures"), { manaAbility: true }), "");
});

test("Vibrance counts actual red and green mana separately, including evoke and blink resets", () => {
  let s = funds(put(scenario({ Vibrance: 2, "Essence Flux": 1 }), "Vibrance"), { G: 2 });
  s = settle(castGoldfishAlternative(s, find(s, "Vibrance", "hand").id, "evoke", { refs: [] }));
  assert.equal(s.players.self.life, 22); assert.equal(s.players.opponent.life, 20); assert.ok(find(s, "Vibrance", "graveyard")); assert.equal(s.hand.length, 1);
  s = funds(put(s, "Vibrance"), { R: 2, G: 3 });
  s = settle(castGoldfishCard(s, find(s, "Vibrance", "hand").id));
  assert.equal(s.players.self.life, 24); assert.equal(s.players.opponent.life, 17); assert.equal(s.hand.length, 2);
  s = funds(put(s, "Essence Flux"), { U: 1 });
  s = settle(castGoldfishCard(s, find(s, "Essence Flux", "hand").id, { target: ref(find(s, "Vibrance")) }));
  assert.equal(s.players.self.life, 24); assert.equal(s.players.opponent.life, 17); assert.equal(s.hand.length, 2);
});

test("Sheltered by Ghosts targets our creature, attaches, grants stats and falls off when it leaves", () => {
  let s = funds(put(put(scenario({ "Sheltered by Ghosts": 1, "Spyglass Siren": 1, "Get Out": 1 }), "Spyglass Siren", "battlefield"), "Sheltered by Ghosts"), { W: 2 });
  s = settle(castGoldfishCard(s, find(s, "Sheltered by Ghosts", "hand").id, { target: ref(find(s, "Spyglass Siren")) }));
  assert.equal(find(s, "Sheltered by Ghosts").attachedTo.id, find(s, "Spyglass Siren").id);
  assert.equal(goldfishCharacteristics(s, find(s, "Spyglass Siren")).power, "2"); assert.ok(goldfishKeywords(s, find(s, "Spyglass Siren")).has("lifelink"));
  s = funds(put(s, "Get Out"), { U: 2 });
  s = settle(castGoldfishCard(s, find(s, "Get Out", "hand").id, { mode: "return", modeTargets: [ref(find(s, "Spyglass Siren"), "battlefield")] }));
  assert.ok(find(s, "Sheltered by Ghosts", "graveyard")); assert.equal(s.battlefield.length, 0);
});

test("Pinnacle Starcage returns linked cards on leaving and its activation counts only cards reaching the graveyard", () => {
  let s = funds(put(put(scenario({ "Pinnacle Starcage": 1, "Cauldron Familiar": 1 }), "Cauldron Familiar", "battlefield"), "Pinnacle Starcage"), { W: 3 });
  s = settle(castGoldfishCard(s, find(s, "Pinnacle Starcage", "hand").id));
  assert.equal(s.exile.length, 1); assert.equal(find(s, "Pinnacle Starcage").boundCards.length, 1);
  s = funds(s, { W: 8 }); s = settle(activateGoldfishAction(s, find(s, "Pinnacle Starcage").id, "engine:starcage"));
  assert.ok(find(s, "Cauldron Familiar", "graveyard")); assert.equal(s.battlefield[0].name, "Robot"); assert.equal(s.exile.length, 0);
});

test("Prismari's divided damage and Theorix's shrink apply state actions before another spell", () => {
  let s = funds(put(put(scenario({ "Prismari Charm": 1, "Theorix Charm": 1, "Cauldron Familiar": 1 }), "Cauldron Familiar", "battlefield"), "Prismari Charm"), { U: 1, R: 1 });
  s = settle(castGoldfishCard(s, find(s, "Prismari Charm", "hand").id, { mode: "damage", modeTargets: [ref(find(s, "Cauldron Familiar"), "battlefield"), { player: "opponent" }] }));
  assert.ok(find(s, "Cauldron Familiar", "graveyard")); assert.equal(s.players.opponent.life, 19);
  s = moveGoldfishCards(s, find(s, "Cauldron Familiar", "graveyard").id, "battlefield");
  s = funds(put(s, "Theorix Charm"), { U: 1, B: 1 });
  s = settle(castGoldfishCard(s, find(s, "Theorix Charm", "hand").id, { mode: "shrink", modeTargets: [ref(find(s, "Cauldron Familiar"), "battlefield")] }));
  assert.ok(find(s, "Cauldron Familiar", "graveyard"));
});

test("Practiced Offense counters the whole chosen team, selects a keyword, and flashes back", () => {
  let s = funds(put(put(scenario({ "Practiced Offense": 1, "Cauldron Familiar": 1 }), "Cauldron Familiar", "battlefield"), "Practiced Offense"), { W: 3 });
  const target = ref(find(s, "Cauldron Familiar"), "battlefield");
  s = settle(castGoldfishCard(s, find(s, "Practiced Offense", "hand").id, { mode: "self", modeTargets: [target] }));
  assert.equal(find(s, "Cauldron Familiar").counters["+1/+1"], 1); assert.ok(goldfishKeywords(s, find(s, "Cauldron Familiar")).has("double strike"));
  s = funds(s, { W: 2 }); s = settle(castGoldfishCard(s, find(s, "Practiced Offense", "graveyard").id, { fromGraveyard: true, mode: "self", modeTargets: [target] }), [], c => c.label === "クリーチャーに与える能力" ? { value: "lifelink" } : null);
  assert.ok(find(s, "Practiced Offense", "exile")); assert.equal(find(s, "Cauldron Familiar").counters["+1/+1"], 2); assert.ok(goldfishKeywords(s, find(s, "Cauldron Familiar")).has("lifelink"));
});

test("Sunspine Lynx uses our actual nonbasics, asks only the omitted opponent count, and prevents life gain", () => {
  let s = funds(put(put(scenario({ "Sunspine Lynx": 1, "Cauldron Familiar": 1, "Boseiju, Who Endures": 1 }), "Sunspine Lynx"), "Boseiju, Who Endures", "battlefield"), { R: 4 });
  s = settle(castGoldfishCard(s, find(s, "Sunspine Lynx", "hand").id), [], c => c.kind === "number" ? { value: 3 } : null);
  assert.equal(s.players.self.life, 19); assert.equal(s.players.opponent.life, 17);
  s = funds(put(s, "Cauldron Familiar"), { B: 1 }); s = settle(castGoldfishCard(s, find(s, "Cauldron Familiar", "hand").id));
  assert.equal(s.players.self.life, 19); assert.equal(s.players.opponent.life, 16);
});

test("Veil's conditional draw is a necessary opponent choice and protects an already-cast spell from counters", async () => {
  let s = funds(put(put(put(scenario({ "Veil of Summer": 1, Ponder: 1, "Force of Will": 1 }), "Ponder"), "Veil of Summer"), "Force of Will"), { G: 1, U: 6 });
  s = castGoldfishCard(s, find(s, "Ponder", "hand").id);
  const ponder = ref(find(s, "Ponder", "stack"), "stack");
  s = castGoldfishCard(s, find(s, "Veil of Summer", "hand").id);
  const { resolveGoldfishSpell } = await import("../public/goldfish.js");
  s = resolveGoldfishSpell(s); s = chooseGoldfishRule(saved(s), { value: "no" });
  assert.equal(s.hand.length, 1);
  s = castGoldfishCard(s, find(s, "Force of Will", "hand").id, { target: ponder }); s = resolveGoldfishSpell(s);
  assert.ok(find(s, "Ponder", "stack")); s = settle(s); assert.equal(s.hand.length, 1);
});

test("Dredge replaces individual draws, can use a newly milled dredger, and never triggers Sheoldred", () => {
  let s = put(put(scenario({ "Life from the Loam": 2, "Sheoldred, the Apocalypse": 1 }), "Life from the Loam", "graveyard"), "Sheoldred, the Apocalypse", "battlefield");
  const a = find(s, "Life from the Loam", "graveyard").id, b = find(s, "Life from the Loam", "library").id;
  s = moveGoldfishCards(s, b, "libraryTop"); const size = s.library.length;
  s = drawGoldfishCards(s, 2); assert.equal(s.rules.pendingChoice.type, "engine-draw"); assert.equal(s.hand.length, 0);
  s = chooseGoldfishRule(saved(s), { value: s.rules.pendingChoice.candidates.find(c => c.ref.id === a).value });
  assert.equal(s.rules.pendingChoice.type, "engine-draw"); assert.ok(find(s, "Life from the Loam", "hand"));
  s = settle(chooseGoldfishRule(saved(s), { value: s.rules.pendingChoice.candidates.find(c => c.ref.id === b).value }));
  assert.equal(s.hand.length, 2); assert.equal(s.library.length, size - 6); assert.equal(s.players.self.life, 20); assert.ok(!s.rules.drawing);
});

test("Dredge resumes Brainstorm's return selection and Winternight's discard after all draws", () => {
  let s = funds(put(put(scenario({ Brainstorm: 1, "Winternight Stories": 1, "Life from the Loam": 1 }), "Life from the Loam", "graveyard"), "Brainstorm"), { U: 1 });
  s = advanceGoldfishGame(castGoldfishCard(s, find(s, "Brainstorm", "hand").id)); assert.equal(s.rules.pendingChoice.type, "engine-draw");
  s = chooseGoldfishRule(saved(s), { value: s.rules.pendingChoice.candidates[0].value }); assert.equal(s.rules.pendingChoice.type, "spell-return");
  const loam = find(s, "Life from the Loam", "hand"), others = s.hand.filter(c => c.id !== loam.id);
  s = settle(chooseGoldfishRule(saved(s), { ids: others.map(c => c.id) }));
  s = moveGoldfishCards(s, loam.id, "graveyard");
  if (!find(s, "Winternight Stories", "hand")) s = moveGoldfishCards(s, [...s.library, ...s.graveyard].find(c => c.name === "Winternight Stories").id, "hand");
  s = funds(s, { U: 3 }); s = advanceGoldfishGame(castGoldfishCard(s, find(s, "Winternight Stories", "hand").id));
  s = chooseGoldfishRule(saved(s), { value: s.rules.pendingChoice.candidates[0].value }); assert.equal(s.rules.pendingChoice.label, "捨て方を選ぶ");
  s = settle(s); assert.equal(s.hand.length, 1); assert.ok(find(s, "Winternight Stories", "graveyard"));
});

test("Dredge is unavailable without enough cards, and turn draw finishes before the first main trigger", () => {
  let s = funds(put(put(scenario({ "Static Prison": 1, "Life from the Loam": 1 }), "Life from the Loam", "graveyard"), "Static Prison"), { W: 1 });
  s = settle(castGoldfishCard(s, find(s, "Static Prison", "hand").id));
  s = nextGoldfishTurn(s); assert.equal(s.rules.pendingChoice.type, "engine-draw"); assert.equal(s.stack.length, 0);
  assert.match(s.rules.lastAction, /ドローか発掘/); assert.doesNotMatch(s.rules.lastAction, /山札が空/);
  s = advanceGoldfishGame(chooseGoldfishRule(saved(s), { value: s.rules.pendingChoice.candidates[0].value }));
  assert.equal(s.rules.pendingChoice.label, "静牢を維持しますか？"); s = settle(s);
  s = moveGoldfishCards(s, find(s, "Life from the Loam", "hand").id, "graveyard");
  s = moveGoldfishCards(s, s.library.slice(2).map(c => c.id), "exile");
  s = drawGoldfishCards(s, 1); assert.equal(s.rules.pendingChoice, null); assert.equal(s.library.length, 1); assert.ok(find(s, "Life from the Loam", "graveyard"));
});

test("Mox Diamond's discard is an entry replacement, including Show and Tell, and declining never enters", () => {
  let s = put(scenario({ "Mox Diamond": 2, Island: 1, "Show and Tell": 1, "Pinnacle Emissary": 1 }), "Mox Diamond");
  s = settle(castGoldfishCard(s, find(s, "Mox Diamond", "hand").id));
  assert.ok(find(s, "Mox Diamond", "graveyard")); assert.equal(s.battlefield.length, 0); assert.ok(!s.rules.permanentLeft);
  s = funds(put(put(put(s, "Mox Diamond"), "Island"), "Show and Tell"), { U: 3 });
  s = settle(castGoldfishCard(s, find(s, "Show and Tell", "hand").id), [], (c, state) => {
    if (c.label === "手札から戦場へ出すカード（0〜1枚）") return { refs: [ref(find(state, "Mox Diamond", "hand"), "hand")] };
    return null;
  });
  assert.ok(find(s, "Mox Diamond")); assert.ok(find(s, "Island", "graveyard")); assert.equal(s.rules.spellsCast, 2);
});

test("Sackville's token sacrifice trigger works with Oven/Familiar costs, while its ETB sacrifice is optional", () => {
  let s = funds(put(put(scenario({ "The Sackville-Bagginses": 1, "Cauldron Familiar": 1, "Witch's Oven": 1 }), "Witch's Oven", "battlefield"), "The Sackville-Bagginses"), { B: 2 });
  s = settle(castGoldfishCard(s, find(s, "The Sackville-Bagginses", "hand").id), [], c => c.label?.startsWith("生け贄にする別の") ? { refs: [] } : null);
  assert.ok(find(s, "Witch's Oven")); assert.equal(s.hand.length, 0);
  s = moveGoldfishCards(s, find(s, "Cauldron Familiar", "library").id, "battlefield");
  s = settle(activateGoldfishAction(s, find(s, "Witch's Oven").id, "engine:oven", { costCards: [ref(find(s, "Cauldron Familiar"), "battlefield")] }));
  s = settle(activateGoldfishAction(s, find(s, "Cauldron Familiar", "graveyard").id, "engine:familiar-return", { costCards: [ref(find(s, "Food"), "battlefield")] }));
  assert.equal(s.players.opponent.life, 18); assert.equal(s.players.self.life, 21);
});

for (const postboard of [false, true]) test(`real Legacy Doomsday list wins on turn two ${postboard ? "after sideboarding" : "mainboard"} without granting mana or moving setup cards`, () => {
  const f = fixtures[1], deck = f.decks.find(d => d.archetype === "Doomsday");
  let seed = 17; const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  let s = createGoldfishGame(mergeCardMetadata(deck.mainboard, f.metadata), { sideboardRows: mergeCardMetadata(deck.sideboard, f.metadata), random });
  if (postboard) {
    const counts = Object.fromEntries(deck.mainboard.map(c => [c.name, c.count])); counts.Ponder--; counts.Flusterstorm = 1;
    seed = 17; s = sideboardGoldfishGame(s, counts, { random });
    assert.equal(s.deckRows.find(c => c.name === "Flusterstorm").count, 1);
  }
  s = keepGoldfishHand(s);
  assert.equal(s.hand.filter(c => c.name === "Street Wraith").length, 2);
  s = settle(castGoldfishCard(s, find(s, "Underground Sea", "hand").id));
  s = settle(castGoldfishCard(s, find(s, "Dark Ritual", "hand").id));
  s = settle(castGoldfishCard(s, find(s, "Doomsday", "hand").id), [], (c, state) => {
    if (!c.label?.startsWith("最後の審判") && !c.label?.startsWith("積む順番")) return null;
    const pool = [...c.candidates];
    const pick = name => pool.splice(pool.findIndex(o => o.label === name), 1)[0].ref;
    const oracle = pick("Thassa's Oracle"), petal = pick("Lotus Petal");
    const rest = pool.filter(o => /Land/.test((state[o.ref.zone].find(card => card.id === o.ref.id).typeLine))).slice(0, 3).map(o => o.ref);
    return { refs: [oracle, petal, ...rest] };
  });
  s = settle(activateGoldfishAction(s, find(s, "Street Wraith", "hand").id, "engine:wraith-cycle", { confirmLife: true }));
  assert.equal(find(s, "Thassa's Oracle", "hand").name, "Thassa's Oracle");
  s = settle(nextGoldfishTurn(s));
  s = settle(activateGoldfishAction(s, find(s, "Street Wraith", "hand").id, "engine:wraith-cycle", { confirmLife: true }));
  s = settle(castGoldfishCard(s, find(s, "Lotus Petal", "hand").id));
  s = settle(activateGoldfishAction(s, find(s, "Lotus Petal").id, "engine:petal"), [], c => c.kind === "mana" ? { colors: ["U"] } : null);
  s = settle(castGoldfishCard(s, find(s, "Thassa's Oracle", "hand").id));
  assert.equal(s.turn, 2); assert.equal(s.library.length, 2); assert.equal(s.players.self.life, 6); assert.equal(goldfishFinish(s)?.kind, "win");
});

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
