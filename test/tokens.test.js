import assert from "node:assert/strict";
import test from "node:test";

import { buildBulkObjects, objectsForSource, tokenHints } from "../lib/tokens.js";

const trackingCases = [
  ["Ascend without reminder", { keywords: ["Ascend"], oracle_text: "Ascend" }, "City's Blessing", /昇殿/],
  ["Ascend without keywords", { oracle_text: "Ascend" }, "City's Blessing", /都市の承認/],
  ["City's blessing condition", { oracle_text: "As long as you have the city's blessing, this creature gets +1/+1." }, "City's Blessing", /都市の承認/],
  ["Quantum Riddler", { keywords: ["Warp"], oracle_text: "Warp {1}{U}" }, "Warped card marker", /ワープ/],
  ["Warp without reminder", { oracle_text: "Warp {2}{W}" }, "Warped card marker", /ワープ/],
  ["Emeritus of Ideation // Ancestral Recall", { layout: "prepare", keywords: ["Prepared"], card_faces: [
    { name: "Emeritus of Ideation", oracle_text: "This creature enters prepared." },
    { name: "Ancestral Recall", type_line: "Instant", oracle_text: "Target player draws three cards." }
  ] }, "Prepared state marker", /準備済み/],
  ["Preparation granted by another card", { oracle_text: "Prepare target creature you control." }, "Prepared state marker", /準備済み/],
  ["The Celestus", { oracle_text: "If it's neither day nor night, it becomes day as The Celestus enters." }, "Day // Night", /昼夜/],
  ["Daybound without reminder", { keywords: ["Daybound"], oracle_text: "Daybound" }, "Day // Night", /昼夜/],
  ["Slickshot Show-Off", { oracle_text: "Plot {1}{R}" }, "Plot", /計画/],
  ["Aven Interrupter", { oracle_text: "When this creature enters, exile target spell. It becomes plotted." }, "Plot", /計画/],
  ["Abhorrent Oculus", { oracle_text: "At the beginning of each opponent's upkeep, manifest dread." }, "Manifest", /裏向き/],
  ["Morph without reminder", { oracle_text: "Morph {3}" }, "Morph", /裏向き/],
  ["Cloak without reminder", { oracle_text: "Cloak the top card of your library." }, "Cloaked card marker", /裏向き/]
];

for (const [name, raw, marker, hint] of trackingCases) {
  test(`preparation pipeline retains ${name} and explains its tracking helper`, async () => {
    assert.ok(tokenHints(raw).some(text => hint.test(text)), "tournament candidate filtering must retain the card");
    const warnings = [];
    const objects = await objectsForSource({ id: name, name, raw }, { warnings, enrichJapaneseAssets: false, resolveMissingHelpers: false });
    assert.deepEqual(objects.map(object => object.name), [marker]);
    assert.equal(objects[0].set, "HELPERS");
    assert.equal(objects[0].virtual, true);
    assert.ok(objects[0].note.length > 25);
    assert.deepEqual(warnings, []);
    if (raw.layout === "prepare") assert.ok(tokenHints(raw).includes("準備呪文: Ancestral Recall"));
  });
}

test("ordinary spell names and unprepared alone do not create tracking helpers", async () => {
  for (const text of ["Return Time Warp from your graveyard to your hand.", "This creature is unprepared.", "Manifestation Sage gets +1/+1.", "Serra Ascendant gets +1/+1."]) {
    assert.deepEqual(await objectsForSource({ id: text, name: "No tracker", raw: { oracle_text: text } }, { enrichJapaneseAssets: false, resolveMissingHelpers: false }), []);
  }
});

test("a prepared creature can still require physical copies from its prepare spell", async () => {
  const raw = { layout: "prepare", card_faces: [
    { name: "Prepared creature", oracle_text: "This creature enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)" },
    { name: "Restore Relic", type_line: "Sorcery", oracle_text: "Exile target artifact or creature card from your graveyard. Create a token that's a copy of it." }
  ] };
  const objects = await objectsForSource({ id: "prepared-copy", name: "Prepared creature", raw }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });
  assert.deepEqual(new Set(objects.map(object => object.name)), new Set(["Prepared state marker", "Copy token / copy marker"]));
});

test("mentioning tokens without creating them does not report missing objects", async () => {
  const texts = {
    "Rest in Peace": "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.",
    "Sheoldred's Edict": "Choose one —\n• Each opponent sacrifices a nontoken creature of their choice.\n• Each opponent sacrifices a creature token of their choice.\n• Each opponent sacrifices a planeswalker of their choice.",
    "Necrodominance": "Skip your draw step.\nIf a card or token would be put into your graveyard from anywhere, exile it instead.",
    "Belladonna Took": "Whenever a token you control enters, you gain 1 life if this is the first time this ability has resolved this turn. If it's the second time, draw a card. If it's the third time, put a +1/+1 counter on each creature you control."
  };
  for (const [name, text] of Object.entries(texts)) {
    const warnings = [];
    const objects = await objectsForSource({ id: name, name, raw: { oracle_text: text } }, { warnings, enrichJapaneseAssets: false, resolveMissingHelpers: false });
    assert.deepEqual(objects, [], name);
    assert.deepEqual(warnings, [], name);
  }
});

test("unresolved token generators still warn, including keywords without reminders", async () => {
  for (const text of ["Create two 1/1 red Goblin creature tokens.", "Investigate.", "Amass Orcs 1.", "Mobilize 2"]) {
    const warnings = [];
    await objectsForSource({ id: text, name: "Generator", raw: { oracle_text: text } }, { warnings, enrichJapaneseAssets: false, resolveMissingHelpers: false });
    assert.equal(warnings.length, 1, text);
    assert.match(warnings[0], /生成するトークン/);
  }
});

test("spell-copy reminder text does not request a copy marker", () => {
  const hints = tokenHints({
    oracle_text: "Create a 2/1 white and black Inkling creature token with flying. (You may cast a copy of its spell.)"
  });

  assert.ok(hints.some((hint) => hint.includes("Inkling creature token")));
  assert.ok(!hints.includes("Copy marker"));
});

test("physical token copies create a virtual copy marker", async () => {
  const objects = await objectsForSource({
    id: "copy-source",
    name: "Copy Source",
    set: "TST",
    setName: "Test Set",
    releasedAt: "2026-01-01",
    image: "",
    imageSource: "",
    imageSourceLabel: "",
    imageSourceUrl: "",
    scryfallUri: "https://scryfall.com/card/test/copy-source",
    raw: {
      oracle_text: "Create a token that's a copy of target creature you control."
    }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });

  assert.equal(objects.length, 1);
  assert.equal(objects[0].name, "Copy token / copy marker");
  assert.equal(objects[0].category, "コピー");
});

test("exile-tracking mechanics create virtual card markers", async () => {
  const baseSource = {
    set: "TST",
    setName: "Test Set",
    releasedAt: "2026-01-01",
    image: "",
    imageSource: "",
    imageSourceLabel: "",
    imageSourceUrl: "",
    scryfallUri: "https://scryfall.com/card/test/exile-source"
  };

  const airbend = await objectsForSource({
    ...baseSource,
    id: "airbend-source",
    name: "Airbend Source",
    raw: {
      oracle_text: "When this creature enters, airbend up to one target nonland permanent."
    }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });

  assert.equal(airbend.length, 1);
  assert.equal(airbend[0].name, "Airbent card marker");
  assert.equal(airbend[0].japaneseName, "エアベンド・カード・マーカー");

  const paradigm = await objectsForSource({
    ...baseSource,
    id: "paradigm-source",
    name: "Paradigm Source",
    raw: {
      oracle_text: "Paradigm (After this spell resolves, exile it. At the beginning of your first main phase, you may cast a copy of the exiled card.)"
    }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });

  assert.equal(paradigm.length, 1);
  assert.equal(paradigm[0].name, "Paradigm card marker");
  assert.equal(paradigm[0].japaneseName, "パラダイム・カード・マーカー");
});

test("recruit is hinted as a token maker but needs no virtual marker", async () => {
  const recruitText = "Whenever this creature enters or attacks, recruit. (Draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token.)";
  const hints = tokenHints({ oracle_text: recruitText });

  assert.ok(hints.includes("Recruit（人間・兵士トークン）"));
  // トークン本体は Scryfall の関連カード（all_parts）から出るため、仮想マーカーは作らない。
  const objects = await objectsForSource({
    id: "recruit-source",
    name: "Recruit Source",
    set: "TST",
    setName: "Test Set",
    releasedAt: "2026-08-14",
    image: "",
    imageSource: "",
    imageSourceLabel: "",
    imageSourceUrl: "",
    scryfallUri: "https://scryfall.com/card/test/recruit-source",
    raw: { oracle_text: recruitText }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });

  assert.deepEqual(objects, []);

  // 「Recruiter」等の語中一致では発火しない。
  const recruiterHints = tokenHints({
    oracle_text: "Search your library for a Goblin card, then shuffle. This Recruiter stays behind."
  });
  assert.ok(!recruiterHints.includes("Recruit（人間・兵士トークン）"));
});

test("storied requires its enduring-story helper while hone only needs counters", async () => {
  const baseSource = {
    set: "TST",
    setName: "Test Set",
    releasedAt: "2026-08-14",
    image: "",
    imageSource: "",
    imageSourceLabel: "",
    imageSourceUrl: "",
    scryfallUri: "https://scryfall.com/card/test/hob-source"
  };

  // 不朽の物語はプレイヤーの継続状態として準備する。
  const storied = await objectsForSource({
    ...baseSource,
    id: "storied-source",
    name: "Storied Source",
    raw: {
      oracle_text: "Storied (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, artifacts and creatures you control have ward {1}."
    }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });
  assert.deepEqual(storied.map(object => object.name), ["Enduring Story"]);

  // hone カウンターはサイコロ管理で足りる。
  const hone = await objectsForSource({
    ...baseSource,
    id: "hone-source",
    name: "Hone Source",
    raw: {
      oracle_text: "Whenever equipped creature attacks, put a hone counter on this Equipment. Equipped creature gets +1/+0 for each hone counter on this Equipment."
    }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });
  assert.deepEqual(hone, []);
});

test("buildBulkObjects deckCount does not saturate at the display deck cap", async () => {
  const makeDecks = (prefix, count) => Array.from({ length: count }, (_, i) => ({
    url: `https://decks.example/${prefix}-${i}`,
    title: `${prefix} deck ${i}`
  }));
  // search 側の findCardMentions と同じ形: decks は24件に切り詰め、deckCount は実数を持つ
  const makeSource = (id, deckCount, decks) => ({
    id,
    name: `Copy Source ${id}`,
    set: "TST",
    setName: "Test Set",
    releasedAt: "2026-01-01",
    image: "",
    imageSource: "",
    imageSourceLabel: "",
    imageSourceUrl: "",
    scryfallUri: `https://scryfall.com/card/test/${id}`,
    oracleText: "",
    tokenHints: [],
    deckCount,
    decks,
    sources: [`https://pages.example/${id}`],
    raw: {
      oracle_text: "Create a token that's a copy of target creature you control."
    }
  });

  const objects = await buildBulkObjects([
    makeSource("a", 60, makeDecks("a", 24)),
    makeSource("b", 30, makeDecks("b", 24)),
    makeSource("c", 10, makeDecks("a", 10))
  ], { enrichJapaneseAssets: false, resolveMissingHelpers: false });

  assert.equal(objects.length, 1);
  // 見えている一意URL 48件（a24 + b24、c は全URLが a と重複）+ 切り詰めあふれ分 36（a）+ 6（b）= 90
  assert.equal(objects[0].deckCount, 90);
  // 表示用 decks は36件のまま切り詰められ、deckCount はそれに引きずられない
  assert.equal(objects[0].decks.length, 36);
  assert.equal(objects[0].sourceCards.length, 3);
});

test("spell-copy annotation alone creates no virtual object", async () => {
  const objects = await objectsForSource({
    id: "spell-copy-source",
    name: "Spell Copy Source",
    set: "TST",
    setName: "Test Set",
    releasedAt: "2026-01-01",
    image: "",
    imageSource: "",
    imageSourceLabel: "",
    imageSourceUrl: "",
    scryfallUri: "https://scryfall.com/card/test/spell-copy-source",
    raw: {
      oracle_text: "(You may cast a copy of its spell.)"
    }
  }, { enrichJapaneseAssets: false, resolveMissingHelpers: false });

  assert.deepEqual(objects, []);
});
