import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, nextGoldfishTurn, restoreGoldfishGame } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana } from "../public/goldfish-mana.js";
import { goldfishCharacteristics, goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishReference as ref, moveGoldfishRuleObject as move } from "../public/goldfish-objects.js";
import { cardName } from "../public/goldfish-events.js";
import { settle } from "./helpers/goldfish-pilot.js";
const data = JSON.parse(fs.readFileSync(new URL("./fixtures/goldfish-public-top30.json", import.meta.url)));
const card = (s, n, z = "battlefield") => s[z].find(c => cardName(c) === n || c.name === n || c.name.split(" // ")[0] === n);
function position(names) {
  const rows = Object.entries(names).map(([name, count]) => ({ name, count }));
  rows.push({ name: "Forest", count: 60 - rows.reduce((n, c) => n + c.count, 0) });
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, data.metadata), { random: () => .5 }));
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const put = (s, n, z = "hand") => moveGoldfishCards(s, card(s, n, "library").id, z);
const funds = s => setGoldfishMana(s, "G", 20);
const cast = (s, n, options = {}, decide = () => null) => settle(castGoldfishCard(funds(s), card(s, n, options.fromGraveyard ? "graveyard" : "hand").id, options), [], decide);

test("Meltstrider attaches to the selected own creature, grants only toughness, and resolves reciprocal fight damage", () => {
  let s = put(put(position({ "Keen-Eyed Curator": 1, "Meltstrider's Resolve": 1 }), "Keen-Eyed Curator", "battlefield"), "Meltstrider's Resolve");
  s = cast(s, "Meltstrider's Resolve", { target: ref(card(s, "Keen-Eyed Curator"), "battlefield") }, c => c.kind === "number" ? { value: 4 } : null);
  const creature = card(s, "Keen-Eyed Curator"), aura = card(s, "Meltstrider's Resolve");
  assert.ok(aura); assert.equal(aura.attachedTo.id, creature.id);
  assert.equal(goldfishCharacteristics(s, creature).power, "3");
  assert.equal(goldfishCharacteristics(s, creature).toughness, "5");
  assert.equal(creature.damage, 4);
  assert.ok(goldfishKeywords(s, creature).has("can't be blocked by more than one creature"));
  s = restoreGoldfishGame(JSON.parse(JSON.stringify(s)));
  move(s, aura.id, "battlefield", "graveyard");
  assert.equal(goldfishCharacteristics(s, card(s, "Keen-Eyed Curator")).toughness, "3");
});

test("Esper Origins cast from hand gains life and goes to graveyard; flashback returns transformed with finality and all three chapters", () => {
  let s = put(put(position({ "Esper Origins": 1, "Llanowar Elves": 1, "Torpor Orb": 1 }), "Esper Origins"), "Llanowar Elves", "battlefield");
  s = put(s, "Torpor Orb", "battlefield");
  const keep = c => c.kind === "cards" && c.label.includes("諜報") ? { refs: [] } : null;
  s = cast(s, "Esper Origins", {}, keep);
  assert.ok(card(s, "Esper Origins", "graveyard")); assert.equal(s.players.self.life, 22);
  const before = s.hand.length;
  s = cast(s, "Esper Origins", { fromGraveyard: true }, keep);
  assert.equal(s.players.self.life, 24); assert.equal(s.hand.length, before + 1);
  assert.equal(card(s, "Summon: Esper Maduin").counters.finality, 1);
  assert.equal(card(s, "Summon: Esper Maduin").counters.lore, 1, "Torpor Orb does not suppress Saga lore chapters");
  s = restoreGoldfishGame(JSON.parse(JSON.stringify(s)));
  s = settle(nextGoldfishTurn(s));
  assert.equal(s.manaPool.G, 2); assert.equal(card(s, "Summon: Esper Maduin").counters.lore, 2);
  s = settle(nextGoldfishTurn(s));
  assert.ok(!card(s, "Summon: Esper Maduin"));
  assert.ok(card(s, "Esper Origins", "exile"), "finality replaces the final chapter sacrifice");
  assert.equal(goldfishCharacteristics(s, card(s, "Llanowar Elves")).power, "3");
  assert.ok(goldfishKeywords(s, card(s, "Llanowar Elves")).has("trample"));
  s = settle(nextGoldfishTurn(s));
  assert.equal(goldfishCharacteristics(s, card(s, "Llanowar Elves")).power, "1");
});

test("Bushwhack searches only a basic land, or locks both fight targets before payment and deals reciprocal damage", () => {
  let s = put(position({ Bushwhack: 2, "Keen-Eyed Curator": 1, "Fabled Passage": 1 }), "Bushwhack");
  const before = s.hand.length;
  s = cast(s, "Bushwhack", { format: { bushwhack: "land" } }, c => {
    if (c.kind === "cards" && c.label.includes("基本土地")) {
      assert.ok(c.candidates.every(x => x.label === "Forest"));
      return { refs: [c.candidates[0].ref] };
    }
    return null;
  });
  assert.equal(s.hand.length, before);
  s = put(put(s, "Keen-Eyed Curator", "battlefield"), "Bushwhack");
  s = cast(s, "Bushwhack", {}, c => c.formatField === "bushwhack" ? { value: "fight" } : c.kind === "number" ? { value: 2 } : null);
  assert.equal(card(s, "Keen-Eyed Curator").damage, 2);
});

test("Origin of Metalbending adds a persistent counter and temporary indestructible to an own creature", () => {
  let s = put(put(position({ "Origin of Metalbending": 1, "Llanowar Elves": 1 }), "Llanowar Elves", "battlefield"), "Origin of Metalbending");
  s = cast(s, "Origin of Metalbending", { mode: "protect", modeTargets: [ref(card(s, "Llanowar Elves"), "battlefield")] });
  assert.equal(card(s, "Llanowar Elves").counters["+1/+1"], 1);
  assert.ok(goldfishKeywords(s, card(s, "Llanowar Elves")).has("indestructible"));
  s = settle(nextGoldfishTurn(s));
  assert.ok(!goldfishKeywords(s, card(s, "Llanowar Elves")).has("indestructible"));
  assert.equal(goldfishCharacteristics(s, card(s, "Llanowar Elves")).power, "2");
});
