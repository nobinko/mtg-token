import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, nextGoldfishTurn, beginGoldfishCombat, resolveGoldfishCombat } from "../public/goldfish.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { setGoldfishMana } from "../public/goldfish-mana.js";
import { activateGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishCharacteristics, goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
import { isType } from "../public/goldfish-events.js";
import { gameColors } from "../public/goldfish-engine.js";
import { settle } from "./helpers/goldfish-pilot.js";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/goldfish-public-top30.json", import.meta.url)));
const card = (s, n, z = "battlefield") => s[z].find(c => c.name === n);
function position(names) {
  const rows = [...names.map(name => ({ name, count: 1 })), { name: "Island", count: 60 - names.length }];
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, fixture.metadata), { random: () => .5 }));
  s = moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
  for (const n of names) s = moveGoldfishCards(s, card(s, n, "library").id, "battlefield");
  return s;
}
const funds = (s, pool) => Object.entries(pool).reduce((s, [color, n]) => setGoldfishMana(s, color, n), s);
const animate = (s, n, options) => settle(activateGoldfishAction(s, card(s, n).id, "engine:fp-land-creature", options));

test("Mutavault preserves itself for attacking, gains Ninja and all creature subtypes, then returns to land", () => {
  let s = position(["Mutavault", "Forest"]);
  s.rules.kaitoEmblems = 1;
  s = animate(s, "Mutavault");
  const c = card(s, "Mutavault");
  assert.equal(c.tapped, false); assert.equal(card(s, "Forest").tapped, true);
  assert.equal(goldfishCharacteristics(s, c).power, "3");
  for (const type of ["Ninja", "Demon", "Bat", "Elemental", "Eldrazi", "Pilot"]) assert.ok(isType(c, type));
  assert.ok(!isType(c, "Artifact|Enchantment|Planeswalker"));
  assert.ok(!goldfishKeywords(s, c).has("haste"));
  s = settle(nextGoldfishTurn(s));
  assert.ok(!isType(card(s, "Mutavault"), "Ninja|Creature")); assert.equal(card(s, "Mutavault").lane, "land");
});

test("Den creates one tapped attacking Goblin for each granted attack trigger", () => {
  let s = funds(position(["Den of the Bugbear"]), { R: 8 });
  card(s, "Den of the Bugbear").enteredTurn = 0;
  s = animate(animate(s, "Den of the Bugbear"), "Den of the Bugbear");
  s = settle(beginGoldfishCombat(s));
  const tokens = s.battlefield.filter(c => c.name === "Goblin");
  assert.equal(tokens.length, 2); assert.ok(tokens.every(c => c.tapped));
  s = settle(resolveGoldfishCombat(s)); assert.equal(s.players.opponent.life, 15);
});

test("Restless lands apply their colors, keywords and real attack effects", () => {
  let s = funds(position(["Restless Reef"]), { U: 4 });
  s = setGoldfishMana(s, "B", 1); card(s, "Restless Reef").enteredTurn = 0;
  s = animate(s, "Restless Reef");
  assert.deepEqual(gameColors(card(s, "Restless Reef"), s), ["U", "B"]);
  assert.ok(goldfishKeywords(s, card(s, "Restless Reef")).has("deathtouch"));
  s = settle(beginGoldfishCombat(s), [], c => c.type === "engine-target" ? { target: { player: "self" } } : null);
  assert.equal(s.graveyard.length, 4);
  let t = funds(position(["Restless Cottage"]), { B: 3, G: 1 });
  card(t, "Restless Cottage").enteredTurn = 0;
  t = moveGoldfishCards(t, t.library.at(-1).id, "graveyard");
  t = animate(t, "Restless Cottage");
  t = settle(beginGoldfishCombat(t), [], c => c.type === "engine-target" ? { target: ref(t.graveyard[0], "graveyard") } : null);
  assert.equal(t.battlefield.filter(c => c.name === "Food").length, 1); assert.equal(t.exile.length, 1);
});

test("Hydra requires positive X and Ba Sing Se earthbends with two counters and haste", () => {
  let s = funds(position(["Lair of the Hydra", "Ba Sing Se", "Forest"]), { G: 10 });
  assert.throws(() => animate(s, "Lair of the Hydra", { x: 0 }), /Xは1/);
  s = animate(s, "Lair of the Hydra", { x: 4 });
  assert.equal(goldfishCharacteristics(s, card(s, "Lair of the Hydra")).power, "4");
  s = settle(activateGoldfishAction(s, card(s, "Ba Sing Se").id, "engine:fp-ba-sing-se", { target: ref(card(s, "Forest")) }));
  assert.equal(goldfishCharacteristics(s, card(s, "Forest")).power, "2");
  assert.ok(goldfishKeywords(s, card(s, "Forest")).has("haste"));
});
