import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TOKENS } from "../public/goldfish-card-programs.js";
import { makeGameToken } from "../public/goldfish-events.js";
import { createGoldfishGame, keepGoldfishHand } from "../public/goldfish.js";
import { setGoldfishMana, castGoldfishCard } from "../public/goldfish-mana.js";
import { activateGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishAttackers } from "../public/goldfish-combat.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { settle } from "./helpers/goldfish-pilot.js";
import { moveGoldfishCards } from "../public/goldfish.js";
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/goldfish-standard-top10.json", import.meta.url)));
function game() { return keepGoldfishHand(createGoldfishGame(mergeCardMetadata([{ name: "Forest", count: 59 }, { name: "Obsessive Pursuit", count: 1 }], fixture.metadata), { random: () => .5 })); }

test("every named automatic token reference has a real definition, never the default 1/1 creature", () => {
  for (const file of fs.readdirSync(new URL("../public/", import.meta.url)).filter(n => /^goldfish.*\.js$/.test(n))) {
    const source = fs.readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
    const keys = [...source.matchAll(/TOKENS\.(\w+)|\btoken\("([^"]+)"|op:\s*"(?:optional-)?token",\s*name:\s*"([^"]+)"/g)].map(m => m[1] || m[2] || m[3]);
    for (const key of keys) assert.ok(TOKENS[key]?.name && TOKENS[key]?.typeLine, `${file}: missing ${key}`);
  }
});
test("Pursuit creates a noncreature Clue with a working two-mana draw and sacrifice; it does not need to tap", () => {
  let s = game(), c = [...s.hand, ...s.library].find(c => c.name === "Obsessive Pursuit");
  if (!s.hand.includes(c)) s = moveGoldfishCards(s, c.id, "hand");
  s = settle(castGoldfishCard(setGoldfishMana(setGoldfishMana(s, "B", 1), "G", 3), c.id));
  const clue = s.battlefield.find(c => c.name === "Clue");
  assert.ok(clue); assert.equal(clue.typeLine, "Token Artifact — Clue");
  assert.equal(goldfishAttackers(s).length, 0);
  clue.tapped = true;
  const hand = s.hand.length;
  s = settle(activateGoldfishAction(s, clue.id, "engine:clue"));
  assert.equal(s.hand.length, hand + 1); assert.ok(!s.battlefield.some(c => c.id === clue.id));
  assert.equal(s.rules.permanentsSacrificed, 1);
});
test("Scions are 1/1 and can be sacrificed for colorless mana on the turn they entered", () => {
  let s = game();
  const scion = makeGameToken(s, TOKENS.scion)[0];
  assert.equal(scion.power, "1"); assert.equal(scion.name, "Eldrazi Scion");
  s = settle(activateGoldfishAction(s, scion.id, "engine:spawn-mana"));
  assert.equal(s.manaPool.C, 1); assert.ok(!s.battlefield.some(c => c.id === scion.id));
});
