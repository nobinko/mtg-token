import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, advanceGoldfishGame, chooseGoldfishRule, restoreGoldfishGame, nextGoldfishTurn, endGoldfishTurn } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana, chooseGoldfishCast, planGoldfishCastPayment, goldfishLandManaOptions, activateGoldfishLand, planGoldfishPayment } from "../public/goldfish-mana.js";
import { castGoldfishAlternative } from "../public/goldfish-alternatives.js";
import { goldfishAttackers } from "../public/goldfish-combat.js";
import { goldfishManaValue, goldfishSpellTargets } from "../public/goldfish-spells.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { activateGoldfishAction, chooseGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishReference as ref, moveGoldfishRuleObject as move } from "../public/goldfish-objects.js";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/goldfish-top10.json", import.meta.url), "utf8"));
const snap = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));
const advance = s => advanceGoldfishGame(s);
const choose = (s, a) => advance(chooseGoldfishRule(snap(s), a));
const get = (s, id) => [...s.hand, ...s.library, ...s.battlefield, ...s.graveyard, ...s.exile, ...s.stack].find(c => c.id === id);
function start(rank) {
  const d = fixture.decks.find(d => d.rank === rank);
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(d.mainboard, fixture.metadata), { sideboardRows: mergeCardMetadata(d.sideboard, fixture.metadata), random: () => .5 }));
  if (s.rules.pendingChoice?.type === "engine-opening") s = chooseGoldfishRule(s, { refs: [] });
  // Keep a compact hand; each scenario takes actual cards from its real list.
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
function put(s, name, zone = "hand") {
  const c = [...s.library, ...s.hand, ...s.sideboard].find(c => c.name === name);
  assert.ok(c, name); return [moveGoldfishCards(s, c.id, zone), c.id];
}
function funds(s, pool) { for (const [c, n] of Object.entries(pool)) s = setGoldfishMana(s, c, n); return s; }

test("splice is declared before payment, survives reload and leaves the revealed card in hand", () => {
  let s = start(10), first, second;
  [s, first] = put(s, "Desperate Ritual");
  const other = s.library.find(c => c.name === "Desperate Ritual"); second = other.id; s = moveGoldfishCards(s, second, "hand");
  [s] = put(s, "Ruby Medallion", "battlefield"); s = funds(s, { R: 3 });
  s = castGoldfishCard(s, first); assert.equal(s.rules.pendingChoice.optionKey, "splice"); assert.equal(s.manaPool.R, 3);
  const cancelled = chooseGoldfishCast(s, { cancel: true }); assert.equal(cancelled.hand.length, 2); assert.equal(cancelled.manaPool.R, 3);
  s = advance(chooseGoldfishCast(snap(s), { refs: [ref(get(s, second), "hand")] }));
  assert.equal(s.manaPool.R, 6); assert.equal(s.rules.spellsCast, 1); assert.equal(s.hand[0].id, second); assert.equal(s.graveyard[0].id, first);
  assert.throws(() => castGoldfishCard(cancelled, first, { splice: [ref(get(cancelled, second), "hand"), ref(get(cancelled, second), "hand")] }), /選び直し/);
});

test("Ral locks damage allocation before loyalty, skips a lost target and draws only with another blue permanent", () => {
  let s = start(10), ral, ruby;
  [s, ral] = put(s, "Ral, Monsoon Mage", "battlefield"); [s, ruby] = put(s, "Ruby Medallion", "battlefield");
  const r = get(s, ral); r.faceIndex = 1; r.counters.loyalty = 2;
  get(s, ruby).colors = ["U"];
  s = activateGoldfishAction(s, ral, "engine:ral-minus"); assert.equal(get(s, ral).counters.loyalty, 2);
  assert.throws(() => chooseGoldfishAction(s, { allocation: [{ target: { player: "opponent" }, amount: 3 }] }), /配分/);
  s = chooseGoldfishAction(snap(s), { allocation: [{ target: { player: "opponent" }, amount: 1 }, { target: ref(get(s, ral)), amount: 1 }] });
  assert.ok(s.graveyard.some(c => c.id === ral)); // Paying to zero kills Ral before resolution.
  s = advance(s); assert.equal(s.players.opponent.life, 19); assert.equal(s.hand.length, 1);
});

test("Ugin ultimate tutors any colorless nonlands, pays loyalty even at zero, and grants expiring free casts with X zero", () => {
  let s = start(8), ugin;
  [s, ugin] = put(s, "Ugin, Eye of the Storms", "battlefield"); get(s, ugin).counters.loyalty = 11;
  s = advance(activateGoldfishAction(s, ugin, "engine:ugin-ultimate"));
  assert.ok(s.graveyard.some(c => c.id === ugin));
  const picks = s.rules.pendingChoice.candidates.filter(c => ["Kozilek's Command", "Expedition Map"].includes(c.label)).slice(0, 2);
  s = choose(s, { refs: picks.map(c => c.ref) }); assert.equal(s.exile.length, 2);
  for (const c of s.exile) assert.equal(c.playPermission.free, true);
  const command = s.exile.find(c => c.name === "Kozilek's Command");
  if (command) assert.throws(() => castGoldfishCard(s, command.id, { fromExile: true, x: 1 }), /Xは0/);
  const exiled = s.exile[0]; s.rules.turnSerial++;
  assert.throws(() => castGoldfishCard(s, exiled.id, { fromExile: true }), /期限/);
});

test("Geier and Henge handle loot, historic filtering, source exclusion and save/reload", () => {
  let s = start(4), geier, henge;
  [s, geier] = put(s, "Geier Reach Sanitarium", "battlefield"); [s, henge] = put(s, "Monumental Henge", "battlefield");
  s = advance(activateGoldfishAction(funds(s, { C: 2 }), geier, "engine:sanitarium"));
  assert.equal(s.hand.length, 1); assert.equal(get(s, geier).tapped, true);
  s = choose(s, { refs: [s.rules.pendingChoice.candidates[0].ref] }); assert.equal(s.hand.length, 0); assert.equal(s.graveyard.length, 1);
  [s] = put(s, "Narset, Parter of Veils", "libraryTop"); s = funds(s, { W: 4 });
  s = advance(activateGoldfishAction(s, henge, "engine:henge"));
  assert.ok(s.rules.pendingChoice.candidates.every(c => /Narset|Teferi|Jace|Isochron|Geier|Otawara/.test(c.label)));
  s = choose(s, { refs: [s.rules.pendingChoice.candidates.find(c => c.label === "Narset, Parter of Veils").ref] }); assert.equal(s.hand[0].name, "Narset, Parter of Veils");
});

test("Abstergo returns a historic card before exiling all graveyards and exiles itself as cost", () => {
  let s = start(8), land, map;
  [s, land] = put(s, "Abstergo Entertainment", "battlefield"); [s, map] = put(s, "Expedition Map", "graveyard"); [s] = put(s, "Dismember", "graveyard");
  s = advance(activateGoldfishAction(funds(s, { C: 3 }), land, "engine:abstergo-return", { target: ref(get(s, map), "graveyard") }));
  assert.equal(s.hand[0].id, map); assert.equal(s.graveyard.length, 0); assert.ok(s.exile.some(c => c.id === land));
});

test("Otawara channels from hand, has legendary-creature discount and is not a spell", () => {
  let s = start(4), land, solitude;
  [s, land] = put(s, "Otawara, Soaring City"); [s, solitude] = put(s, "Solitude", "battlefield");
  // A real creature used as a legend to exercise the generic legendary discount.
  get(s, solitude).typeLine = "Legendary Creature — Elemental";
  s = advance(activateGoldfishAction(funds(s, { U: 3 }), land, "engine:otawara", { target: ref(get(s, solitude)) }));
  assert.equal(s.manaPool.U, 0); assert.equal(s.rules.spellsCast, 0); assert.ok(s.hand.some(c => c.id === solitude)); assert.ok(s.graveyard.some(c => c.id === land));
});

test("March exiles white hand as additional cost and validates X before committing costs", () => {
  let s = start(4), march, pitch, target;
  [s, march] = put(s, "March of Otherworldly Light"); [s, pitch] = put(s, "Solitude"); [s, target] = put(s, "Isochron Scepter", "battlefield"); s = funds(s, { W: 1 });
  s = castGoldfishCard(s, march, { x: 2, target: ref(get(s, target)) }); assert.equal(s.rules.pendingChoice.optionKey, "pitch"); assert.equal(s.exile.length, 0);
  s = advance(chooseGoldfishCast(snap(s), { refs: [ref(get(s, pitch), "hand")] }));
  assert.equal(s.exile.length, 2); assert.equal(s.manaPool.W, 0); assert.equal(s.rules.spellsCast, 1);
});

test("Prismatic Ending automatically spends three colors for X=2 and exiles a three-mana permanent", () => {
  let s = start(4), ending, narset;
  [s, ending] = put(s, "Prismatic Ending"); [s, narset] = put(s, "Narset, Parter of Veils", "battlefield"); get(s, narset).counters.loyalty = 5;
  s = funds(s, { W: 5, U: 1, R: 1 });
  const plan = planGoldfishCastPayment(s, get(s, ending), { x: 2 }); assert.equal(plan.colorsSpent.length, 3);
  s = advance(castGoldfishCard(s, ending, { x: 2, target: ref(get(s, narset)) })); assert.ok(s.exile.some(c => c.id === narset)); assert.equal(s.manaPool.W, 4);
});

test("Thraben modes and player selections precede payment, then graveyards exile without a manual stop", () => {
  let s = start(7), charm;
  [s, charm] = put(s, "Thraben Charm"); [s] = put(s, "Lightning Bolt", "graveyard"); s = funds(s, { W: 2 });
  s = castGoldfishCard(s, charm); assert.equal(s.rules.pendingChoice.optionKey, "mode");
  s = chooseGoldfishCast(s, { value: "graveyards" }); assert.equal(s.rules.pendingChoice.optionKey, "gravePlayers");
  s = advance(chooseGoldfishCast(snap(s), { refs: [{ id: "self", player: "self" }, { id: "opponent", player: "opponent" }] }));
  assert.equal(s.exile[0].name, "Lightning Bolt"); assert.equal(s.graveyard[0].id, charm); assert.equal(s.rules.pendingChoice, null);
});

test("Blood Moon disables printed land abilities but never channel abilities in hand", () => {
  let s = start(3), arena, boseiju;
  [s, arena] = put(s, "Arena of Glory", "battlefield");
  const moon = fixture.metadata.find(c => c.name === "Blood Moon"); s.battlefield.push({ ...moon, id: "moon", counters: {}, temporaryEffects: [], incarnation: 0 });
  assert.throws(() => activateGoldfishAction(s, arena, "engine:arena"), /能力は失われ/);
  const b = fixture.metadata.find(c => c.name === "Boseiju, Who Endures"); s.hand.push({ ...b, id: "boseiju", counters: {}, temporaryEffects: [], incarnation: 0 });
  s = advance(activateGoldfishAction(funds(s, { G: 2 }), "boseiju", "engine:boseiju")); assert.equal(s.rules.spellsCast, 0); assert.equal(s.rules.pendingChoice, null);
});

test("cleanup enforces seven or Ten Rings' ten, persists a choice and discards via replacement effects", () => {
  let s = start(3);
  s = moveGoldfishCards(s, s.library.slice(-9).map(c => c.id), "hand");
  [s] = put(s, "Rest in Peace", "battlefield");
  s = nextGoldfishTurn(s); assert.equal(s.rules.pendingChoice.type, "cleanup"); assert.equal(s.rules.pendingChoice.min, 2); assert.equal(s.turn, 1);
  const ids = s.rules.pendingChoice.candidates.slice(0, 2).map(c => c.ref);
  s = choose(s, { refs: ids }); assert.equal(s.turn, 2); assert.equal(s.hand.length, 8); assert.equal(s.graveyard.length, 0); assert.equal(s.exile.length, 2);
  s = start(8); [s] = put(s, "The Ten Rings", "battlefield");
  s = advance(nextGoldfishTurn(s)); assert.equal(s.turn, 2); assert.equal(s.hand.length, 11);
  s = nextGoldfishTurn(s); assert.equal(s.rules.pendingChoice.min, 1);
});

test("Cage prevents Zenith from moving a creature and rejects graveyard casting without consuming costs", () => {
  let s = start(9), zenith;
  const cage = fixture.metadata.find(c => c.name === "Grafdigger's Cage"); s.battlefield.push({ ...cage, id: "cage", counters: {}, temporaryEffects: [], incarnation: 0 });
  [s, zenith] = put(s, "Green Sun's Zenith"); s = advance(castGoldfishCard(funds(s, { G: 2 }), zenith, { x: 1 }));
  const target = s.rules.pendingChoice.candidates.find(c => c.label === "Delighted Halfling").ref;
  s = choose(s, { refs: [target] }); assert.ok(s.library.some(c => c.id === target.id)); assert.equal(s.battlefield.length, 1);
  let rhythm; [s, rhythm] = put(s, "Nature's Rhythm", "graveyard");
  assert.throws(() => castGoldfishAlternative(s, rhythm, "harmonize"), /墓掘り/);
});

test("Torpor suppresses creature ETBs while entry counters still apply; Totem suppresses mana and activated abilities", () => {
  let s = start(9), cub, druid;
  const orb = fixture.metadata.find(c => c.name === "Torpor Orb"), totem = fixture.metadata.find(c => c.name === "Cursed Totem");
  s.battlefield.push({ ...orb, id: "orb", counters: {}, temporaryEffects: [], incarnation: 0 });
  [s, cub] = put(s, "Badgermole Cub"); s = advance(castGoldfishCard(funds(s, { G: 2 }), cub)); assert.equal(s.rules.pendingChoice, null); assert.ok(s.battlefield.some(c => c.id === cub));
  [s, druid] = put(s, "Devoted Druid", "battlefield"); get(s, druid).enteredTurn = 0;
  s.battlefield.push({ ...totem, id: "totem", counters: {}, temporaryEffects: [], incarnation: 0 });
  assert.equal(goldfishLandManaOptions(get(s, druid), s).length, 0); assert.throws(() => activateGoldfishAction(s, druid, "engine:druid-untap"), /トーテム/);
});

test("Damping Sphere replaces Tron production and applies per-spell tax before Ruby reduction", () => {
  let s = start(8), tower;
  for (const n of ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"]) { let id; [s, id] = put(s, n, "battlefield"); if (n.endsWith("Tower")) tower = id; }
  const sphere = fixture.metadata.find(c => c.name === "Damping Sphere"); s.battlefield.push({ ...sphere, id: "sphere", counters: {}, temporaryEffects: [], incarnation: 0 });
  assert.ok(goldfishLandManaOptions(get(s, tower), s).every(o => o.pool.C === 1));
  s = start(10); [s] = put(s, "Ruby Medallion", "battlefield"); s.battlefield.push({ ...sphere, id: "sphere", counters: {}, temporaryEffects: [], incarnation: 0 });
  let ritual; [s, ritual] = put(s, "Pyretic Ritual"); s.rules.spellsCast = 2;
  assert.equal(planGoldfishCastPayment(funds(s, { R: 3 }), get(s, ritual)).cost, "{2}{R}");
});

test("all own casting paths respect High Noon and Needle's named actions", () => {
  let s = start(6), needle, claws;
  [s, needle] = put(s, "Pithing Needle"); [s, claws] = put(s, "Claws of Gix", "battlefield");
  s = advance(castGoldfishCard(funds(s, { C: 1 }), needle)); assert.equal(s.rules.pendingChoice.kind, "name");
  s = choose(s, { value: "Claws of Gix" }); assert.throws(() => activateGoldfishAction(s, claws, "engine:claws"), /起動は禁止/);
  const noon = fixture.metadata.find(c => c.name === "High Noon"); s.battlefield.push({ ...noon, id: "noon", counters: {}, temporaryEffects: [], incarnation: 0 });
  let salvage; [s, salvage] = put(s, "Salvage Titan"); assert.throws(() => castGoldfishAlternative(s, salvage, "titan"), /2つ目/);
});

test("Grist -2 sacrifices during resolution then creates a separate targeted trigger", () => {
  let s = start(9), grist, bird;
  [s, grist] = put(s, "Grist, the Hunger Tide", "battlefield"); get(s, grist).counters.loyalty = 3;
  [s, bird] = put(s, "Birds of Paradise", "battlefield");
  s = advance(activateGoldfishAction(s, grist, "engine:grist-minus")); assert.equal(s.rules.pendingChoice.kind, "cards"); assert.ok(s.battlefield.some(c => c.id === bird));
  s = choose(s, { refs: [ref(get(s, bird), "battlefield")] }); assert.equal(s.rules.pendingChoice.type, "engine-target"); assert.ok(s.graveyard.some(c => c.id === bird));
  s = choose(s, { target: s.rules.pendingChoice.candidates.find(c => c.ref.virtual).ref }); assert.equal(s.stack.length, 0);
});

test("Ulamog locks two distinct targets and can resolve the surviving target after one leaves", () => {
  let s = start(8), ulamog, map, boulder;
  [s, ulamog] = put(s, "Ulamog, the Ceaseless Hunger"); [s, map] = put(s, "Expedition Map", "battlefield"); [s, boulder] = put(s, "Giant's Boulder", "battlefield");
  s = castGoldfishCard(funds(s, { C: 10 }), ulamog); s = advance(s); assert.equal(s.rules.pendingChoice.multipleTargets, true);
  s = chooseGoldfishRule(s, { refs: [ref(get(s, map), "battlefield"), ref(get(s, boulder), "battlefield")] });
  move(s, map, "battlefield", "hand"); s = advance(s);
  assert.ok(s.exile.some(c => c.id === boulder)); assert.ok(s.hand.some(c => c.id === map)); assert.ok(s.battlefield.some(c => c.id === ulamog));
});

test("Force pitch is restricted to the opponent turn and resolves without a manual spell stop", () => {
  let s = start(4), force, blue;
  [s, force] = put(s, "Force of Negation"); [s, blue] = put(s, "Consult the Star Charts");
  assert.throws(() => castGoldfishAlternative(s, force, "force"), /相手のターン/);
  s.rules.activePlayer = "opponent";
  s = advance(castGoldfishAlternative(s, force, "force", { refs: [ref(get(s, blue), "hand")], target: { player: "opponent", virtual: true } }));
  assert.ok(s.exile.some(c => c.id === blue)); assert.equal(s.rules.spellsCast, 1); assert.equal(s.stack.length, 0);
});

test("Wear / Tear combines its two targets and costs; split, transformed and X spells have the correct mana value", () => {
  let s = start(10), wear, ruby, talent;
  [s, wear] = put(s, "Wear / Tear"); [s, ruby] = put(s, "Ruby Medallion", "battlefield"); [s, talent] = put(s, "Artist's Talent", "battlefield");
  assert.equal(goldfishManaValue(get(s, wear)), 3);
  const opts = { fuse: true, fuseArtifact: [ref(get(s, ruby))], fuseEnchantment: [ref(get(s, talent))] };
  s = castGoldfishCard(funds(s, { R: 1, W: 1 }), wear, opts);
  assert.equal(goldfishManaValue(s.stack.find(c => c.id === wear)), 3);
  s = advance(s); assert.equal(s.manaPool.R + s.manaPool.W, 0); assert.equal(s.battlefield.length, 0); assert.equal(s.graveyard.length, 3);
  const split = fixture.metadata.find(c => c.name === "Wear // Tear");
  assert.equal(goldfishManaValue({ ...split, faceIndex: 1, cast: {} }), 1);
  const ral = fixture.metadata.find(c => c.name.startsWith("Ral, Monsoon Mage"));
  assert.equal(goldfishManaValue({ ...ral, faceIndex: 1 }), 2);
  assert.equal(goldfishManaValue({ manaCost: "{X}{X}", cast: { x: 3 } }), 6);
});

test("Spell Snare accepts exactly two mana on the stack and accounts for chosen X", () => {
  let s = start(2), snare;
  [s, snare] = put(s, "Spell Snare");
  s.stack.push({ id: "one", name: "One", typeLine: "Instant", manaCost: "{U}", cast: {}, incarnation: 0 }, { id: "two", name: "Two", typeLine: "Instant", manaCost: "{1}{U}", cast: {}, incarnation: 0 }, { id: "x", name: "X", typeLine: "Instant", manaCost: "{X}{U}", cast: { x: 1 }, incarnation: 0 });
  assert.deepEqual(goldfishSpellTargets(s, get(s, snare)).filter(c => c.card).map(c => c.card.id), ["two", "x"]);
});

test("replicate can retarget copies independently, reload between choices, and never count copies as casts", () => {
  let s = start(2), consign;
  [s, consign] = put(s, "Consign to Memory");
  s.stack.push({ id: "first", name: "First", typeLine: "Artifact", manaCost: "{1}", incarnation: 0, cast: {} }, { id: "second", name: "Second", typeLine: "Artifact", manaCost: "{1}", incarnation: 0, cast: {} });
  s = advance(castGoldfishCard(funds(s, { U: 1, C: 2 }), consign, { replicate: 2, target: ref(get(s, "first"), "stack") }));
  assert.equal(s.rules.pendingChoice.kind, "buttons"); s = choose(s, { value: "new" });
  s = choose(s, { target: ref(get(s, "second"), "stack") });
  s = choose(s, { target: ref(get(s, "first"), "stack") });
  assert.equal(s.stack.length, 0); assert.equal(s.rules.spellsCast, 1); assert.equal(s.graveyard.length, 3); assert.equal(s.battlefield.length, 0);
});

test("Warping Wail makes a Scion with a mana sacrifice action", () => {
  let s = start(1), wail;
  [s, wail] = put(s, "Warping Wail"); s = advance(castGoldfishCard(funds(s, { C: 2 }), wail, { mode: "scion" }));
  const scion = s.battlefield.find(c => c.name === "Eldrazi Scion"); assert.equal(scion.power, "1");
  s = advance(activateGoldfishAction(s, scion.id, "engine:spawn-mana")); assert.equal(s.manaPool.C, 1); assert.equal(s.battlefield.length, 0);
});

test("station taps a summoning-sick creature as cost and counts its power on resolution", () => {
  let s = start(8), ship, ulamog;
  [s, ship] = put(s, "Extinguisher Battleship", "battlefield"); [s, ulamog] = put(s, "Ulamog, the Ceaseless Hunger", "battlefield");
  s = activateGoldfishAction(s, ship, "engine:station", { costCards: [ref(get(s, ulamog))] });
  assert.equal(get(s, ulamog).tapped, true); get(s, ulamog).powerOverride = "7";
  s = advance(s); assert.equal(get(s, ship).counters.charge, 7); assert.match(get(s, ship).typeLine, /Creature/);
});

test("Roku's chapters grant expiring plays, add mana and return a fresh transformed creature", () => {
  let s = start(7), roku;
  [s, roku] = put(s, "The Legend of Roku"); s = advance(castGoldfishCard(funds(s, { R: 4 }), roku));
  assert.equal(s.exile.filter(c => c.playPermission).length, 3);
  s = advance(nextGoldfishTurn(s)); assert.equal(s.rules.pendingChoice.kind, "mana"); s = choose(s, { colors: ["R"] }); assert.equal(s.manaPool.R, 1);
  const old = ref(get(s, roku)); s = advance(nextGoldfishTurn(s));
  assert.equal(get(s, roku).faceIndex, 1); assert.equal(get(s, roku).incarnation, old.incarnation + 2); assert.equal(get(s, roku).enteredTurn, s.turn);
  s = advance(activateGoldfishAction(funds(s, { R: 8 }), roku, "engine:roku-dragon")); assert.ok(s.battlefield.some(c => c.name === "Dragon"));
});

test("Karn's animation lasts through the opponent turn and ends before the next own turn", () => {
  let s = start(8), karn, boulder;
  [s, karn] = put(s, "Karn, the Great Creator", "battlefield"); get(s, karn).counters.loyalty = 5; [s, boulder] = put(s, "Giant's Boulder", "battlefield");
  s = advance(activateGoldfishAction(s, karn, "engine:karn-animate", { target: ref(get(s, boulder)) }));
  s = advance(endGoldfishTurn(s)); assert.match(get(s, boulder).typeLine, /Creature/); assert.equal(goldfishCharacteristics(s, get(s, boulder)).power, "1");
  s = advance(nextGoldfishTurn(s)); assert.doesNotMatch(get(s, boulder).typeLine, /Creature/);
});

test("Cityscape unearth grants haste and exiles it at end step or if it would bounce", () => {
  let s = start(8), leveler;
  [s, leveler] = put(s, "Cityscape Leveler", "graveyard");
  s = advance(activateGoldfishAction(funds(s, { C: 8 }), leveler, "engine:unearth")); assert.ok(!goldfishAttackers(s).find(c => c.card.id === leveler).reason);
  const bounced = snap(s); move(bounced, leveler, "battlefield", "hand"); assert.ok(bounced.exile.some(c => c.id === leveler));
  s = advance(endGoldfishTurn(s)); assert.ok(s.exile.some(c => c.id === leveler)); assert.equal(s.stack.length, 0);
});

test("as-entering card names bypass trigger suppression and never create a respondable ability", () => {
  let s = start(1), needle;
  s.battlefield.push({ ...fixture.metadata.find(c => c.name === "Karn, Argent Defender"), id: "karn-argent", counters: {}, temporaryEffects: [], incarnation: 0 }); [s, needle] = put(s, "Pithing Needle");
  s = advance(castGoldfishCard(funds(s, { C: 1 }), needle)); assert.equal(s.rules.pendingChoice.type, "engine-entry"); assert.equal(s.stack.length, 0);
  s = choose(s, { value: "Karn, Argent Defender" }); assert.equal(get(s, needle).chosenName, "Karn, Argent Defender");
});

test("Cavern's manually floated colored mana is restricted and protects the spell it pays for", () => {
  let s = start(9), speaker; const cavern = "cavern";
  s.battlefield.push({ ...fixture.metadata.find(c => c.name === "Cavern of Souls"), id: cavern, counters: {}, temporaryEffects: [], incarnation: 0, chosenType: "Elf" });
  [s, speaker] = put(s, "Formidable Speaker");
  const options = goldfishLandManaOptions(get(s, cavern), s), index = options.findIndex(o => o.pool.G);
  assert.ok(index >= 0); s = activateGoldfishLand(s, cavern, index);
  assert.equal(planGoldfishPayment(s, { manaCost: "{G}" }, { spell: { typeLine: "Sorcery" } }).payable, false);
  s = funds(s, { C: 2 }); s = castGoldfishCard(s, speaker); assert.equal(s.stack.find(c => c.id === speaker).cast.uncounterable, true);
});

test("Temple's two mana can pay colorless Eldrazi abilities but not other abilities", () => {
  let s = start(8), temple, ulamog;
  [s, temple] = put(s, "Eldrazi Temple", "battlefield"); [s, ulamog] = put(s, "Ulamog, the Ceaseless Hunger", "battlefield");
  const opt = goldfishLandManaOptions(get(s, temple), s).findIndex(o => o.pool.C === 2); s = activateGoldfishLand(s, temple, opt);
  assert.equal(planGoldfishPayment(s, { manaCost: "{2}" }, { abilitySource: get(s, ulamog) }).payable, true);
  assert.equal(planGoldfishPayment(s, { manaCost: "{2}" }, { abilitySource: { typeLine: "Artifact" } }).payable, false);
});
