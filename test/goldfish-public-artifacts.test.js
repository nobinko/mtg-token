import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, nextGoldfishTurn, endGoldfishTurn, restoreGoldfishGame } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana, goldfishLandManaOptions, planGoldfishCastPayment, activateGoldfishLand } from "../public/goldfish-mana.js";
import { activateGoldfishAction, goldfishActionReason } from "../public/goldfish-actions.js";
import { goldfishCardActions } from "../public/goldfish-action-definitions.js";
import { goldfishCharacteristics, goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishReference as ref, moveGoldfishRuleObject as move, untapGoldfishObject } from "../public/goldfish-objects.js";
import { changeLife, cardName, makeGameToken } from "../public/goldfish-events.js";
import { flushEngineEvents, damage } from "../public/goldfish-engine.js";
import { goldfishSpellTargets } from "../public/goldfish-spells.js";
import { abilityBlockReason } from "../public/goldfish-constraints.js";
import { settle } from "./helpers/goldfish-pilot.js";
const data = JSON.parse(fs.readFileSync(new URL("./fixtures/goldfish-public-top30.json", import.meta.url)));
const card = (s, n, z = "battlefield") => s[z].find(c => cardName(c) === n || c.name === n);
function position(names) {
  const rows = Object.entries(names).map(([name, count]) => ({ name, count }));
  rows.push({ name: "Plains", count: 60 - rows.reduce((n, c) => n + c.count, 0) });
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, data.metadata), { random: () => .5 }));
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const put = (s, n, z = "hand") => moveGoldfishCards(s, card(s, n, "library").id, z);
const funds = s => ["W", "U", "R", "C"].reduce((v, c) => setGoldfishMana(v, c, 20), s);
const cast = (s, n, decide = () => null) => settle(castGoldfishCard(funds(s), card(s, n, "hand").id), [], decide);
const reload = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));

test("The One Ring grants cast-only protection, draws burden cards and loses life at the next own upkeep", () => {
  let s = position({ "The One Ring": 1, "Ancient Tomb": 1, "Mana Confluence": 1, "Lightning Bolt": 1 });
  s = cast(put(s, "The One Ring"), "The One Ring");
  assert.equal(s.rules.ringProtection, true);
  s = put(put(put(s, "Ancient Tomb", "battlefield"), "Mana Confluence", "battlefield"), "Lightning Bolt");
  // A cost-only mana source contrasts damage with paying life; it is not part of the public list.
  Object.assign(card(s, "Mana Confluence"), { typeLine: "Land", oracleText: "{T}, Pay 1 life: Add one mana of any color." });
  assert.equal(goldfishLandManaOptions(card(s, "Ancient Tomb"), s)[0].life, 0);
  assert.equal(goldfishLandManaOptions(card(s, "Mana Confluence"), s)[0].life, 1);
  assert.ok(!goldfishSpellTargets(s, card(s, "Lightning Bolt", "hand")).some(t => t.ref.player === "self"));
  const before = s.life, hand = s.hand.length, id = card(s, "The One Ring").id;
  damage(s, { player: "self" }, 4); assert.equal(s.life, before);
  changeLife(s, -2); assert.equal(s.life, before - 2, "life loss is not damage");
  s = settle(activateGoldfishAction(s, id, "engine:artifact-ring"));
  assert.equal(card(s, "The One Ring").counters.burden, 1); assert.equal(s.hand.length, hand + 1);
  s = reload(s); assert.equal(s.rules.ringProtection, true);
  s = settle(endGoldfishTurn(s));
  assert.equal(s.rules.ringProtection, true); assert.equal(s.life, before - 2, "opponent upkeep does not trigger burden");
  s = settle(nextGoldfishTurn(s));
  assert.ok(!s.rules.ringProtection); assert.equal(s.life, before - 3);
  assert.equal(goldfishLandManaOptions(card(s, "Ancient Tomb"), s)[0].life, 2);
  const hand2 = s.hand.length;
  s = settle(activateGoldfishAction(s, id, "engine:artifact-ring"));
  assert.equal(card(s, "The One Ring").counters.burden, 2); assert.equal(s.hand.length, hand2 + 2);
});

test("The One Ring blink does not renew protection; a removed source uses its last burden count", () => {
  let s = position({ "The One Ring": 1 });
  s = cast(put(s, "The One Ring"), "The One Ring");
  let ring = card(s, "The One Ring");
  move(s, ring.id, "battlefield", "exile"); move(s, ring.id, "exile", "battlefield");
  s = settle(flushEngineEvents(s));
  assert.ok(s.rules.ringProtection, "old effect survives the source leaving");
  s = settle(nextGoldfishTurn(s)); assert.ok(!s.rules.ringProtection);
  ring = card(s, "The One Ring"); ring.counters.burden = 2;
  const hand = s.hand.length;
  s = activateGoldfishAction(s, ring.id, "engine:artifact-ring");
  move(s, ring.id, "battlefield", "graveyard");
  s = settle(flushEngineEvents(s));
  assert.equal(s.hand.length, hand + 2, "cannot put a counter on the absent Ring, but still draws its last count");
});

test("public UW: Synthesizer triggers from another MV3+ artifact, including a second Synthesizer, never itself or its zero-MV token", () => {
  let s = position({ "Simulacrum Synthesizer": 2, "Perilous Snare": 1, "Cryogen Relic": 1 });
  s = cast(put(s, "Simulacrum Synthesizer"), "Simulacrum Synthesizer");
  assert.equal(s.battlefield.filter(c => c.kind === "token").length, 0);
  s = cast(put(s, "Simulacrum Synthesizer"), "Simulacrum Synthesizer");
  assert.equal(s.battlefield.filter(c => c.name === "Construct").length, 1);
  s = cast(put(s, "Perilous Snare"), "Perilous Snare");
  const constructs = s.battlefield.filter(c => c.name === "Construct");
  assert.equal(constructs.length, 3);
  assert.equal(goldfishCharacteristics(s, constructs[0]).power, "6");
  s = cast(put(s, "Cryogen Relic"), "Cryogen Relic");
  assert.equal(s.battlefield.filter(c => c.name === "Construct").length, 3);
});

test("Bay pays a separate artifact as a cost, resolves its leave trigger, and tutors exact MV+1 through a shuffle", () => {
  let s = position({ "Repurposing Bay": 1, "Cryogen Relic": 1, "Simulacrum Synthesizer": 1, "The Mind Stone": 1 });
  s = cast(put(s, "Repurposing Bay"), "Repurposing Bay");
  s = cast(put(s, "Cryogen Relic"), "Cryogen Relic");
  const hand = s.hand.length, bay = card(s, "Repurposing Bay");
  assert.throws(() => activateGoldfishAction(s, bay.id, "engine:artifact-bay", { costCards: [ref(bay)] }), /コスト/);
  s = settle(activateGoldfishAction(funds(s), bay.id, "engine:artifact-bay", { costCards: [ref(card(s, "Cryogen Relic"))] }), [], c =>
    c.type === "engine-choice" && c.label.includes("山札") ? { refs: [c.candidates.find(x => x.label === "Simulacrum Synthesizer").ref] } : null);
  assert.ok(card(s, "Cryogen Relic", "graveyard"));
  assert.ok(card(s, "Simulacrum Synthesizer"));
  assert.equal(s.hand.length, hand + 1);
  assert.ok(card(s, "Repurposing Bay").tapped);
});

test("craft exiles the source and a graveyard artifact as costs, returns the back face and triggers Kiln once", () => {
  let s = position({ "Clay-Fired Bricks": 1, "Cryogen Relic": 1 });
  s = cast(put(s, "Clay-Fired Bricks"), "Clay-Fired Bricks");
  s = put(s, "Cryogen Relic", "graveyard");
  const old = ref(card(s, "Clay-Fired Bricks"));
  s = settle(activateGoldfishAction(funds(s), old.id, "engine:artifact-craft", { costCards: [ref(card(s, "Cryogen Relic", "graveyard"), "graveyard")] }));
  const back = card(s, "Cosmium Kiln");
  assert.ok(back); assert.equal(back.faceIndex, 1); assert.ok(back.incarnation > old.incarnation);
  assert.equal(s.battlefield.filter(c => c.name === "Gnome").length, 2);
  assert.equal(goldfishCharacteristics(s, card(s, "Gnome")).power, "2");
  assert.ok(card(s, "Cryogen Relic", "exile"));
  s = reload(s); assert.equal(cardName(card(s, "Cosmium Kiln")), "Cosmium Kiln");
});

test("Braided Net spends net counters, suppresses mana while tapped, and suppression ends at untap", () => {
  let s = position({ "Braided Net": 1, "The Mind Stone": 1 });
  s = cast(put(s, "Braided Net"), "Braided Net");
  s = cast(put(s, "The Mind Stone"), "The Mind Stone");
  s = settle(activateGoldfishAction(s, card(s, "Braided Net").id, "engine:artifact-net", { target: ref(card(s, "The Mind Stone")) }));
  assert.equal(card(s, "Braided Net").counters.net, 2);
  assert.ok(abilityBlockReason(s, card(s, "The Mind Stone"), { manaAbility: true }));
  assert.equal(goldfishLandManaOptions(card(s, "The Mind Stone"), s).length, 0);
  untapGoldfishObject(card(s, "The Mind Stone"));
  assert.equal(abilityBlockReason(s, card(s, "The Mind Stone"), { manaAbility: true }), "");
  card(s, "The Mind Stone").tapped = true;
  assert.equal(abilityBlockReason(s, card(s, "The Mind Stone"), { manaAbility: true }), "");
  card(s, "Braided Net").tapped = false; card(s, "Braided Net").counters.net = 0;
  assert.throws(() => activateGoldfishAction(s, card(s, "Braided Net").id, "engine:artifact-net", { target: ref(card(s, "The Mind Stone")) }), /カウンター/);
});

test("Quipu draws for itself as well and returns to third from top with its front face", () => {
  let s = position({ "Braided Net": 1, "Candy Trail": 1, "The Irencrag": 1 });
  s = cast(put(s, "Braided Net"), "Braided Net");
  s = put(s, "Candy Trail", "graveyard");
  s = settle(activateGoldfishAction(funds(s), card(s, "Braided Net").id, "engine:artifact-craft", { costCards: [ref(card(s, "Candy Trail", "graveyard"), "graveyard")] }));
  s = cast(put(s, "The Irencrag"), "The Irencrag");
  const hand = s.hand.length, id = card(s, "Braided Quipu").id;
  s = settle(activateGoldfishAction(funds(s), id, "engine:artifact-quipu"));
  assert.equal(s.hand.length, hand + 2);
  assert.equal(s.library.at(-3).id, id); assert.equal(s.library.at(-3).faceIndex, 0);
});

test("speed increases once per own turn, survives the engine source leaving, and gates the max-speed activation", () => {
  let s = position({ "Perilous Snare": 1, "Voice of Victory": 1 });
  s = cast(put(s, "Perilous Snare"), "Perilous Snare");
  s = cast(put(s, "Voice of Victory"), "Voice of Victory");
  const a = goldfishCardActions(card(s, "Perilous Snare")).find(x => x.minSpeed);
  assert.ok(goldfishActionReason(s, card(s, "Perilous Snare"), a));
  for (let i = 2; i <= 4; i++) {
    changeLife(s, -1, "opponent"); changeLife(s, -1, "opponent"); s = settle(flushEngineEvents(s));
    assert.equal(s.rules.speed, i);
    if (i < 4) s = settle(nextGoldfishTurn(s));
  }
  s = settle(activateGoldfishAction(s, card(s, "Perilous Snare").id, a.id, { target: ref(card(s, "Voice of Victory")) }));
  assert.equal(card(s, "Voice of Victory").counters["+1/+1"], 1);
  move(s, card(s, "Perilous Snare").id, "battlefield", "graveyard");
  s = settle(flushEngineEvents(s)); assert.equal(s.rules.speed, 4);
});

test("Castle Doom restricted mana cannot pay for a white instant or an ability; Bastion colors expire without a basic", () => {
  let s = position({ "Castle Doom": 1, "Gleaming Bastion": 1, "Erode": 1, "Candy Trail": 1 });
  s = put(put(put(s, "Castle Doom", "battlefield"), "Erode"), "Candy Trail");
  assert.equal(planGoldfishCastPayment(s, card(s, "Erode", "hand")).payable, false);
  assert.equal(planGoldfishCastPayment(s, card(s, "Candy Trail", "hand")).payable, true);
  const source = card(s, "Castle Doom");
  const white = goldfishLandManaOptions(source, s).findIndex(o => o.pool.W);
  s = activateGoldfishLand(s, source.id, white);
  assert.equal(planGoldfishCastPayment(s, card(s, "Erode", "hand"), { autoTap: false }).payable, false);
  s = put(s, "Gleaming Bastion");
  s = settle(castGoldfishCard(s, card(s, "Gleaming Bastion", "hand").id));
  assert.ok(goldfishLandManaOptions(card(s, "Gleaming Bastion"), s).some(o => o.pool.U));
  s = settle(nextGoldfishTurn(s));
  assert.ok(!goldfishLandManaOptions(card(s, "Gleaming Bastion"), s).some(o => o.pool.U));
  s = put(s, "Plains", "battlefield");
  assert.ok(goldfishLandManaOptions(card(s, "Gleaming Bastion"), s).some(o => o.pool.U));
});

test("Harness survives save/restore, blinks Cryogen at own end step, and is lost on zone change", () => {
  let s = position({ "The Mind Stone": 1, "Cryogen Relic": 1 });
  s = cast(put(s, "The Mind Stone"), "The Mind Stone");
  s = cast(put(s, "Cryogen Relic"), "Cryogen Relic");
  s = settle(activateGoldfishAction(funds(s), card(s, "The Mind Stone").id, "engine:artifact-harness"));
  s = reload(s);
  const hand = s.hand.length, old = ref(card(s, "Cryogen Relic"));
  s = settle(endGoldfishTurn(s), [], c => c.type === "engine-target" && c.sourceName === "The Mind Stone" ? { target: c.candidates.find(x => x.label === "Cryogen Relic").ref } : null);
  assert.equal(s.hand.length, hand + 2); assert.ok(card(s, "Cryogen Relic").incarnation > old.incarnation);
  move(s, card(s, "The Mind Stone").id, "battlefield", "hand");
  assert.ok(!card(s, "The Mind Stone", "hand").harnessed);
});

test("Fire Crystal gives haste, copies a creature, and sacrifices the copy at the next end step", () => {
  let s = position({ "The Fire Crystal": 1, "Voice of Victory": 1 });
  s = cast(put(s, "The Fire Crystal"), "The Fire Crystal");
  s = cast(put(s, "Voice of Victory"), "Voice of Victory");
  assert.ok(goldfishKeywords(s, card(s, "Voice of Victory")).has("haste"));
  s = settle(activateGoldfishAction(funds(s), card(s, "The Fire Crystal").id, "engine:artifact-fire-copy", { target: ref(card(s, "Voice of Victory")) }));
  const token = s.battlefield.find(c => c.kind === "token"); assert.ok(token);
  s = settle(endGoldfishTurn(s));
  assert.ok(!s.battlefield.some(c => c.id === token.id));
});

test("United Battlefront selects two eligible permanents from seven; creatures and expensive artifacts remain below", () => {
  let s = position({ "United Battlefront": 1, "Repurposing Bay": 1, "Simulacrum Synthesizer": 1, "Voice of Victory": 1, "The Fire Crystal": 1 });
  s = put(s, "United Battlefront");
  const names = ["Repurposing Bay", "Simulacrum Synthesizer", "Voice of Victory", "The Fire Crystal"];
  for (const n of names) { const i = s.library.findIndex(c => c.name === n); s.library.push(s.library.splice(i, 1)[0]); }
  s = cast(s, "United Battlefront", c => c.type === "engine-choice" && c.sourceName === "United Battlefront" ? { refs: c.candidates.map(x => x.ref) } : null);
  assert.ok(card(s, "Repurposing Bay")); assert.ok(card(s, "Simulacrum Synthesizer"));
  assert.ok(!card(s, "Voice of Victory")); assert.ok(!card(s, "The Fire Crystal"));
  assert.equal(s.battlefield.filter(c => c.name === "Construct").length, 1, "simultaneous entry is seen by Synthesizer");
});

test("Irencrag's optional change removes mana and gains equip; leaving restores the printed artifact", () => {
  let s = cast(put(position({ "The Irencrag": 1 }), "The Irencrag"), "The Irencrag");
  makeGameToken(s, { name: "Legendary test creature", typeLine: "Legendary Creature", power: "1", toughness: "1" });
  s = settle(flushEngineEvents(s));
  const equipment = card(s, "Everflame, Heroes' Legacy");
  assert.ok(equipment); assert.equal(goldfishLandManaOptions(equipment, s).length, 0);
  assert.ok(goldfishCardActions(equipment).some(a => a.id === "equip"));
  move(s, equipment.id, "battlefield", "hand");
  assert.ok(card(s, "The Irencrag", "hand"));
});
