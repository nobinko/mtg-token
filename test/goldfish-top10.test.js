import { completeCleanup } from "./helpers/goldfish-turns.js";
import { nextGoldfishTurn } from "./helpers/goldfish-turns.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, advanceGoldfishGame, chooseGoldfishRule, resolveGoldfishSpell, restoreGoldfishGame, beginGoldfishCombat, resolveGoldfishCombat } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana, planGoldfishCastPayment, activateGoldfishLand, goldfishLandManaOptions, chooseGoldfishCast } from "../public/goldfish-mana.js";
import { activateGoldfishAction, chooseGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
import { castPreparedGoldfishSpell, repeatGoldfishCombo } from "../public/goldfish-practice.js";
import { castGoldfishAlternative } from "../public/goldfish-alternatives.js";
import { decodePage } from "../lib/cache.js";
import { moveGoldfishRuleObject } from "../public/goldfish-objects.js";
import { flushEngineEvents, gameLandTypes } from "../public/goldfish-engine.js";
import { drawGameCards } from "../public/goldfish-events.js";
import { goldfishFetchTargets } from "../public/goldfish-fetch.js";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/goldfish-top10.json", import.meta.url), "utf8"));
function start(rank) {
  const deck = fixture.decks.find(d => d.rank === rank);
  let state = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(deck.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(deck.sideboard, fixture.metadata), random: () => .5 }));
  if (state.rules.pendingChoice?.type === "engine-opening") state = chooseGoldfishRule(state, { refs: [] });
  return state;
}
function put(state, name, zone = "hand") {
  const card = [...state.library, ...state.hand, ...state.sideboard].find(c => c.name === name);
  assert.ok(card, name); return [moveGoldfishCards(state, card.id, zone), card.id];
}
function funds(state, pool) { for (const [color, count] of Object.entries(pool)) state = setGoldfishMana(state, color, count); return state; }
const advance = s => completeCleanup(advanceGoldfishGame(s));
const snap = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));
const choose = (s, answer) => advance(chooseGoldfishRule(snap(s), answer));
const get = (s, id) => [...s.battlefield, ...s.hand, ...s.graveyard, ...s.exile, ...s.stack].find(c => c.id === id);
const selectCard = (s, predicate = () => true) => choose(s, { refs: s.rules.pendingChoice.candidates.filter(c => predicate(get(s, c.ref.id) || s.library.find(x => x.id === c.ref.id))).slice(0, 1).map(c => c.ref) });

test("top10 fixture is ten distinct current archetypes with complete real 60-card lists", () => {
  assert.equal(fixture.decks.length, 10);
  assert.equal(new Set(fixture.decks.map(d => d.archetype)).size, 10);
  for (const d of fixture.decks) { assert.equal(d.mainboard.reduce((s, r) => s + r.count, 0), 60, d.archetype); assert.match(d.url, /^https:\/\/mtgtop8.com\/event/); }
  assert.equal(fixture.metadata.filter(c => c.unavailable).length, 0);
});
test("legacy tournament HTML preserves non-ASCII card names", () => {
  const bytes = Uint8Array.from(Buffer.from('<meta charset="iso-8859-1">Troll of Khazad-dûm', "latin1"));
  assert.match(decodePage(bytes), /Khazad-dûm/);
});
test("Broodscale: adapt, Spawn sacrifice and Blade counters form the actual loop", () => {
  let s = start(1), brood, blade;
  [s, brood] = put(s, "Basking Broodscale"); [s, blade] = put(s, "Blade of the Bloodchief");
  s = advance(castGoldfishCard(funds(s, { G: 10 }), brood));
  s = advance(castGoldfishCard(s, blade));
  s = advance(activateGoldfishAction(s, blade, "equip", { target: ref(get(s, brood)) }));
  s = advance(activateGoldfishAction(s, brood, "engine:adapt"));
  assert.equal(s.rules.pendingChoice.label, "トークンを生成しますか？");
  s = choose(s, { value: "yes" });
  const spawn = s.battlefield.find(c => c.name === "Eldrazi Spawn");
  s = advance(activateGoldfishAction(s, spawn.id, "engine:spawn-mana"));
  assert.equal(s.manaPool.C, 1); assert.equal(get(s, brood).counters["+1/+1"], 2);
  s = choose(s, { value: "yes" });
  assert.equal(s.battlefield.filter(c => c.name === "Eldrazi Spawn").length, 1);
  s = repeatGoldfishCombo(snap(s), "broodscale", brood, 20);
  assert.equal(s.manaPool.C, 21); assert.equal(get(s, brood).counters["+1/+1"], 22);
});
test("UR Aggro: Talent produces a prowess Otter and triggers before a real spell", () => {
  let s = start(2), talent, bolt;
  [s, talent] = put(s, "Stormchaser's Talent"); [s, bolt] = put(s, "Lightning Bolt");
  s = advance(castGoldfishCard(funds(s, { U: 1, R: 1 }), talent));
  const otter = s.battlefield.find(c => c.name === "Otter");
  assert.ok(otter);
  s = advance(castGoldfishCard(s, bolt, { target: { player: "opponent" } }));
  assert.equal(goldfishCharacteristics(s, get(s, otter.id)).power, "2"); assert.equal(s.players.opponent.life, 17);
});
test("Domain: Guildpact supplies five land types, Scion costs two and Kavu is 5/5", () => {
  let s = start(3), kavu, scion;
  [s] = put(s, "Leyline of the Guildpact", "battlefield"); [s] = put(s, "Mountain", "battlefield");
  [s, kavu] = put(s, "Territorial Kavu", "battlefield"); [s, scion] = put(s, "Scion of Draco");
  const plan = planGoldfishCastPayment(funds(s, { C: 1 }), get(s, scion));
  assert.equal(plan.payable, true); assert.equal(plan.cost, "{2}");
  assert.equal(goldfishCharacteristics(s, get(s, kavu)).power, "5");
});
test("UW: Narset enters at five loyalty, -2 selects a noncreature nonland and cannot activate twice", () => {
  let s = start(4), narset;
  [s, narset] = put(s, "Narset, Parter of Veils");
  s = advance(castGoldfishCard(funds(s, { U: 3 }), narset));
  assert.equal(get(s, narset).counters.loyalty, 5);
  s = advance(activateGoldfishAction(s, narset, "engine:narset"));
  assert.equal(get(s, narset).counters.loyalty, 3);
  if (s.rules.pendingChoice) s = selectCard(s);
  assert.throws(() => activateGoldfishAction(s, narset, "engine:narset"), /起動済み/);
});
test("Rakdos: Moonshadow enters with six counters and one mill event removes exactly one", () => {
  let s = start(5), shadow, manipulator;
  [s, shadow] = put(s, "Moonshadow"); [s, manipulator] = put(s, "Dark Matter Manipulator");
  s = advance(castGoldfishCard(funds(s, { B: 2 }), shadow));
  assert.equal(get(s, shadow).counters["-1/-1"], 6);
  s = advance(castGoldfishCard(s, manipulator));
  assert.equal(s.graveyard.length, 3);
  const permanentMilled = s.graveyard.some(c => /Creature|Artifact|Land|Enchantment/.test(c.typeLine));
  assert.equal(get(s, shadow).counters["-1/-1"], permanentMilled ? 5 : 6);
});
test("Affinity: warped Emissary creates a Drone on artifact cast; Manufacturing creates Munitions on entry", () => {
  let s = start(6), emissary, weapons, bauble;
  [s, emissary] = put(s, "Pinnacle Emissary"); [s, weapons] = put(s, "Weapons Manufacturing", "battlefield"); [s, bauble] = put(s, "Mishra's Bauble");
  s = advance(castGoldfishCard(funds(s, { U: 1 }), emissary, { warp: true }));
  s = advance(castGoldfishCard(s, bauble));
  assert.equal(s.battlefield.filter(c => c.name === "Drone").length, 1);
  assert.equal(s.battlefield.filter(c => c.name === "Munitions").length, 2);
  s = advance(nextGoldfishTurn(s));
  assert.equal(s.exile.some(c => c.id === emissary && c.playPermission.kind === "warp"), true);
});
test("Boros: Guide gains life and energy, Ocelot end step makes a cat and triggers Guide again", () => {
  let s = start(7), guide, ocelot;
  [s, guide] = put(s, "Guide of Souls"); [s, ocelot] = put(s, "Ocelot Pride");
  s = advance(castGoldfishCard(funds(s, { W: 2 }), guide));
  s = advance(castGoldfishCard(s, ocelot));
  assert.equal(s.players.self.life, 21); assert.equal(s.players.self.energy, 1);
  s = advance(nextGoldfishTurn(s));
  assert.equal(s.battlefield.filter(c => c.name === "Cat").length, 1);
  assert.equal(s.players.self.life, 22); assert.equal(s.players.self.energy, 2);
});
test("Tron: three lands make seven, Karn's -2 selects an actual sideboard artifact", () => {
  let s = start(8), karn;
  for (const name of ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"]) { let id; [s, id] = put(s, name, "battlefield"); }
  [s, karn] = put(s, "Karn, the Great Creator");
  s = advance(castGoldfishCard(s, karn));
  s = advance(activateGoldfishAction(s, karn, "engine:karn-wish"));
  assert.equal(s.rules.pendingChoice.candidates.some(c => c.ref.zone === "sideboard"), true);
  s = choose(s, { refs: [s.rules.pendingChoice.candidates.find(c => c.ref.zone === "sideboard").ref] });
  assert.equal(s.hand.some(c => c.id.startsWith("side-")), true);
});
test("Toolbox: Druid + Vizier untaps without a counter, Cub/Leyline add mana, Zenith finds an actual green creature", () => {
  let s = start(9), druid, zenith;
  for (const name of ["Devoted Druid", "Vizier of Remedies", "Badgermole Cub", "Leyline of Abundance"]) { let id; [s, id] = put(s, name, "battlefield"); if (name === "Devoted Druid") druid = id; }
  s = nextGoldfishTurn(s);
  s = activateGoldfishLand(s, druid);
  assert.equal(s.manaPool.G, 3);
  s = advance(activateGoldfishAction(s, druid, "engine:druid-untap"));
  assert.equal(get(s, druid).tapped, false); assert.equal(get(s, druid).counters["-1/-1"] || 0, 0);
  [s, zenith] = put(s, "Green Sun's Zenith");
  [s] = put(s, "Delighted Halfling", "libraryTop");
  s = advance(castGoldfishCard(s, zenith, { x: 2 }));
  s = selectCard(s, c => c.name === "Delighted Halfling");
  assert.equal(s.library.some(c => c.id === zenith), true);
  assert.equal(s.battlefield.some(c => c.name === "Delighted Halfling"), true);
});
test("Storm: Ruby reduces rituals, Wish grants a real sideboard cast and Grapeshot copies do not cast again", () => {
  let s = start(10), ritual, wish, grapeshot;
  [s] = put(s, "Ruby Medallion", "battlefield"); [s, ritual] = put(s, "Pyretic Ritual"); [s, wish] = put(s, "Wish");
  s = advance(castGoldfishCard(funds(s, { R: 1 }), ritual));
  assert.equal(s.manaPool.R, 3);
  s = advance(castGoldfishCard(s, wish));
  grapeshot = s.sideboard.find(c => c.name === "Grapeshot").id;
  s = advance(castGoldfishCard(s, grapeshot, { fromSideboard: true, target: { player: "opponent" } }));
  assert.equal(s.players.opponent.life, 17); assert.equal(s.rules.spellsCast, 3);
  assert.equal(s.graveyard.filter(c => c.name === "Grapeshot").length, 1);
});
test("Pompous Battlemage casts exactly one prepared copy and retains the creature", () => {
  let s = start(2), mage;
  [s, mage] = put(s, "Pompous Battlemage");
  s = advance(castGoldfishCard(funds(s, { R: 2 }), mage));
  assert.equal(get(s, mage).prepared, true);
  const hand = s.hand.length;
  s = advance(castPreparedGoldfishSpell(snap(s), mage));
  assert.equal(s.rules.pendingChoice.kind, "cards");
  s = choose(s, { refs: [] });
  assert.equal(s.hand.length, hand);
  assert.equal(get(s, mage).prepared, false);
  assert.equal(goldfishCharacteristics(s, get(s, mage)).power, "2");
  assert.equal(s.graveyard.some(c => c.name === "Improvised Act"), false);
  assert.throws(() => castPreparedGoldfishSpell(s, mage), /準備済み/);
});
test("Saga advances chapters after the draw, tutors exact printed 0 or 1, and sacrifices after III", () => {
  let s = start(1), saga;
  [s, saga] = put(s, "Urza's Saga"); s = advance(castGoldfishCard(s, saga));
  assert.equal(get(s, saga).sagaAbilities, 1);
  s = advance(nextGoldfishTurn(snap(s))); assert.equal(get(s, saga).sagaAbilities, 2);
  s = advance(activateGoldfishAction(funds(s, { C: 2 }), saga, "engine:saga-construct"));
  assert.ok(s.battlefield.some(c => c.name === "Construct"));
  s = advance(nextGoldfishTurn(s));
  const choice = s.rules.pendingChoice;
  assert.equal(choice.kind, "cards");
  assert.equal(choice.candidates.every(c => ["{0}", "{1}"].includes(s.library.find(card => card.id === c.ref.id).manaCost)), true);
  s = choose(s, { refs: [] }); assert.equal(s.graveyard.some(c => c.id === saga), true);
});
test("Phoenix bestow pays evidence atomically, grants haste, then becomes a creature when its host leaves", () => {
  let s = start(5), phoenix, host;
  [s, phoenix] = put(s, "Detective's Phoenix", "graveyard"); [s, host] = put(s, "Dark Matter Manipulator", "battlefield");
  const ids = []; for (const name of ["Troll of Khazad-dûm", "Street Wraith"]) { let id; [s, id] = put(s, name, "graveyard"); ids.push(id); }
  s = funds(s, { R: 1 }); const before = JSON.stringify(s);
  assert.throws(() => castGoldfishAlternative(s, phoenix, "bestow", { refs: [], target: ref(get(s, host)) }), /証拠/);
  assert.equal(JSON.stringify(s), before);
  s = advance(castGoldfishAlternative(s, phoenix, "bestow", { refs: ids.map(id => ref(get(s, id), "graveyard")), target: ref(get(s, host)) }));
  assert.equal(get(s, phoenix).typeLine, "Enchantment — Aura"); assert.equal(goldfishCharacteristics(s, get(s, host)).power, "3");
  // A real sacrifice, rather than a manual zone correction.
  s = moveGoldfishCards(s, host, "graveyard");
  assert.equal(get(s, phoenix).attachedTo, null);
  assert.match(get(s, phoenix).typeLine, /Creature/);
});

test("Labyrinth makes one before imprint, two after; Talisman colored mana retains life cost", () => {
  let s = start(8), land, devourer;
  [s, land] = put(s, "Ugin's Labyrinth"); [s, devourer] = put(s, "Devourer of Destiny");
  assert.equal(goldfishLandManaOptions(get(s, land), s)[0].pool.C, 1);
  s = advance(castGoldfishCard(s, land));
  s = choose(s, { refs: [ref(get(s, devourer), "hand")] });
  assert.equal(goldfishLandManaOptions(get(s, land), s)[0].pool.C, 2);
  s = activateGoldfishLand(s, land); assert.equal(s.manaPool.C, 2);
  let talisman; [s, talisman] = put(s, "Talisman of Resilience", "battlefield");
  const colored = goldfishLandManaOptions(get(s, talisman), s).filter(o => o.pool.B || o.pool.G);
  assert.equal(colored.length, 2); assert.equal(colored.every(o => o.life === 1 && o.damage), true);
});

test("restricted Shang-Chi mana surplus cannot pay for spells and expires at combat", () => {
  let s = start(9), shang, druid, speaker, rhythm;
  [s, shang] = put(s, "Shang-Chi, Master of Kung Fu", "battlefield");
  [s, druid] = put(s, "Devoted Druid", "battlefield");
  [s, speaker] = put(s, "Formidable Speaker", "battlefield");
  [s, rhythm] = put(s, "Nature's Rhythm");
  get(s, druid).tapped = true;
  s = advance(activateGoldfishAction(s, speaker, "engine:speaker", { target: ref(get(s, druid), "battlefield") }));
  assert.equal(get(s, shang).tapped, true);
  assert.equal(Object.values(s.manaPool).reduce((a, b) => a + b), 1);
  assert.equal(s.rules.restrictedMana.length, 1);
  // One restricted mana plus one ordinary green is insufficient for GG.
  s = funds(s, { G: 1 });
  assert.equal(planGoldfishCastPayment(s, get(s, rhythm), { autoTap: false }).payable, false);
  s = beginGoldfishCombat(s); s = chooseGoldfishRule(s, { ids: [] });
  assert.equal(s.rules.restrictedMana.length, 0);
});

test("earthbend targets before priority, returns a normal tapped land after sacrifice", () => {
  let s = start(9), cub, land;
  [s, land] = put(s, "Forest", "battlefield"); [s, cub] = put(s, "Badgermole Cub");
  s = advance(castGoldfishCard(funds(s, { G: 2 }), cub));
  assert.equal(s.rules.pendingChoice.type, "engine-target");
  s = choose(s, { target: ref(get(s, land), "battlefield") });
  assert.equal(goldfishCharacteristics(s, get(s, land)).power, "1");
  moveGoldfishRuleObject(s, land, "battlefield", "graveyard"); flushEngineEvents(s); s = advance(s);
  assert.ok(get(s, land).tapped); assert.doesNotMatch(get(s, land).typeLine, /Creature/);
  assert.equal(get(s, land).earthbent, undefined);
});

test("Guide energy payment creates a separate targeted trigger and an old target cannot receive it", () => {
  let s = start(7), guide, ocelot;
  [s, guide] = put(s, "Guide of Souls", "battlefield"); [s, ocelot] = put(s, "Ocelot Pride", "battlefield");
  s = nextGoldfishTurn(s); s.players.self.energy = 3;
  s = beginGoldfishCombat(s); s = choose(s, { ids: [ocelot] });
  assert.equal(s.rules.pendingChoice.kind, "buttons");
  s = chooseGoldfishRule(s, { value: "yes" });
  assert.equal(s.players.self.energy, 0); assert.equal(s.rules.pendingChoice.type, "engine-target");
  s = chooseGoldfishRule(s, { target: ref(get(s, ocelot), "battlefield") });
  assert.equal(get(s, ocelot).counters["+1/+1"] || 0, 0);
  s = moveGoldfishCards(s, ocelot, "hand"); s = moveGoldfishCards(s, ocelot, "battlefield");
  s = advance(s); assert.equal(get(s, ocelot).counters["+1/+1"] || 0, 0);
});

test("Moon and Guildpact apply in entry order, basic lands retain Guildpact types", () => {
  let s = start(3), land;
  [s, land] = put(s, "Steam Vents", "battlefield"); [s] = put(s, "Leyline of the Guildpact", "battlefield");
  const moon = createGoldfishGame(mergeCardMetadata([{ name: "Blood Moon", count: 7 }], fixture.metadata)).hand[0];
  moon.id = "test-moon"; s.battlefield.push(moon);
  assert.deepEqual(gameLandTypes(s, get(s, land)), ["Mountain"]);
  const leyline = s.battlefield.find(c => c.name === "Leyline of the Guildpact");
  s = moveGoldfishCards(s, leyline.id, "hand"); s = moveGoldfishCards(s, leyline.id, "battlefield");
  assert.equal(gameLandTypes(s, get(s, land)).length, 5);
});

test("Quantum Riddler replaces a whole draw instruction and warp permission waits for another turn", () => {
  let s = start(3), riddler;
  [s, riddler] = put(s, "Quantum Riddler");
  s = moveGoldfishCards(s, s.hand.filter(c => c.id !== riddler).map(c => c.id), "libraryBottom");
  s = advance(castGoldfishCard(funds(s, { U: 2 }), riddler, { warp: true }));
  assert.equal(s.hand.length, 2);
  s = moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
  drawGameCards(s, 3); assert.equal(s.hand.length, 4);
});

test("Kozilek modes and targets are chosen before mana is paid, then persist through reload", () => {
  let s = start(1), command;
  [s, command] = put(s, "Kozilek's Command"); s = funds(s, { C: 4 });
  s = castGoldfishCard(s, command, { x: 2 }); assert.equal(s.rules.pendingChoice.type, "cast-preflight");
  assert.equal(s.manaPool.C, 4); assert.equal(s.rules.spellsCast, 0);
  s = chooseGoldfishCast(snap(s), { values: ["spawn", "scry"] });
  s = chooseGoldfishCast(s, { value: "self" });
  s = advance(chooseGoldfishCast(s, { value: "self" }));
  assert.equal(s.manaPool.C, 0); assert.equal(s.rules.spellsCast, 1);
  assert.equal(s.battlefield.filter(c => c.name === "Eldrazi Spawn").length, 2);
  s = choose(s, { refs: [] }); assert.equal(s.graveyard.some(c => c.id === command), true);
});

test("Drum can tap a summoning-sick creature, and does not produce a cast event", () => {
  let s = start(1), drum, brood;
  [s, drum] = put(s, "Springleaf Drum", "battlefield"); [s, brood] = put(s, "Basking Broodscale", "battlefield");
  s = activateGoldfishAction(s, drum, "engine:drum", { costCards: [ref(get(s, brood), "battlefield")] });
  s = choose(s, { colors: ["G"] });
  assert.equal(s.manaPool.G, 1); assert.equal(get(s, brood).tapped, true); assert.equal(s.rules.spellsCast, 0);
});

test("Talent level two puts its graveyard target on a separate trigger", () => {
  let s = start(2), talent, bolt;
  [s, talent] = put(s, "Stormchaser's Talent", "battlefield"); [s, bolt] = put(s, "Lightning Bolt", "graveyard");
  s = advance(activateGoldfishAction(funds(s, { U: 4 }), talent, "engine:otter-level2"));
  assert.equal(get(s, talent).level, 2); assert.equal(s.rules.pendingChoice.type, "engine-target");
  s = choose(s, { target: ref(get(s, bolt), "graveyard") });
  assert.equal(s.hand.some(c => c.id === bolt), true);
});

test("Nihil draw trigger resolves before graveyard exile and can be declined", () => {
  let s = start(5), bomb;
  [s, bomb] = put(s, "Nihil Spellbomb", "battlefield");
  s = advance(activateGoldfishAction(funds(s, { B: 1 }), bomb, "engine:nihil"));
  assert.match(s.rules.pendingChoice.label, /引きますか/);
  const before = s.hand.length; s = choose(s, { value: "yes" });
  assert.equal(s.hand.length, before + 1); assert.equal(s.manaPool.B, 0);
  s = choose(s, { value: "opponent" }); assert.equal(s.graveyard.some(c => c.id === bomb), true);
});

test("Trinisphere charges three for plotted spells and for phyrexian life payment", () => {
  let s = start(2), spell;
  [s, spell] = put(s, "Slickshot Show-Off", "exile");
  const trini = createGoldfishGame(mergeCardMetadata([{ name: "Trinisphere", count: 7 }], fixture.metadata)).hand[0];
  trini.id = "test-trini"; s.battlefield.push(trini); get(s, spell).playPermission = { kind: "plot", serial: 0 };
  assert.equal(planGoldfishCastPayment(s, get(s, spell), { fromExile: true }).payable, false);
  s = advance(castGoldfishCard(funds(s, { C: 3 }), spell, { fromExile: true })); assert.equal(s.manaPool.C, 0);
  let growth; [s, growth] = put(s, "Mutagenic Growth");
  const plan = planGoldfishCastPayment(funds(s, { C: 3 }), get(s, growth), { phyrexianLife: true });
  assert.equal(plan.manaSpent, 3); assert.equal(plan.life, 2);
});
test("Nethergoyf escape validates four card types and keeps the escaped creature out of exile", () => {
  let s = start(5), goyf;
  [s, goyf] = put(s, "Nethergoyf", "graveyard");
  const names = ["Mountain", "Mishra's Bauble", "Lightning Bolt", "Thoughtseize"], ids = [];
  for (const name of names) { let id; [s, id] = put(s, name, "graveyard"); ids.push(id); }
  s = advance(castGoldfishAlternative(funds(s, { B: 3 }), goyf, "escape", { refs: ids.map(id => ref(get(s, id), "graveyard")) }));
  assert.equal(s.exile.length, 4); assert.ok(s.battlefield.some(c => c.id === goyf));
  assert.equal(goldfishCharacteristics(s, get(s, goyf)).toughness, "1");
});
test("Kappa improvise taps artifacts for generic only, enters and grows from its own artifact event", () => {
  let s = start(6), kappa;
  for (const name of ["Mishra's Bauble", "Tormod's Crypt", "Engineered Explosives", "Welding Jar", "Claws of Gix"]) [s] = put(s, name, "battlefield");
  [s, kappa] = put(s, "Kappa Cannoneer");
  assert.equal(planGoldfishCastPayment(s, get(s, kappa)).payable, false);
  s = advance(castGoldfishCard(funds(s, { U: 1 }), kappa));
  assert.equal(s.battlefield.filter(c => c.tapped).length, 5);
  assert.equal(get(s, kappa).counters["+1/+1"], 1);
});
test("imprinted Scepter casts a copy, counts as a spell and never moves the original", () => {
  let s = start(4), scepter, chant;
  [s, scepter] = put(s, "Isochron Scepter"); [s, chant] = put(s, "Orim's Chant");
  s = advance(castGoldfishCard(funds(s, { C: 4 }), scepter));
  s = choose(s, { refs: [ref(get(s, chant), "hand")] });
  assert.equal(get(s, scepter).imprinted.id, chant);
  s = advance(activateGoldfishAction(s, scepter, "engine:scepter"));
  s = choose(s, { value: "yes" });
  assert.equal(s.rules.pendingChoice.kind, "copy-target");
  s = choose(s, { target: { player: "opponent" } });
  assert.equal(s.rules.spellsCast, 2); assert.equal(s.exile.some(c => c.id === chant), true);
  assert.equal(s.graveyard.some(c => c.name === "Orim's Chant"), false);
});

test("pregame Caverns exiles exactly one card, Devourer filters before the draw, Leyline does not cast", () => {
  const deck = fixture.decks[0];
  let s = createGoldfishGame(mergeCardMetadata(deck.mainboard, fixture.metadata), { onThePlay: false, random: () => .5 });
  s = moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
  const names = ["Gemstone Caverns", "Devourer of Destiny", "Forest", "Ancient Stirrings", "Malevolent Rumble", "Basking Broodscale", "Blade of the Bloodchief"];
  for (const name of names) [s] = put(s, name);
  s = keepGoldfishHand(s);
  const options = s.rules.pendingChoice.candidates;
  s = chooseGoldfishRule(snap(s), { refs: options.map(c => c.ref) });
  assert.equal(s.rules.pendingChoice.type, "engine-opening-exile");
  s = choose(s, { refs: [s.rules.pendingChoice.candidates.find(c => c.label === "Blade of the Bloodchief").ref] });
  assert.equal(s.rules.pendingChoice.kind, "cards"); assert.equal(s.hand.length, 5);
  const top = s.rules.pendingChoice.candidates[0].ref;
  s = choose(s, { refs: [top] });
  assert.equal(s.hand.length, 6); assert.ok(s.hand.some(c => c.id === top.id));
  assert.equal(s.exile.length, 4); assert.equal(s.rules.spellsCast, 0);
  assert.equal(s.battlefield[0].counters.luck, 1);
});

test("Nature's Rhythm harmonize taps one creature, reduces generic only, and exiles on resolution", () => {
  let s = start(9), rhythm, hoof;
  [s, rhythm] = put(s, "Nature's Rhythm", "graveyard"); [s, hoof] = put(s, "Craterhoof Behemoth", "battlefield");
  [s] = put(s, "Devoted Druid", "libraryTop");
  s = advance(castGoldfishAlternative(funds(s, { G: 4 }), rhythm, "harmonize", { x: 5, refs: [ref(get(s, hoof), "battlefield")] }));
  assert.equal(get(s, hoof).tapped, true); assert.equal(s.manaPool.G, 0);
  s = choose(s, { refs: [] }); assert.ok(s.exile.some(c => c.id === rhythm));
});

test("Arena mana grants haste and exertion skips exactly the next untap", () => {
  let s = start(7), arena, ragavan;
  [s, arena] = put(s, "Arena of Glory", "battlefield"); [s, ragavan] = put(s, "Ragavan, Nimble Pilferer");
  s = advance(activateGoldfishAction(funds(s, { R: 1 }), arena, "engine:arena"));
  assert.equal(s.manaPool.R, 2); assert.ok(get(s, arena).exerted);
  s = advance(castGoldfishCard(s, ragavan));
  s = beginGoldfishCombat(s); s = choose(s, { ids: [ragavan] });
  s = advance(resolveGoldfishCombat(s));
  s = advance(nextGoldfishTurn(s)); assert.equal(get(s, arena).tapped, true);
  s = advance(nextGoldfishTurn(s)); assert.equal(get(s, arena).tapped, false);
});

test("Day's Undoing ends the turn, clears remaining stack and skips Ocelot's end-step trigger", () => {
  let s = start(4), undo, bolt;
  [s, undo] = put(s, "Day's Undoing"); [s, bolt] = put(s, "Silence");
  s = castGoldfishCard(funds(s, { U: 3 }), undo);
  // A previously pending ability underneath Day's Undoing must not resolve.
  s.stack.unshift({ id: "pending", kind: "ability", name: "queued", ability: { rule: "engine", steps: [{ op: "draw", count: 1 }] } });
  s = advance(s); assert.equal(s.rules.activePlayer, "opponent"); assert.equal(s.hand.length, 7); assert.equal(s.stack.length, 0);
  assert.ok(s.exile.some(c => c.id === undo));
});

test("full-control ordering includes both the new artifact trigger and existing prowess", () => {
  let s = start(6), emissary, bauble;
  [s, emissary] = put(s, "Pinnacle Emissary", "battlefield"); [s, bauble] = put(s, "Mishra's Bauble");
  const monk = { ...createGoldfishGame(mergeCardMetadata([{ name: "Monastery Swiftspear", count: 7 }], fixture.metadata)).hand[0], id: "test-swiftspear" };
  s.battlefield.push(monk);
  s = castGoldfishCard(s, bauble);
  assert.equal(s.rules.pendingChoice.type, "order"); assert.equal(s.rules.pendingChoice.entryIds.length, 2);
  s = choose(s, { order: s.rules.pendingChoice.entryIds.toReversed() });
  assert.equal(s.battlefield.filter(c => c.name === "Drone").length, 1);
  assert.equal(goldfishCharacteristics(s, get(s, monk.id)).power, "2");
});

test("Blood Moon removes nonbasic fetch and entry abilities, and a chapterless Saga dies", () => {
  let s = start(7), moon, fetch;
  [s, moon] = put(s, "Blood Moon", "battlefield"); [s, fetch] = put(s, "Arid Mesa", "battlefield");
  assert.throws(() => goldfishFetchTargets(s, fetch), /能力を失って/);
  const saga = createGoldfishGame(mergeCardMetadata([{ name: "Urza's Saga", count: 7 }], fixture.metadata)).hand[0];
  saga.id = "test-saga"; s.hand.push(saga);
  s = advance(castGoldfishCard(s, saga.id));
  assert.equal(s.stack.length, 0); assert.equal(s.graveyard.some(c => c.id === saga.id), true);
});

test("Woodland copies a graveyard permanent without entering and restores its land identity on leaving", () => {
  let s = start(1), woodland, brood;
  [s, woodland] = put(s, "Shifting Woodland", "battlefield"); [s, brood] = put(s, "Basking Broodscale", "graveyard");
  for (const name of ["Forest", "Ancient Stirrings", "Blade of the Bloodchief"]) [s] = put(s, name, "graveyard");
  s = advance(activateGoldfishAction(funds(s, { G: 4 }), woodland, "engine:woodland", { target: ref(get(s, brood), "graveyard") }));
  assert.equal(get(s, woodland).name, "Basking Broodscale"); assert.equal(goldfishCharacteristics(s, get(s, woodland)).power, "2");
  s = moveGoldfishCards(s, woodland, "graveyard");
  assert.equal(get(s, woodland).name, "Shifting Woodland"); assert.match(get(s, woodland).typeLine, /Land/);
});
