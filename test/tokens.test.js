import assert from "node:assert/strict";
import test from "node:test";

import { objectsForSource, tokenHints } from "../lib/tokens.js";

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
