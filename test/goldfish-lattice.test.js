import test from "node:test";
import assert from "node:assert/strict";
import { GOLDFISH_METADATA } from "../public/goldfish-metadata.js";
import { createGoldfishGame, keepGoldfishHand } from "../public/goldfish.js";
import { moveGoldfishRuleObject } from "../public/goldfish-objects.js";
import { flushEngineEvents, engineCandidates, gameColors } from "../public/goldfish-engine.js";
import { cardType, copiableGoldfishValues } from "../public/goldfish-events.js";
import { goldfishManaCost, planGoldfishPayment, goldfishLandManaOptions } from "../public/goldfish-mana.js";
import { abilityBlockReason } from "../public/goldfish-constraints.js";
import { goldfishSpellTargets } from "../public/goldfish-spells.js";
import { planHogaak, castGoldfishAlternative, chooseGoldfishAlternative, alternativeCandidates, goldfishAlternativeModes } from "../public/goldfish-alternatives.js";

const metadata = name => {
  const card = GOLDFISH_METADATA.find(c => c.name === name);
  assert.ok(card, name);
  return { ...structuredClone(card), count: 1 };
};
function game(names) {
  return keepGoldfishHand(createGoldfishGame([...names.map(metadata), { ...metadata("Island"), count: 7 }], { random: () => .7 }));
}
function enter(s, name) {
  const zone = ["hand", "library", "graveyard"].find(z => s[z].some(c => c.name === name));
  return moveGoldfishRuleObject(s, s[zone].find(c => c.name === name).id, zone, "battlefield");
}
test("Lattice changes permanent types including face-down cards, without changing copy values or graveyard types", () => {
  const s = game(["Mycosynth Lattice", "Karn, the Great Creator", "Orcish Bowmasters"]);
  const land = enter(s, "Island"), karn = enter(s, "Karn, the Great Creator"), creature = enter(s, "Orcish Bowmasters");
  creature.faceDown = true;
  const lattice = enter(s, "Mycosynth Lattice");
  assert.match(cardType(land), /Artifact/); assert.match(cardType(karn), /Artifact/);
  assert.match(cardType(creature), /Creature.*Artifact/);
  assert.doesNotMatch(copiableGoldfishValues(land).typeLine, /Artifact/);
  assert.equal(engineCandidates(s, { zone: "battlefield", types: ["Artifact"] }).length, 4);
  moveGoldfishRuleObject(s, land.id, "battlefield", "graveyard", "sacrifice");
  assert.equal(s.rules.artifactsSacrificed, 1);
  assert.doesNotMatch(cardType(s.graveyard.find(c => c.id === land.id)), /Artifact/);
  moveGoldfishRuleObject(s, lattice.id, "battlefield", "graveyard");
  assert.doesNotMatch(cardType(karn), /Artifact/); assert.doesNotMatch(cardType(creature), /Artifact/);
});
test("Lattice payment preserves true colorless, actual mana colors, and source restrictions", () => {
  const s = game(["Mycosynth Lattice", "Eldrazi Temple", "Orcish Bowmasters"]);
  enter(s, "Mycosynth Lattice");
  const creature = [...s.hand, ...s.library].find(c => c.name === "Orcish Bowmasters");
  assert.deepEqual(gameColors(creature, s), []);
  assert.equal(goldfishManaCost(creature), "{1}{B}");
  s.manaPool.C = 2;
  const p = planGoldfishPayment(s, creature, { autoTap: false, spell: creature });
  assert.equal(p.payable, true); assert.deepEqual(p.colorsSpent, []); assert.equal(p.manaByColor.C, 2);
  s.manaPool.C = 0; s.manaPool.U = 1;
  assert.equal(planGoldfishPayment(s, { manaCost: "{C}" }, { autoTap: false }).payable, false);
  s.manaPool.U = 0; enter(s, "Eldrazi Temple");
  assert.equal(planGoldfishPayment(s, creature, { spell: creature }).payable, false, "Temple's two mana remain Eldrazi-only");
});
test("Lattice with Null Rod stops land mana; own Karn does not; colored targeting follows all-zone color change", () => {
  const s = game(["Mycosynth Lattice", "Karn, the Great Creator", "Null Rod", "Pyroblast", "Thundertrap Trainer"]);
  const land = enter(s, "Island");
  enter(s, "Karn, the Great Creator"); const lattice = enter(s, "Mycosynth Lattice");
  assert.ok(goldfishLandManaOptions(land, s).length, "Karn restricts opponents only");
  const rod = enter(s, "Null Rod");
  assert.match(abilityBlockReason(s, land, { manaAbility: true }), /無のロッド/);
  assert.equal(goldfishLandManaOptions(land, s).length, 0);
  moveGoldfishRuleObject(s, rod.id, "battlefield", "graveyard");
  assert.ok(goldfishLandManaOptions(land, s).length);
  const blue = enter(s, "Thundertrap Trainer");
  const pyro = [...s.hand, ...s.library].find(c => c.name === "Pyroblast");
  assert.deepEqual(gameColors(blue, s), []);
  assert.equal(engineCandidates(s, { zone: "battlefield", colored: true }).length, 0);
  assert.equal(goldfishSpellTargets(s, pyro).length, 0);
  moveGoldfishRuleObject(s, lattice.id, "battlefield", "graveyard");
  assert.deepEqual(gameColors(blue, s), ["U"]); assert.doesNotMatch(cardType(land), /Artifact/);
});
test("Lattice and Guildpact color layers use battlefield timestamp order and survive rule refresh", () => {
  const s = game(["Mycosynth Lattice", "Leyline of the Guildpact", "Orcish Bowmasters"]);
  const creature = enter(s, "Orcish Bowmasters"), lattice = enter(s, "Mycosynth Lattice");
  enter(s, "Leyline of the Guildpact");
  assert.deepEqual(gameColors(creature, s), ["W", "U", "B", "R", "G"]);
  moveGoldfishRuleObject(s, lattice.id, "battlefield", "graveyard"); enter(s, "Mycosynth Lattice");
  flushEngineEvents(s);
  assert.deepEqual(gameColors(creature, s), []); assert.match(cardType(creature), /Artifact/);
});

test("Hogaak preselects a legal convoke/delve payment, leaving final confirmation and card changes to the player", () => {
  const s = game(["Hogaak, Arisen Necropolis", "Orcish Bowmasters", "Stitcher's Supplier", "Brainstorm", "Ponder", "Thoughtseize", "Fatal Push", "Force of Will", "Mycosynth Lattice"]);
  enter(s, "Orcish Bowmasters"); enter(s, "Stitcher's Supplier");
  for (const name of ["Brainstorm", "Ponder", "Thoughtseize", "Fatal Push", "Force of Will"]) {
    const zone = ["hand", "library"].find(z => s[z].some(c => c.name === name));
    moveGoldfishRuleObject(s, s[zone].find(c => c.name === name).id, zone, "graveyard");
  }
  const zone = ["hand", "library"].find(z => s[z].some(c => c.name === "Hogaak, Arisen Necropolis"));
  const hogaak = moveGoldfishRuleObject(s, s[zone].find(c => c.name === "Hogaak, Arisen Necropolis").id, zone, "hand");
  const p = planHogaak(s, hogaak);
  assert.equal(p.suggestedRefs.length, 7);
  assert.equal(p.suggestedRefs.filter(r => r.zone === "battlefield").length, 2);
  const pending = castGoldfishAlternative(s, hogaak.id, "hogaak");
  assert.equal(pending.rules.pendingChoice.draft.ids.length, 7);
  assert.equal(pending.graveyard.length, 5, "selection has not paid the cost");
  const candidates = alternativeCandidates(pending, hogaak, goldfishAlternativeModes(hogaak, "hand")[0]);
  const next = chooseGoldfishAlternative(pending, { refs: pending.rules.pendingChoice.draft.ids.map(id => candidates.find(c => c.ref.id === id).ref) });
  assert.equal(next.exile.length, 5);
  assert.equal(next.battlefield.filter(c => c.tapped).length, 2);
  assert.ok(next.stack.some(c => c.name === hogaak.name));
  enter(s, "Mycosynth Lattice");
  assert.equal(planHogaak(s, hogaak).payable, false, "colorless creatures cannot convoke the black/green symbols");
});
