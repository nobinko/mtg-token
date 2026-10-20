import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, nextGoldfishTurn } from "../public/goldfish.js";
import { castGoldfishCard, planGoldfishCastPayment, setGoldfishMana } from "../public/goldfish-mana.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
import { makeGameToken } from "../public/goldfish-events.js";
import { TOKENS } from "../public/goldfish-card-programs.js";
import { goldfishCharacteristics } from "../public/goldfish-rules.js";
import { settle } from "./helpers/goldfish-pilot.js";
import { route } from "./helpers/goldfish-route.js";
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/goldfish-public-20261020.json", import.meta.url)));
const card = (s, n, z = "battlefield") => s[z].find(c => c.name === n);
const put = (s, n, z = "hand") => moveGoldfishCards(s, card(s, n, "library").id, z);
const cast = (s, n, options = {}) => settle(castGoldfishCard(s, card(s, n, "hand").id, options));
// Focused regression positions below deliberately isolate the bug; full real
// 60/15 routes and natural public-browser runs are recorded separately.
function position(names, mana = {}) {
  const rows = Object.entries(names).map(([name, count]) => ({ name, count }));
  rows.push({ name: "Mountain", count: 60 - rows.reduce((n, c) => n + c.count, 0) });
  let s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, fixture.metadata), { random: () => .5 }));
  s = moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
  for (const [color, count] of Object.entries(mana)) s = setGoldfishMana(s, color, count);
  return s;
}
test("public Demand Answers pays exactly one discard before drawing two", () => {
  let s = put(put(position({ "Demand Answers": 1, Boltwave: 1 }, { R: 2 }), "Demand Answers"), "Boltwave");
  const discard = ref(card(s, "Boltwave", "hand"), "hand");
  s = cast(s, "Demand Answers", { format: { cards: [discard] } });
  assert.equal(s.hand.length, 2);
  assert.ok(card(s, "Boltwave", "graveyard"));
  assert.ok(card(s, "Demand Answers", "graveyard"));
  assert.equal(s.manaPool.R, 0);
});
test("an artifact cannot pay Demand Answers sacrifice and mana twice; failed payment is atomic", () => {
  let s = put(position({ "Demand Answers": 1 }, { R: 1 }), "Demand Answers");
  const [treasure] = makeGameToken(s, TOKENS.treasure);
  const options = { format: { cards: [ref(treasure)] } }, before = structuredClone(s);
  assert.equal(planGoldfishCastPayment(s, card(s, "Demand Answers", "hand"), options).payable, false);
  assert.throws(() => cast(s, "Demand Answers", options), /マナ/);
  assert.deepEqual(s, before);
  s = cast(setGoldfishMana(s, "R", 2), "Demand Answers", options);
  assert.equal(s.battlefield.length, 0);
  assert.equal(s.hand.length, 2);
  assert.equal(s.rules.artifactsSacrificed, 1);
});
test("Oracle automatically uses one Petal and an Island, retaining the other Petal", () => {
  let s = position({ "Lotus Petal": 2, "Thassa's Oracle": 1, "Underground Sea": 1 });
  s = put(put(put(put(s, "Lotus Petal", "battlefield"), "Lotus Petal", "battlefield"), "Underground Sea", "battlefield"), "Thassa's Oracle");
  const plan = planGoldfishCastPayment(s, card(s, "Thassa's Oracle", "hand"));
  assert.equal(plan.payable, true);
  assert.equal(plan.sacrifices, 1);
  s = cast(s, "Thassa's Oracle");
  assert.equal(s.battlefield.filter(c => c.name === "Lotus Petal").length, 1);
  assert.equal(s.graveyard.filter(c => c.name === "Lotus Petal").length, 1);
  assert.equal(card(s, "Underground Sea").tapped, true);
});
test("auto payment preserves consumables when reusable lands suffice and respects tapped Treasures", () => {
  let s = put(put(position({ Boltwave: 1 }), "Boltwave"), "Mountain", "battlefield");
  makeGameToken(s, TOKENS.treasure);
  assert.equal(planGoldfishCastPayment(s, card(s, "Boltwave", "hand")).sacrifices, 0);
  card(s, "Mountain").tapped = true;
  card(s, "Treasure").tapped = true;
  assert.equal(planGoldfishCastPayment(s, card(s, "Boltwave", "hand")).payable, false);
  card(s, "Treasure").tapped = false;
  s = cast(s, "Boltwave");
  assert.equal(s.players.opponent.life, 17);
  assert.equal(s.battlefield.some(c => c.name === "Treasure"), false);
});
test("a tapped Lotus Petal cannot be used by automatic payment", () => {
  let s = put(put(position({ "Lotus Petal": 1, Boltwave: 1 }), "Lotus Petal", "battlefield"), "Boltwave");
  card(s, "Lotus Petal").tapped = true;
  assert.equal(planGoldfishCastPayment(s, card(s, "Boltwave", "hand")).payable, false);
  const before = structuredClone(s);
  assert.throws(() => cast(s, "Boltwave"), /マナ/);
  assert.deepEqual(s, before);
  card(s, "Lotus Petal").tapped = false;
  s = cast(s, "Boltwave");
  assert.equal(s.players.opponent.life, 17);
  assert.ok(card(s, "Lotus Petal", "graveyard"));
});
test("Plasma Bolt uses nonland departures, including the Treasure used to pay it, and resets each turn", () => {
  let s = put(position({ "Plasma Bolt": 3 }, { R: 1 }), "Plasma Bolt");
  s = cast(s, "Plasma Bolt", { target: { player: "opponent" } });
  assert.equal(s.players.opponent.life, 18);
  s = put(s, "Plasma Bolt");
  makeGameToken(s, TOKENS.treasure);
  s = cast(s, "Plasma Bolt", { target: { player: "opponent" } });
  assert.equal(s.players.opponent.life, 15);
  s = settle(nextGoldfishTurn(s));
  s = put(s, "Plasma Bolt");
  s = cast(setGoldfishMana(s, "R", 1), "Plasma Bolt", { target: { player: "opponent" } });
  assert.equal(s.players.opponent.life, 13);
});
test("four noncreature casts make four tapped Treasures, sacrifice Enemies and deal seven once", () => {
  let s = put(position({ "Death to Our Enemies": 1, Boltwave: 4 }, { R: 7 }), "Death to Our Enemies");
  s = cast(s, "Death to Our Enemies");
  for (let i = 0; i < 4; i++) {
    s = cast(put(s, "Boltwave"), "Boltwave");
    if (i < 3) assert.equal(card(s, "Death to Our Enemies").counters.plan, i + 1);
  }
  assert.ok(card(s, "Death to Our Enemies", "graveyard"));
  assert.equal(s.players.opponent.life, 1);
  assert.equal(s.battlefield.filter(c => c.name === "Treasure" && c.tapped).length, 4);
});
test("Fantasticar counts earlier casts that turn and creates four fixed 4/4 flying haste Constructs", () => {
  let s = put(position({ "The Fantasticar": 1, "Lotus Petal": 3 }, { C: 3 }), "The Fantasticar");
  s = cast(s, "The Fantasticar");
  for (let i = 0; i < 3; i++) {
    s = cast(put(s, "Lotus Petal"), "Lotus Petal");
    if (i < 2) assert.ok(card(s, "The Fantasticar"));
  }
  assert.ok(card(s, "The Fantasticar", "graveyard"));
  const constructs = s.battlefield.filter(c => c.name === "Construct");
  assert.equal(constructs.length, 4);
  assert.ok(constructs.every(c => c.power === "4" && c.toughness === "4" && c.oracleText === "Flying, haste"));
  assert.ok(constructs.every(c => goldfishCharacteristics(s, c).power === "4" && goldfishCharacteristics(s, c).toughness === "4"));
  const [sagaConstruct] = makeGameToken(s, TOKENS.construct);
  assert.equal(goldfishCharacteristics(s, sagaConstruct).power, "8");
  assert.ok(constructs.every(c => goldfishCharacteristics(s, c).power === "4"));
});
test("Avengers both modes damage creatures and replace the chosen own land with a tapped basic", () => {
  let s = put(put(put(position({ "Avengers Disassembled": 1, "Iron-Shield Elf": 1 }, { R: 3 }), "Avengers Disassembled"), "Iron-Shield Elf", "battlefield"), "Mountain", "battlefield");
  s = cast(s, "Avengers Disassembled", { format: { modes: "3", target1: [ref(card(s, "Mountain"), "battlefield")] } });
  assert.ok(card(s, "Iron-Shield Elf", "graveyard"));
  assert.equal(s.battlefield.filter(c => c.name === "Mountain").length, 1);
  assert.equal(card(s, "Mountain").tapped, true);
});
for (const post of [false, true]) test(`public real Pioneer 60/15 wins with discard/Monument/Parhelion ${post ? "postboard" : "main"}`, () => {
  const opening = ["Godless Shrine", "Swamp", "Plains", "Iron-Shield Elf", "Greasefang, Okiba Boss", "Parhelion II", post ? "Bitter Triumph" : "Monument to Endurance"];
  const r = route(3, opening, [], post ? { "Fatal Push": -1, "Bitter Triumph": 1 } : {}, () => null, fixture);
  r.cast("Godless Shrine"); r.next(); r.cast("Swamp"); r.cast("Iron-Shield Elf");
  r.act("Iron-Shield Elf", "engine:discard-indestructible", { costCards: [r.ref("Parhelion II", "hand")] });
  r.next(); r.cast("Plains"); r.cast("Greasefang, Okiba Boss"); r.attack();
  assert.equal(r.s.players.opponent.life, 4);
  r.next();
  if (post) r.cast("Bitter Triumph", { extraCost: "discard", costCards: [r.ref("Parhelion II", "hand")], target: { player: "opponent", virtual: true } });
  else r.act("Iron-Shield Elf", "engine:discard-indestructible", { costCards: [r.ref("Parhelion II", "hand")] });
  r.attack();
  assert.ok(r.s.players.opponent.life <= 0);
});
