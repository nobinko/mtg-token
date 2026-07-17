import assert from "node:assert/strict";
import test from "node:test";

import { buildBulkObjects, objectsForSource, tokenHints } from "../lib/tokens.js";

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
  }, { enrichJapaneseAssets: false });

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
  }, { enrichJapaneseAssets: false });

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
  }, { enrichJapaneseAssets: false });

  assert.equal(paradigm.length, 1);
  assert.equal(paradigm[0].name, "Paradigm card marker");
  assert.equal(paradigm[0].japaneseName, "パラダイム・カード・マーカー");
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
  ], { enrichJapaneseAssets: false });

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
  }, { enrichJapaneseAssets: false });

  assert.deepEqual(objects, []);
});
