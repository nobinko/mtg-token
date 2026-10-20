import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, restoreGoldfishGame, advanceGoldfishGame, chooseGoldfishRule, endGoldfishTurn } from "../public/goldfish.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { castGoldfishCard, chooseGoldfishCast, setGoldfishMana } from "../public/goldfish-mana.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
import { goldfishSpellTargets } from "../public/goldfish-spells.js";
import { activateGoldfishAction, goldfishActionReason } from "../public/goldfish-actions.js";
import { goldfishCardActions } from "../public/goldfish-action-definitions.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { settle } from "./helpers/goldfish-pilot.js";
import { route } from "./helpers/goldfish-route.js";
import { goldfishFinish } from "../public/goldfish-sideboard.js";
import { beginGoldfishCombat, resolveGoldfishCombat } from "../public/goldfish.js";
import { castPreparedGoldfishSpell } from "../public/goldfish-practice.js";

const fixtures = ["top10", "standard-top10", "legacy-top10", "pioneer-top10"].map(n => JSON.parse(readFileSync(new URL(`./fixtures/goldfish-${n}.json`, import.meta.url))));
const metadata = fixtures.flatMap(f => f.metadata);
const card = (s, n, z = "battlefield") => s[z].find(c => c.name === n);
const save = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));
function position(names) {
  const rows = Object.entries(names).map(([name, count]) => ({ name, count }));
  rows.push({ name: "Forest", count: 60 - rows.reduce((n, c) => n + c.count, 0) });
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, metadata), { random: () => .5 }));
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const put = (s, n, z = "hand") => moveGoldfishCards(s, card(s, n, "library").id, z);
const funds = (s, pool) => Object.entries(pool).reduce((s, [c, n]) => setGoldfishMana(s, c, n), s);
const cast = (s, n, options) => castGoldfishCard(s, card(s, n, options?.fromExile ? "exile" : "hand").id, options);

for (const postboard of [false, true]) test(`real Legacy Hogaak casts with convoke/delve and wins ${postboard ? "postboard" : "mainboard"}`, () => {
  const r = route(6, ["Underground Sea", "Underground Sea", "Stitcher's Supplier", "Dark Matter Manipulator", "Hogaak, Arisen Necropolis", postboard ? "Nihil Spellbomb" : "Thoughtseize", "Force of Will"],
    ["Brainstorm", "Ponder", "Fatal Push", "Swamp", "Force of Will", "Daze", "Ponder"], postboard ? { Thoughtseize: -1, "Nihil Spellbomb": 1 } : {}, () => null, fixtures[2]);
  r.cast("Underground Sea"); r.cast("Stitcher's Supplier"); r.next(); r.cast("Underground Sea"); r.cast("Dark Matter Manipulator");
  assert.equal(r.s.graveyard.length, 6);
  r.cast("Hogaak, Arisen Necropolis");
  assert.equal(r.s.exile.length, 5); assert.equal(r.card("Hogaak, Arisen Necropolis").power, "8");
  assert.ok(r.card("Dark Matter Manipulator").tapped); assert.ok(r.card("Stitcher's Supplier").tapped);
  r.next(); r.cast("Swamp");
  if (postboard) { r.cast("Nihil Spellbomb"); r.act("Nihil Spellbomb", "engine:nihil", {}); }
  r.finish(8); assert.equal(goldfishFinish(r.s)?.kind, "win");
});

for (const postboard of [false, true]) test(`real Pioneer Greasefang wins with crew, Angels and the second reanimation ${postboard ? "postboard" : "mainboard"}`, () => {
  const opening = ["Concealed Courtyard", "Swamp", "Godless Shrine", "Seasoned Hallowblade", "Greasefang, Okiba Boss", "Parhelion II", postboard ? "Bitter Triumph" : "Monument to Endurance"];
  const r = route(7, opening, ["Plains", "The Mycosynth Gardens", "Fatal Push"], postboard ? { "Monument to Endurance": -1, "Bitter Triumph": 1 } : {}, () => null, fixtures[3]);
  r.cast("Concealed Courtyard"); r.next(); r.cast("Swamp");
  if (postboard) r.cast("Bitter Triumph", { target: { player: "opponent", virtual: true }, extraCost: "discard", costCards: [r.ref("Parhelion II", "hand")] });
  else { r.cast("Seasoned Hallowblade"); r.act("Seasoned Hallowblade", "engine:discard-indestructible", { costCards: [r.ref("Parhelion II", "hand")] }); }
  r.next(); r.cast("Godless Shrine"); r.cast("Greasefang, Okiba Boss"); r.attack();
  assert.equal(r.s.battlefield.filter(c => c.name === "Angel").length, 2);
  assert.equal(r.s.players.opponent.life, postboard ? 7 : 4);
  r.next(); assert.ok(r.card("Parhelion II", "hand"));
  if (postboard) r.cast("Seasoned Hallowblade");
  r.act("Seasoned Hallowblade", "engine:discard-indestructible", { costCards: [r.ref("Parhelion II", "hand")] });
  r.attack(); assert.equal(goldfishFinish(r.s)?.kind, "win"); assert.equal(r.s.turn, 4);
});

test("Hacker ninjutsu returns a declared attacker as a cost and draws without discard this turn", () => {
  let s = put(put(put(position({ "Moon-Circuit Hacker": 1, "Faerie Miscreant": 1, Island: 1 }), "Faerie Miscreant", "battlefield"), "Moon-Circuit Hacker"), "Island", "battlefield");
  card(s, "Faerie Miscreant").enteredTurn = 0;
  s = settle(beginGoldfishCombat(s));
  const before = s.hand.length;
  s = settle(activateGoldfishAction(s, card(s, "Moon-Circuit Hacker", "hand").id, "engine:ninjutsu", { costCards: [ref(card(s, "Faerie Miscreant"))] }));
  assert.ok(card(s, "Faerie Miscreant", "hand"));
  s = settle(resolveGoldfishCombat(s));
  assert.equal(s.players.opponent.life, 18); assert.equal(s.hand.length, before + 1);
});

test("Cultivator casts the Enroot prepared copy and tutors a land to the graveyard", () => {
  const n = "Carnivorous Cultivator // Enroot";
  let s = funds(put(position({ [n]: 1 }), n), { G: 3 });
  s = settle(cast(s, n)); assert.equal(card(s, n).prepared, true);
  s = settle(castPreparedGoldfishSpell(s, card(s, n).id));
  assert.equal(card(s, n).prepared, false); assert.equal(s.graveyard[0].name, "Forest");
  assert.ok(!s.graveyard.some(c => c.name === "Enroot"));
});

test("Raptor offers an immediate cast, pays energy once, and preserves cast triggers across reload", () => {
  let s = position({ "Amped Raptor": 1, "Monastery Swiftspear": 1, "Lightning Bolt": 1 });
  s = settle(put(s, "Monastery Swiftspear", "battlefield"));
  s = funds(put(s, "Amped Raptor"), { R: 2 });
  s = moveGoldfishCards(s, card(s, "Lightning Bolt", "library").id, "libraryTop");
  s = advanceGoldfishGame(cast(s, "Amped Raptor"));
  assert.equal(s.rules.pendingChoice.options[0].value, "cast");
  s = chooseGoldfishRule(save(s), { value: "cast" });
  assert.equal(s.rules.pendingChoice.type, "cast-target");
  assert.equal(s.players.self.energy, 2);
  s = chooseGoldfishCast(save(s), { target: { player: "opponent" } });
  assert.equal(s.players.self.energy, 1); assert.equal(s.rules.automation, null);
  assert.equal(s.stack.at(-1).ability.rule, "boost");
  s = settle(save(s));
  assert.equal(s.players.opponent.life, 17); assert.equal(goldfishCharacteristics(s, card(s, "Monastery Swiftspear")).power, "2");
});

test("Beseech bargain is paid before search; canceling the free cast returns the card to hand", () => {
  let s = funds(put(put(position({ "Beseech the Mirror": 1, "Lotus Petal": 1, "Lightning Bolt": 1 }), "Lotus Petal", "battlefield"), "Beseech the Mirror"), { B: 4 });
  const petal = ref(card(s, "Lotus Petal"));
  s = advanceGoldfishGame(cast(s, "Beseech the Mirror", { costCards: [petal] }));
  assert.ok(card(s, "Lotus Petal", "graveyard"));
  s = chooseGoldfishRule(save(s), { refs: [s.rules.pendingChoice.candidates.find(c => c.label === "Lightning Bolt").ref] });
  s = chooseGoldfishRule(save(s), { value: "cast" });
  s = chooseGoldfishCast(save(s), { cancel: true });
  assert.ok(card(s, "Lightning Bolt", "hand")); assert.ok(card(s, "Beseech the Mirror", "graveyard"));
  assert.equal(s.rules.spellsCast, 1); assert.equal(s.rules.automation, null);
});

test("Uldaros copies only declared distinct card types and spends a shared MV budget", () => {
  let s = position({ "Uldaros Theorix": 1, "Dark Ritual": 1, "Thassa's Oracle": 1, "Ponder": 1 });
  for (const n of ["Dark Ritual", "Thassa's Oracle", "Ponder"]) s = put(s, n, "graveyard");
  s = funds(put(s, "Uldaros Theorix"), { U: 1, B: 5 });
  s = advanceGoldfishGame(cast(s, "Uldaros Theorix"));
  assert.equal(s.rules.pendingChoice.type, "engine-target");
  const chosen = s.rules.pendingChoice.candidates.map(c => c.ref);
  s = chooseGoldfishRule(save(s), { refs: chosen });
  s = settle(s, [], c => c.label.startsWith("コピーを唱える順番") ? { value: c.options.find(o => o.label.startsWith("Thassa"))?.value || "done" } : c.label.includes("を今唱えますか") ? { value: "cast" } : null);
  assert.equal(card(s, "Thassa's Oracle").kind, "token");
  assert.equal(s.exile.filter(c => chosen.some(r => r.id === c.id)).length, 3);
  assert.equal(s.exile.filter(c => c.id.startsWith("extra-")).length, 0);
  assert.equal(s.rules.spellsCast, 2);
});

test("Festival chooses up to two eligible permanents and puts every other looked card on bottom", () => {
  let s = funds(put(position({ "Storm the Festival": 1, "Llanowar Elves": 1, "Witch's Oven": 1, "Uldaros Theorix": 1, "Ponder": 1 }), "Storm the Festival"), { G: 6 });
  const top = ["Forest", "Llanowar Elves", "Witch's Oven", "Uldaros Theorix", "Ponder"].map(n => card(s, n, "library").id);
  s = moveGoldfishCards(s, top, "libraryTop");
  s = advanceGoldfishGame(cast(s, "Storm the Festival"));
  const c = s.rules.pendingChoice;
  assert.deepEqual(c.candidates.map(c => c.label).sort(), ["Forest", "Llanowar Elves", "Witch's Oven"]);
  s = settle(chooseGoldfishRule(save(s), { refs: c.candidates.filter(c => c.label !== "Forest").map(c => c.ref) }));
  assert.ok(card(s, "Llanowar Elves")); assert.ok(card(s, "Witch's Oven"));
  assert.equal(s.library.slice(0, 3).filter(c => top.includes(c.id)).length, 3);
});

test("Jace empower creates a token; instant permission does not remove the once per turn limit", () => {
  let s = funds(put(position({ "Jace's Machinations": 1 }), "Jace's Machinations"), { U: 3 });
  s = settle(endGoldfishTurn(s));
  s = funds(s, { U: 3 }); s = settle(cast(s, "Jace's Machinations"));
  assert.equal(card(s, "Jace").counters.loyalty, 8);
  s = settle(activateGoldfishAction(s, card(s, "Jace").id, "engine:jace-token-draw"));
  assert.equal(card(s, "Jace").counters.loyalty, 5);
  assert.match(goldfishActionReason(s, card(s, "Jace"), goldfishCardActions(card(s, "Jace"))[0]), /1回|起動済/);
});

test("Verse rejects colorless and multicolor permanents before payment; Joke allows no target", () => {
  let s = position({ "Vanishing Verse": 1, "Impractical Joke": 1, "Lotus Petal": 1, "Cauldron Familiar": 1, "Psychic Frog": 1 });
  for (const n of ["Lotus Petal", "Cauldron Familiar", "Psychic Frog"]) s = put(s, n, "battlefield");
  s = settle(s); s = funds(put(put(s, "Vanishing Verse"), "Impractical Joke"), { W: 1, B: 1, R: 1 });
  assert.deepEqual(goldfishSpellTargets(s, card(s, "Vanishing Verse", "hand")).filter(c => c.card).map(c => c.label), ["Cauldron Familiar"]);
  s = settle(cast(s, "Impractical Joke", { modeTargets: [] }));
  assert.equal(s.rules.noPreventionSerial, s.rules.turnSerial);
});
