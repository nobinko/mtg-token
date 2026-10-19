import assert from "node:assert/strict";
import test from "node:test";
import { auxiliaryRules, auxiliaryRulesFor, isPreparationRelatedObject } from "../lib/auxiliary.js";
import { finderCandidateQuery, finderCandidateQueries } from "../lib/scryfall.js";
import { objectsForSource, buildBulkObjects, tokenHints } from "../lib/tokens.js";
import { preparationKey, preparedRecord, setPrepared, migratePreparedRecords, tokenSignature } from "../public/object-identity.js";
import { stockTokenProduct, tokenPrintRank } from "../lib/token-prints.js";

const noNetwork = { enrichJapaneseAssets: false, resolveMissingHelpers: false };
const source = raw => ({ id: raw.id || "source", name: raw.name || "Source", set: "TST", sources: [], raw });
const cases = [
  ["monarch", "When this creature enters, you become the monarch."],
  ["initiative", "When this creature enters, you take the initiative."],
  ["enduring-story", "Storied\nAs long as you have an enduring story, you have hexproof."],
  ["energy", "When this creature enters, you get {E}{E}."],
  ["poison", "Toxic 1"],
  ["experience", "Whenever a creature you control dies, you get an experience counter."],
  ["radiation", "Each player gets two rad counters."],
  ["ring", "Draw a card. The Ring tempts you."],
  ["foretell", "Foretell {1}{W}"],
  ["adventure", "You may cast this card on an Adventure."],
  ["plot", "Exile target spell. It becomes plotted."],
  ["manifest", "Manifest dread."],
  ["morph", "Megamorph {2}{G}"],
  ["cloak", "Cloak the top card of your library."],
  ["disguise", "Disguise {1}{B}"],
  ["day-night", "If it's neither day nor night, it becomes day."],
  ["speed", "Start your engines!"],
  ["companion", "Companion — Each permanent card in your starting deck has mana value 2 or less."],
  ["storm", "Storm"],
  ["gravestorm", "Gravestorm"],
  ["unearth", "Unearth {2}{B}"],
  ["dash", "Dash {R}"],
  ["blitz", "Blitz {1}{B}"],
  ["phasing", "Target creature phases out."],
  ["champion", "Champion a Faerie"],
  ["suspend", "Suspend 3—{G}"],
  ["rebound", "Rebound"],
  ["hideaway", "Hideaway 4"],
  ["imprint", "Imprint — You may exile a card from your hand."],
  ["cipher", "Cipher"],
  ["haunt", "Haunt"],
  ["exert", "You may exert this creature as it attacks."],
  ["exhaust", "Exhaust — {2}: Draw a card."],
  ["monstrous", "Monstrosity 2"],
  ["renowned", "Renown 1"],
  ["suspected", "Suspect target creature."],
  ["solved", "To solve — You control three artifacts."],
  ["goad", "Goad target creature."],
  ["detain", "Detain target creature."],
  ["soulbond", "Soulbond"],
  ["room", "When you unlock this door, draw a card."]
];

test("state rules reach hints, output and the live candidate query", async () => {
  const query = finderCandidateQuery("modern");
  const queries = finderCandidateQueries("modern");
  for (const chunk of queries) {
    assert.ok(chunk.length <= 850);
    assert.ok(chunk.startsWith("legal:modern game:paper (") && chunk.endsWith(")"));
  }
  assert.match(query, /^legal:modern game:paper /);
  for (const rule of auxiliaryRules) {
    assert.ok(rule.search.length, rule.id);
    for (const term of rule.search) assert.ok(query.includes(term) && queries.some(chunk => chunk.includes(term)), `${rule.id}: ${term}`);
  }
  for (const [id, oracle_text] of cases) {
    const raw = { oracle_text };
    assert.ok(tokenHints(raw).length, id);
    const objects = await objectsForSource(source(raw), noNetwork);
    assert.deepEqual(objects.map(object => object.auxiliaryId), [id], id);
    assert.ok(objects[0].japaneseName && objects[0].note, id);
  }
  for (const layout of ["transform", "modal_dfc", "meld"]) {
    assert.deepEqual(auxiliaryRulesFor({ layout }).map(rule => rule.id), ["substitute"]);
  }
  assert.deepEqual(auxiliaryRulesFor({ type_line: "Enchantment — Class" }).map(rule => rule.id), ["class"]);
  assert.deepEqual(auxiliaryRulesFor({ type_line: "Enchantment — Room" }).map(rule => rule.id), ["room"]);
  assert.deepEqual(auxiliaryRulesFor({ type_line: "Enchantment — Case" }).map(rule => rule.id), ["solved"]);
});

test("Undercity's ordinary inverted frame is available while collectible inverted tokens stay excluded", () => {
  const sets = new Map([
    ["tclb", { code: "tclb", set_type: "token", parent_set_code: "clb" }],
    ["clb", { code: "clb", set_type: "draft_innovation" }]
  ]);
  const card = { name: "Undercity // The Initiative", set: "tclb", type_line: "Dungeon — Undercity // Card", games: ["paper"], frame_effects: ["inverted"] };
  assert.equal(tokenPrintRank(card, sets), 0);
  assert.equal(stockTokenProduct(card, sets, { format: "legacy" }).code, "clb");
  assert.equal(stockTokenProduct(card, sets, { format: "modern" }), null);
  assert.equal(tokenPrintRank({ ...card, name: "Treasure", type_line: "Token Artifact — Treasure" }, sets), 2);
  assert.equal(tokenPrintRank({ ...card, promo: true }, sets), 2);
});

test("ordinary venture offers exactly the three AFR dungeons, initiative only Undercity", async () => {
  const ordinary = await objectsForSource(source({ oracle_text: "Venture into the dungeon." }), noNetwork);
  assert.deepEqual(ordinary.map(object => object.auxiliaryId), ["dungeon-mad-mage", "dungeon-lost-mine", "dungeon-tomb"]);
  const initiative = await objectsForSource(source({ oracle_text: "Venture into Undercity." }), noNetwork);
  assert.deepEqual(initiative.map(object => object.auxiliaryId), ["initiative"]);
  assert.equal(isPreparationRelatedObject({ name: "Baldur's Gate Wilderness", type_line: "Dungeon" }), false);
});

test("Card and Creature helpers are accepted, ordinary combo pieces and mini-games are not", () => {
  for (const name of ["The Monarch", "Energy Reserve", "Plot", "Enduring Story"]) {
    assert.equal(isPreparationRelatedObject({ name, type_line: "Card", component: "combo_piece" }), true);
  }
  for (const name of ["Manifest", "Morph"]) assert.equal(isPreparationRelatedObject({ name, type_line: "Creature", component: "combo_piece" }), true);
  for (const card of [
    { name: "Ocelot Pride", type_line: "Creature — Cat" },
    { name: "Booster Blitz", type_line: "Card" },
    { name: "Ad Card", type_line: "Card" },
    { name: "Plot", type_line: "Sorcery" }
  ]) assert.equal(isPreparationRelatedObject({ ...card, component: "combo_piece" }), false);
});

test("default reference lookup fills missing links, recursively finds dungeon tokens, and avoids reminder backlinks", async t => {
  const cards = new Map();
  const add = (id, name, type_line, extra = {}) => {
    const card = { id, name, type_line, games: ["paper"], set: "tst", ...extra };
    cards.set(id, card);
    return { id, name, type_line, component: /Token/.test(type_line) ? "token" : "combo_piece", uri: `https://api.scryfall.com/cards/${id}` };
  };
  const treasure = add("aux-test-treasure", "Treasure", "Token Artifact — Treasure");
  const skeleton = add("aux-test-skeleton", "Skeleton", "Token Creature — Skeleton", { power: "4", toughness: "1", oracle_text: "Menace" });
  const unrelated = { name: "Unrelated token", type_line: "Token Creature", component: "token", uri: "https://api.scryfall.com/cards/must-not-fetch" };
  for (const id of ["monarch", "initiative", "energy", "manifest", "plot", "enduring-story"]) {
    const rule = auxiliaryRules.find(rule => rule.id === id);
    add(rule.referenceId, rule.name, id === "initiative" ? "Dungeon — Undercity // Card" : id === "manifest" ? "Creature" : "Card", {
      oracle_text: id === "manifest" ? "If the card has morph, you can turn it face up for its morph cost." : "",
      all_parts: id === "initiative" ? [treasure, skeleton, { name: "Ordinary source", type_line: "Creature", component: "combo_piece", uri: "https://api.scryfall.com/cards/must-not-fetch" }] : [unrelated]
    });
  }
  const requested = [];
  t.mock.method(globalThis, "fetch", async input => {
    const id = new URL(input).pathname.split("/").at(-1);
    requested.push(id);
    assert.ok(cards.has(id), `unexpected graph traversal: ${input}`);
    return Response.json(cards.get(id));
  });
  const options = { enrichJapaneseAssets: false, warnings: [] };
  for (const id of ["monarch", "energy", "manifest", "plot", "enduring-story"]) {
    const text = cases.find(item => item[0] === id)[1];
    const objects = await objectsForSource(source({ oracle_text: text }), options);
    assert.equal(objects.length, 1, id);
    assert.equal(objects[0].auxiliaryId, id);
    assert.ok(!objects[0].virtual, id);
  }
  const objects = await objectsForSource(source({ oracle_text: "Take the initiative." }), options);
  assert.deepEqual(objects.map(object => object.name).sort(), ["Skeleton", "Treasure", "Undercity // The Initiative"]);
  assert.equal(requested.filter(id => id === treasure.id).length, 1);
  assert.deepEqual(options.warnings, []);

  const raw = { oracle_text: "It becomes plotted." };
  const rule = auxiliaryRules.find(rule => rule.id === "plot");
  const physicalPart = { name: rule.name, type_line: "Card", uri: `https://api.scryfall.com/cards/${rule.referenceId}` };
  const aggregated = await buildBulkObjects([
    { ...source(raw), deckUrls: ["deck-a"], deckCount: 1 },
    { ...source({ ...raw, all_parts: [physicalPart] }), deckUrls: ["deck-a", "deck-b"], deckCount: 2 }
  ], noNetwork);
  assert.equal(aggregated.length, 1, "physical and fallback helpers must merge");
  assert.equal(aggregated[0].deckCount, 2);
  assert.equal(aggregated[0].sourceCards.length, 2);
  assert.ok(!aggregated[0].virtual);
});

test("permanent spell copies and copy keywords need physical markers; instant copies do not", async () => {
  for (const oracle_text of [
    "Whenever you cast an artifact spell, you may pay {1}. If you do, copy it.",
    "Copy target permanent spell you control.", "Myriad", "Encore {3}", "Populate.", "Squad {2}"
  ]) {
    const objects = await objectsForSource(source({ oracle_text }), noNetwork);
    assert.ok(objects.some(object => object.name === "Copy token / copy marker"), oracle_text);
  }
  for (const oracle_text of ["Copy target instant or sorcery spell.", "Whenever you cast an instant or sorcery spell, copy it.", "(You may cast a copy of its spell.)"]) {
    assert.deepEqual(await objectsForSource(source({ oracle_text }), noNetwork), [], oracle_text);
  }
});

test("names, numeric counters, and Omen do not invent state reminders", async () => {
  for (const raw of [
    { name: "Haunted Ridge", oracle_text: "Haunted Ridge enters tapped unless you control two or more other lands." },
    { name: "Unearth", oracle_text: "Return target creature card with mana value 3 or less from your graveyard to the battlefield. Cycling {2}" },
    { oracle_text: "Put a +1/+1 counter and a stun counter on target creature." },
    { layout: "omen", oracle_text: "Draw a card. (Then shuffle this card into its owner's library.)" },
    { oracle_text: "Put a hone counter on this Equipment." },
    { oracle_text: "Spells you cast this turn cost {1} less to cast." },
    { name: "Monstrous War-Leech", oracle_text: "Monstrous War-Leech's power is equal to the greatest mana value among cards in your graveyard." },
    { name: "Chameleon, Master of Disguise", oracle_text: "Chameleon, Master of Disguise becomes a copy of target creature." },
    { name: "Front // O-Kagachi Made Manifest", card_faces: [{ name: "O-Kagachi Made Manifest", oracle_text: "O-Kagachi Made Manifest is all colors." }] }
  ]) assert.deepEqual(await objectsForSource(source(raw), noNetwork), []);
});

test("a copy marker cannot hide a missing named token from the same source", async () => {
  const warnings = [];
  const objects = await objectsForSource(source({ oracle_text: "Create a 1/1 white Cat creature token. Then create a token that's a copy of target creature." }), { ...noNetwork, warnings });
  assert.ok(objects.some(object => object.name === "Copy token / copy marker"));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /生成するトークン/);
});

test("helper preparation survives fallback/physical transitions and old checks without conflating face-down methods", () => {
  const legacy = { virtual: true, name: "Day/Night marker", typeLine: "Marker helper", set: "HELPERS" };
  const current = { name: "Day // Night", typeLine: "Card // Card", auxiliaryId: "day-night", oracleId: "day", set: "VOW", legacyHelperNames: ["Day/Night marker"] };
  const records = new Map();
  setPrepared(legacy, records, true);
  assert.equal(preparedRecord(current, records).set, "HELPERS");
  assert.equal(migratePreparedRecords([current], new Set(), records), true);
  assert.equal(preparationKey(current), preparationKey({ ...current, virtual: true }));
  setPrepared(current, records, false);
  assert.equal(preparedRecord(current, records), null, "old records must not resurrect a cleared check");
  assert.notEqual(preparationKey({ auxiliaryId: "manifest" }), preparationKey({ auxiliaryId: "cloak" }));

  const oldPhysical = { ...current, auxiliaryId: undefined };
  const oldPhysicalKey = `prep:physical:${JSON.stringify([oldPhysical.oracleId, tokenSignature(oldPhysical)])}`;
  const physicalRecords = new Map([[oldPhysicalKey, { picked: true, set: "VOW" }]]);
  assert.equal(migratePreparedRecords([current], new Set(), physicalRecords), true);
  assert.equal(preparedRecord(current, physicalRecords).set, "VOW");
});
